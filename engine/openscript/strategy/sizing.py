"""How much each order of a call sends, and which position it is sent against, 17.1.

**This is the half of a call that is arithmetic.** ``placing`` says what each call
means and dispatches to the two functions here; these two decide how many orders
the call becomes, how large each is, and which position reference each one
carries.

The two entry points are ``entering``, for a call that states a side and a size,
and ``flattening``, for one that reduces what the leg holds. What they differ
about is not the split but the budget: an entry sends the size the script wrote
whatever the leg holds, so the only question is where its units land; a close
chooses its own number, so it may only choose one that has settled.

**No order crosses zero.** An instruction that would take a leg from long to
short is two orders, one that closes the outgoing position and one that opens the
replacement, each carrying its own position reference, so that a fill arriving
late can still say which of the two it settled.

**The reference is minted in every unit; only the arithmetic waits.** The split
subtracts a position folded from filled quantities from a quantity the script
stated, and those are the same kind of number only in a declaration counting in
units. Minting a reference needs none of that arithmetic, so an order the engine
cannot size against the leg is still sent on a position of its own rather than on
the outgoing one. What does not hold is written where a reader meets it:
``stdlib.md`` 17.1 and ``errors.md`` OS7005.
"""

from dataclasses import dataclass, replace
from typing import Any, List, Optional, Protocol, Sequence, Tuple

from .closable import Closing, closable_units
from .holdings import Book, Holding, divide, holdings, joining, opposing, outgoing_for
from .intents import Identity, IntentBar, Placement  # noqa: F401  the context states them
from .rows import Reduction


class PlacingContext(Book, Closing, Protocol):
    """What the mapping and the refusals read: the declaration, the leg and the ledger."""

    instrument: Identity
    product: str
    #: The unit a quantity the script stated is counted in, ``language.md`` 13.3.
    qty_type: str
    #: The size an order that names none takes, from the declaration.
    declared_qty: float
    #: The instrument's tick size, absent where the host states none.
    tick_size: Optional[float]
    #: Entries allowed in one direction before one is refused.
    pyramiding: float
    bar: IntentBar

    def avg_price(self) -> Optional[float]:
        """The average price of the open position, absent while flat."""

    def mint(self) -> int:
        """A fresh position, for the replacement half of a flip."""


@dataclass(frozen=True)
class MappedOrder:
    """One order a call sends, and what that order takes out of the leg."""

    placement: Placement
    reduces: Optional[Reduction] = None


def adding(placement: Placement) -> MappedOrder:
    """An order that adds to a position, or whose size the engine cannot count."""
    return MappedOrder(placement=placement, reduces=None)


@dataclass(frozen=True)
class Entry:
    """What an entering order states, at one quantity and one position."""

    side: str
    limit: Optional[float]
    trigger: Optional[float]
    order_type: str
    tag: str


def _placing(entry: Entry, qty: float, qty_type: str, position_ref: int) -> Placement:
    return Placement(
        kind="place",
        side=entry.side,
        qty=qty,
        qty_type=qty_type,
        order_type=entry.order_type,
        limit=entry.limit,
        trigger=entry.trigger,
        tag=entry.tag,
        position_ref=position_ref,
    )


def _opening_on(ctx: Any, book: Sequence[Holding], side: str) -> int:
    """The reference an order that opens or adds to a position carries."""
    found = joining(book, side)
    return ctx.mint() if found is None else found


def entering(ctx: Any, entry: Entry, qty: Optional[float]) -> Tuple[MappedOrder, ...]:
    """The orders an entry sends, which is two where it crosses zero.

    The closing half is what is left to close, not what the leg holds: an order
    the destination has not answered has filled nothing, so a leg with a close
    already going has nothing left for the outgoing half to take.

    What it crosses is decided per position, not from the leg's net. The net is
    folded from settled fills, so on a silent destination it reads zero while an
    entry is still going and an opposing entry is not seen as opposing anything
    at all. The question is about one position, so it is asked of one position,
    and the answer is the same whether or not the destination has answered yet.
    """
    # The declaration's own size where the call named none, ``stdlib.md`` 17.2.
    wanted = ctx.declared_qty if qty is None else qty
    book = holdings(ctx)
    # Nothing to cross: the leg holds no position this order opposes, so it opens
    # one or joins the one it is on the side of.
    if not opposing(book, entry.side):
        return (adding(_placing(entry, wanted, ctx.qty_type, _opening_on(ctx, book, entry.side))),)

    if ctx.qty_type != "units":
        return (
            MappedOrder(
                # A position of its own, in every unit, because minting one needs
                # no lot size. On the outgoing reference this order was the
                # crossing 17.1 refuses outright.
                placement=_placing(entry, wanted, ctx.qty_type, ctx.mint()),
                # Unreadable in units, so it is taken to have reduced the whole of
                # what was left: ``closable`` says why that is the only safe
                # reading.
                reduces=Reduction(part=None, claimed=closable_units(ctx, None), counted=False),
            ),
        )

    # What each position it opposes can absorb, oldest first. A position holding
    # six is sent six of the nine, whether those six have settled or are still
    # going, because six of this order is what brings that position back to zero.
    shares, left = divide(book, entry.side, wanted, lambda one: one.units)
    out: List[MappedOrder] = [
        MappedOrder(
            placement=_placing(entry, share.units, "units", share.ref),
            reduces=Reduction(part=None, claimed=share.units, counted=True),
        )
        for share in shares
    ]
    if left == 0:
        return tuple(out)
    # The replacement is a position of its own where the leg holds none on this
    # side, so that a fill on an outgoing order settles the position it belonged
    # to.
    out.append(adding(_placing(entry, left, "units", _opening_on(ctx, book, entry.side))))
    return tuple(out)


def _reducing(side: str, qty: float, qty_type: str, tag: str, position_ref: int) -> Placement:
    return Placement(
        kind="place",
        side=side,
        qty=qty,
        qty_type=qty_type,
        order_type="market",
        tag=tag,
        position_ref=position_ref,
    )


def flattening(
    ctx: Any,
    units: float,
    side: str,
    qty: Optional[float],
    tag: str,
    part: Optional[str],
) -> Tuple[MappedOrder, ...]:
    """The orders a flattening call sends, which is one per position it reduces.

    It is divided across the positions holding it, oldest first, each bounded by
    what has settled on it and is not already working against it. Sized against
    the whole leg and attached to a single reference, one order was large enough
    to take the first of them through zero and out the other side.

    A quantity the engine cannot read is one order. It cannot be divided at all,
    so it goes on the position it is closing, oldest first, and that position is
    what it may take past zero: the one shape of 17.1 an engine does not keep.
    """
    # Nothing to flatten and no size named: an instruction about a position the
    # strategy does not hold, which is not an error and is not an order either.
    if units <= 0 and qty is None:
        return ()
    sending = units if qty is None else qty
    # A quantity the engine worked out is counted as itself. One the script
    # stated in a unit the engine cannot read is counted as the whole of what was
    # left, which is what keeps a close after it from sending the position again.
    counted = qty is None or ctx.qty_type == "units"
    book = holdings(ctx)
    if not counted:
        outgoing = outgoing_for(ctx, book, side)
        # Where the leg holds no position on the side the close reduces the call
        # sends nothing, whatever it stated: a close is never minted a position,
        # so there is nothing for it to be sent against.
        if outgoing is None:
            return ()
        return (
            MappedOrder(
                placement=_reducing(side, sending, ctx.qty_type, tag, outgoing),
                reduces=Reduction(part=part, claimed=units, counted=False),
            ),
        )
    # Anything left when every position it reduces is full is left unsent rather
    # than pushed onto one of them past its own size. By construction there is
    # nothing left: what a close may send is the leg's settled net less what is
    # working against it, and that is never more than the positions on that side
    # hold.
    shares, _left = divide(book, side, sending, lambda one: one.settled)
    return tuple(
        MappedOrder(
            placement=_reducing(side, share.units, "units", tag, share.ref),
            reduces=Reduction(part=part, claimed=share.units, counted=True),
        )
        for share in shares
    )


def at_position(order: MappedOrder, ref: int) -> MappedOrder:
    """The same order sent against another position, which a split makes."""
    return MappedOrder(placement=replace(order.placement, position_ref=ref), reduces=order.reduces)
