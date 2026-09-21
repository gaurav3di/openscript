"""The nine order calls as this engine's manifest holds them, and the desk behind them.

``stdlib.md`` 17.2 and 17.3 are the calls, ``host-interface.md`` 7.2 and 7.4 are
the frames and the boundary they fold at, and ``strategy/`` is all of the
behaviour. What is here is the join: the manifest rows a program's own library
table is checked against, and the object that carries a ledger, its intents and
its fills through one case.

**An order call is an effect and is not performed when it executes.**
``compiled-program.md`` 5.4 has a function with an effect leave a record and push
absence, and step 9 applies the record only on a bar the engine decided. So the
machine hands this desk the calls a decided bar left behind, in the order the bar
made them, and a condition that was true halfway through a moving bar and false
when it closed places no order at all.

**A frame is delivered after a bar and folded before the next one.**
``conformance.md`` section 3 says ``afterBar`` is "the index of the bar after
whose execution the frame is delivered, so the fold happens at a bar boundary
before the next execution". Read as it is written, a frame naming the last bar is
delivered and never folded, because there is no next execution to fold before.
That is a hole in the page rather than a decision to make here, so such a case is
named ``unsupported`` by the caller rather than answered under one reading of
two.

**A refusal takes back the whole bar.** ``Ledger.discard`` is what that costs, and
the reason is in its own docstring: every call of a bar is mapped before any of
them is routed, so a refusal after one has appended a row would otherwise leave a
row no destination was ever handed.
"""

from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from ..contracts import LibraryEntry
from ..diagnostics import Diagnostic
from ..strategy import (
    Fills,
    Identity,
    IntentBar,
    Intents,
    Ledger,
    LedgerOptions,
    LedgerRow,
    OrderFrame,
)
from ..strategy.calls import PARAMETERS
from .reading import Frame

#: Section 2.5's row for each of the nine, by name and argument count. The count
#: is one more than the signature's, which is ``compiled-program.md`` 4.10's
#: extra argument: the names of the arguments the script wrote. None of them
#: holds state, and every one of them has the ``order`` effect, which is what
#: makes the machine hold the call until step 9 rather than calling into here.
ORDER_ENTRIES: Dict[Tuple[str, int], LibraryEntry] = {
    (name, len(parameters) + 1): LibraryEntry(name, len(parameters) + 1, False, "order")
    for name, parameters in PARAMETERS.items()
}


class Desk:
    """One strategy's ledger, its intents and its fills, driven over one case.

    The caller owns the bar loop, because the bars are the case's and the
    execution is the machine's. What is owned here is the order of the three
    things that happen between two executions, and that order is
    ``host-interface.md`` 7.4's rather than this class's choice.
    """

    def __init__(self, frames: Sequence[Frame] = ()) -> None:
        self.ledger = Ledger()
        self.intents = Intents()
        self.fills = Fills()
        #: The destination's own reference per intent, recorded at delivery, so
        #: that a fill carries the reference the frame that made it carried.
        self._refs: Dict[int, str] = {}
        self._after: Dict[int, List[Frame]] = {}
        for frame in frames:
            self._after.setdefault(frame.after_bar, []).append(frame)
        self._waiting: Tuple[Frame, ...] = ()

    def begin(self, options: LedgerOptions) -> None:
        """The declaration's own settings, before bar 0 and after the load.

        A ledger exists before the program is loaded, because the manifest has to
        answer whether this engine holds ``pos.size`` before anything has read a
        declaration, and the declaration's settings can only be read once the
        inputs behind them are resolved, which is what a load does. Nothing has
        placed an order in between: the first bar is what places one.
        """
        self.ledger.options = options

    # -- the boundary between two bars --------------------------------------

    def fold(self, index: int, time: Optional[float]) -> None:
        """Deliver what the destination sent after the last bar, then fold it.

        Delivered first and folded second, in one call, because the two are one
        boundary: a driver that folded before delivering would hold every frame
        for a bar longer, and a script would read a position one bar late.
        """
        for frame in self._waiting:
            named = self.intents.at_ordinal(frame.intent)
            if named is not None and frame.order_ref != "":
                self._refs[named.intent_id] = frame.order_ref
            self.ledger.deliver(
                OrderFrame(
                    # An ordinal naming no intent this run placed is how a case
                    # hands an engine a frame about an order its ledger does not
                    # hold. Step 1 of the fold refuses it, which is the ledger's
                    # to do and not this driver's, so an id no run can mint goes
                    # over rather than the frame being dropped here.
                    intent_id=-1 if named is None else named.intent_id,
                    status=frame.status,
                    filled_qty=frame.filled_qty,
                    avg_fill_price=frame.avg_fill_price,
                    order_ref=frame.order_ref,
                    text=frame.text,
                )
            )
        self._waiting = ()
        self.fills.record(self.ledger.settle(), self.intents, index, time, self._refs)

    def deliver_after(self, index: int) -> None:
        """The frames this case says the destination sent after bar ``index``."""
        self._waiting = tuple(self._after.get(index, ()))

    # -- what a decided bar sent --------------------------------------------

    def apply(self, effects: Iterable[Any], bar: IntentBar) -> Optional[Diagnostic]:
        """Step 9's order calls, in the order the bar made them, or the refusal.

        Every effect a program of this engine's can leave is one of the nine,
        because they are the only entries in its manifest with an effect at all,
        so the name goes to the ledger rather than being sorted here.
        """
        appended = len(self.ledger.rows())
        for effect in effects:
            placed = self.ledger.place(effect.name, effect.arguments, bar, effect.position)
            if placed.refusal is not None:
                self.ledger.discard(appended)
                return placed.refusal
            self.intents.record(placed.intents)
        return None

    # -- what a script and a report read ------------------------------------

    def size(self) -> float:
        return self.ledger.size()

    def avg_price(self) -> Optional[float]:
        return self.ledger.avg_price()

    def rows(self) -> Sequence[LedgerRow]:
        return self.ledger.rows()


def unfoldable(frames: Sequence[Frame], bars: int) -> Tuple[Frame, ...]:
    """The frames of a case that no boundary folds, which is the hole above.

    A frame named after the last bar is delivered and never folded, so a case
    carrying one is answered ``unsupported`` naming it rather than run to a
    ledger that is missing whatever it said.
    """
    return tuple(frame for frame in frames if frame.after_bar >= bars - 1)


def options_for(declared: Dict[str, Any], instrument: Dict[str, Any]) -> LedgerOptions:
    """What the declaration and the instrument record fix before bar 0.

    ``declared`` is the strategy block of the compiled program's meta, with every
    input reference already resolved: a script may declare its own quantity from
    an input, and a ledger handed the reference rather than the value would size
    every order from a shape.
    """
    return LedgerOptions(
        instrument=Identity(instrument.get("symbol"), instrument.get("exchange")),
        product=declared["product"],
        qty_type=declared["qtyType"],
        declared_qty=declared["qty"],
        tick_size=instrument.get("tickSize"),
        pyramiding=declared["pyramiding"],
    )
