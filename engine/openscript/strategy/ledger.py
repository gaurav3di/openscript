"""The strategy's own order and fill ledger, ``stdlib.md`` 17.7.

**Each strategy owns one.** It is the strategy's record of what it has actually
done, it is what every position figure in the language is folded from, and it is
per strategy rather than per account because an account position is shared with
every other strategy and every manual trade in the same contract.

**Nothing is read from a host's position row.** The engine is neither handed one
nor asks for one. What it reads back is what it sent and what the destination
said became of it, which is the only record whose owner is this strategy.

**Frames fold at a bar boundary**, never during an execution, so every position
fact is constant for the length of one execution and a re-execution of a moving
bar sees exactly what the first execution saw (``host-interface.md`` 7.4). The
intake takes one frame, returns nothing and is the only way in.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

from ..diagnostics import Diagnostic
from .calls import call_of
from .intents import Identity, IntentBar, OrderFrame, OrderIntent
from .placing import intent_for, orders_for
from .positions import Positions
from .refusals import SentOnBar, refusal_in_call, refusal_in_order
from .rows import UNKNOWN_INTENT, FrameOutcome, LedgerRow, Reduction, fold_frame
from .statuses import PLACED


@dataclass(frozen=True)
class LedgerOptions:
    """What the declaration and the chart fix before bar 0."""

    instrument: Identity = Identity()
    product: str = "intraday"
    qty_type: str = "units"
    declared_qty: float = 1.0
    #: The instrument's tick size, absent where the host states none, so a price
    #: is refused against nothing rather than against a default.
    tick_size: Optional[float] = None
    #: Entries allowed in one direction before one is refused.
    pyramiding: float = 1.0


@dataclass(frozen=True)
class PlacedCall:
    """What one order call sent, or why it sent nothing.

    The two are exclusive, and that is the shape rather than an accident: a
    refused call mints no id, appends no row and returns no intent.
    """

    intents: Tuple[OrderIntent, ...] = ()
    refusal: Optional[Diagnostic] = None


class _Context:
    """What the mapping and the refusals are handed for one bar.

    A view rather than the ledger itself, so that the two files reading it state
    what they read: the declaration, the leg, and the rows of this ledger.
    """

    def __init__(self, ledger: "Ledger", bar: IntentBar) -> None:
        options = ledger.options
        self.instrument = options.instrument
        self.product = options.product
        self.qty_type = options.qty_type
        self.declared_qty = options.declared_qty
        self.tick_size = options.tick_size
        self.pyramiding = options.pyramiding
        self.bar = bar
        self._ledger = ledger

    def size(self) -> float:
        return self._ledger.size()

    def size_of(self, ref: int) -> float:
        return self._ledger.size_of(ref)

    def avg_price(self) -> Optional[float]:
        return self._ledger.avg_price()

    def mint(self) -> int:
        return self._ledger.mint()

    def rows(self) -> Sequence[LedgerRow]:
        return self._ledger.rows()


class Ledger:
    """One strategy's rows, its position book, and the frames it has been handed."""

    def __init__(self, options: LedgerOptions = LedgerOptions()) -> None:
        self.options = options
        self._by_intent: Dict[int, LedgerRow] = {}
        self._placed: List[LedgerRow] = []
        self._positions = Positions()
        self._waiting: List[OrderFrame] = []
        self._next = 1
        #: The bar ``_sent`` describes, so the list empties when a new one begins.
        self._at = -1
        self._sent: List[SentOnBar] = []

    # -- what a bar sends ---------------------------------------------------

    def place(self, name: str, args: Sequence[Any], bar: IntentBar, position: Any) -> PlacedCall:
        """Step 9 sent an order call. It becomes intents, and each becomes a row.

        A row is appended when the order is sent, at ``placed``, which is the
        engine's own status: an intent has left and nothing has come back.

        **The whole call is read, mapped and refused before any of it is sent.**
        Every order the call produces is held against the refusals first, and only
        then does any of them take an id, so a call that sends two sends both or
        neither.
        """
        if bar.index != self._at:
            self._at = bar.index
            self._sent = []

        ctx = _Context(self, bar)
        call = call_of(name, args, position)
        refused = refusal_in_call(call, ctx)
        if refused is not None:
            return PlacedCall(refusal=refused)

        orders = orders_for(call, ctx)
        for order in orders:
            bad = refusal_in_order(call, order, ctx, self._sent)
            if bad is not None:
                return PlacedCall(refusal=bad)

        intents: List[OrderIntent] = []
        for order in orders:
            intent_id = self._next
            self._next += 1
            intent = intent_for(order.placement, intent_id, ctx)
            intents.append(intent)
            # Only an order that places one appends a row: a cancellation and a
            # bracket carry an id a host can quote and nothing has been ordered
            # by either. What a cancellation does to an order, and what a
            # bracket's level does when it is reached, both arrive as frames.
            placement = order.placement
            if placement.kind == "place" and placement.side is not None:
                self._append(intent, bar, order.reduces)
                # One entry per appended row, in the same order, which is what
                # lets a refused bar take back exactly the orders it appended.
                self._sent.append(SentOnBar(call.name, position.line, placement.side))
        return PlacedCall(intents=tuple(intents))

    def discard(self, from_row: int) -> None:
        """The bar sent nothing after all: every row it appended is taken back.

        A refusal anywhere on a bar hands none of the bar's orders over, because
        every call is mapped before any of them is routed, so the rows of the
        calls that had already been mapped have to go too. Otherwise the ledger
        reports an order at ``placed`` with an empty reference that no destination
        was ever handed, and a host reconciling after a stopped run sees an order
        it never received.

        Taken back rather than never written, because a row has to be there while
        the rest of the bar is mapped: a cancellation asks whether a tag names a
        working order, pyramiding counts what a position already holds, and a
        close measures what one tag entered.

        The intent ids the bar minted are not reissued. An id is unique within a
        run, a frame that quoted one must never match a later order, and a gap in
        the numbering is invisible to a host.
        """
        dropped = len(self._placed) - from_row
        if dropped <= 0:
            return
        for row in self._placed[from_row:]:
            self._by_intent.pop(row.intent_id, None)
        del self._placed[from_row:]
        del self._sent[max(0, len(self._sent) - dropped):]

    # -- what the destination answers ---------------------------------------

    def deliver(self, frame: OrderFrame) -> None:
        """A frame from the destination, held until the next bar boundary."""
        self._waiting.append(frame)

    def settle(self) -> Tuple[FrameOutcome, ...]:
        """Folds every frame that has arrived, in the order it arrived in.

        A host does not have to put its frames in order before it sends them. A
        repeat, a pair that crossed in flight and one that arrives after the order
        ended are ordinary traffic, and the fold is what says what each does.
        """
        if not self._waiting:
            return ()
        frames = self._waiting
        self._waiting = []
        outcomes: List[FrameOutcome] = []
        for frame in frames:
            row = self._by_intent.get(frame.intent_id)
            if row is None:
                # Step 1. It is not an order this strategy placed. Refused and
                # recorded, and nothing is folded.
                outcomes.append(FrameOutcome(intent_id=frame.intent_id, refused=UNKNOWN_INTENT))
                continue
            outcome = fold_frame(row, frame)
            # Step 6, and the reason the row carries a position reference: the
            # fill settles the position that order belongs to and not whichever
            # position the leg holds now.
            if outcome.delta > 0 and outcome.price is not None:
                units = outcome.delta if row.side == "buy" else -outcome.delta
                self._positions.settle(row.position_ref, units, outcome.price)
            outcomes.append(outcome)
        return tuple(outcomes)

    # -- what a script reads ------------------------------------------------

    def size(self) -> float:
        """The leg's net position in units, ``0`` while flat."""
        return self._positions.size()

    def size_of(self, ref: int) -> float:
        """The settled size of one position reference."""
        return self._positions.size_of(ref)

    def avg_price(self) -> Optional[float]:
        """The average price of the open position, absent while flat."""
        return self._positions.avg_price()

    def mint(self) -> int:
        """A fresh position reference."""
        return self._positions.mint()

    def rows(self) -> Sequence[LedgerRow]:
        """Every row, oldest first, for a host that reports what the run did."""
        return self._placed

    def row_for(self, intent_id: int) -> Optional[LedgerRow]:
        """The row one intent appended, or none where the intent appended none."""
        return self._by_intent.get(intent_id)

    # -- the append ---------------------------------------------------------

    def _append(self, intent: OrderIntent, bar: IntentBar, reduces: Optional[Reduction]) -> None:
        placement = intent.placement
        row = LedgerRow(
            intent_id=intent.intent_id,
            tag=placement.tag,
            # The only leg has no name of its own: a name comes from a leg
            # declaration, and those are planned (``stdlib.md`` 17.6).
            leg="",
            position_ref=placement.position_ref,
            instrument=intent.instrument,
            product=intent.product,
            side=placement.side,
            qty=placement.qty,
            order_type=placement.order_type,
            price=placement.limit,
            trigger=placement.trigger,
            placed_at=bar.time,
            updated_at=bar.time,
            reduces=reduces,
            # What this order puts into its position, in units, where the engine
            # can read it. The unit is per order rather than per run, so a
            # quantity the engine worked out is readable in a declaration whose
            # own unit is not.
            units=placement.qty if placement.qty_type == "units" else None,
            status=PLACED,
        )
        self._placed.append(row)
        self._by_intent[row.intent_id] = row
