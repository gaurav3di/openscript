"""What a leg holds, one entry per position reference, including what is still working.

**This file answers which position an order is sent against**, which the leg's
net cannot answer. The net is folded from settled fills, so with the destination
silent an entry of six on one bar and an opposing nine on the next would read as
opposing nothing at all, and both would go on one reference: that reference would
open six long and settle three short, which is the one failure ``stdlib.md`` 17.1
names, because a fill arriving late could no longer say which position it settled.

**So a reference is measured by what is on it, settled and working together.** An
order the destination has not answered has moved no position figure, and the
ledger's rows are where it is visible. A reference with six units of buy still to
come is a long position whether or not any of it has settled, and an opposing
order has to take those six off it before it opens anything new: otherwise
nothing can ever bring that reference back to zero, which is 17.7's sentence
about how a position ends.

**Two numbers, because two questions are asked and they are not the same
question.** ``units`` is what an opposing order may take, and it counts what is
working: the order is being sent either way, at the size the script wrote, and
the only thing being decided is which reference each unit lands on. ``settled``
is what a close may send, and it counts only what has settled less what is
already working against it, because a close chooses its own quantity and one
counting a working entry would sell units that may never exist.

**What this costs, stated rather than discovered.** An entry that opposes an
unanswered entry is sent against it, so if the first order is rejected and the
second fills, that reference settles on the side it did not open on. No engine
avoids that without holding an order back until the destination answers, which is
an engine that stops trading when a destination is slow. What 17.1 asks for is
kept either way: every order names exactly one position.
"""

from dataclasses import dataclass
from typing import Callable, List, Optional, Protocol, Sequence, Tuple

from .positions import sign
from .rows import LedgerRow
from .statuses import is_terminal


class Book(Protocol):
    """What this file reads: the rows of the ledger and the position book."""

    def rows(self) -> Sequence[LedgerRow]:
        """The rows this strategy placed, newest last."""

    def size_of(self, ref: int) -> float:
        """The settled size of one position reference, signed the way a position is."""


@dataclass(frozen=True)
class Holding:
    """One position reference a leg holds, and what may still be done to it."""

    ref: int
    #: ``buy`` for a long position, ``sell`` for a short one.
    side: str
    #: The units an opposing order may take, or absent where the engine cannot
    #: read one of its quantities. Absent is not zero: it means the reference
    #: holds something whose size is in the declaration's own unit.
    units: Optional[float]
    #: The settled units nothing is working against, which is what a close sends.
    settled: float


@dataclass
class _Tally:
    """One reference under construction, before it is decided what it holds."""

    settled: float
    working: float = 0.0
    #: Working units on the side that reduces what has settled here, unsigned.
    #: Which side that is depends on what settled, not on what an order was when
    #: it left: an order recorded as adding is a reduction now on a position that
    #: has since changed sign, and a reduction recorded then is adding now.
    against: float = 0.0
    #: The side of a working order whose quantity is not readable, or none.
    unreadable: Optional[str] = None
    #: Whether a quantity it cannot read is working against what settled here.
    blocked: bool = False


def _side_of(signed: float) -> str:
    return "buy" if signed > 0 else "sell"


def holdings(ctx: Book) -> Tuple[Holding, ...]:
    """Every position reference this leg holds, oldest first.

    Oldest first is the order the references were minted in, which is the order
    the rows first name them in, and it is the order a reducing order takes them
    in: the position opened first is the position closed first.

    A reference with nothing left on it is not here. It has no room for an
    opposing order and nothing for a close to send, and it is either already back
    at zero or has its whole quantity spoken for by orders that are still going.
    """
    tallies = {}
    minted: List[int] = []

    for row in ctx.rows():
        tally = tallies.get(row.position_ref)
        if tally is None:
            tally = _Tally(settled=ctx.size_of(row.position_ref))
            tallies[row.position_ref] = tally
            minted.append(row.position_ref)
        # An order that has ended has nothing more coming from it, whatever it
        # filled: the fill is already in the settled figure above and the rest is
        # released. That is how a strategy whose order was rejected gets its room
        # back.
        if is_terminal(row.status):
            continue
        way = 1 if row.side == "buy" else -1
        # Every row is read the same way, by the order's own quantity in units,
        # because this sum is compared against what has settled on this reference
        # and both halves have to fall together when a fill arrives. Read instead
        # by what a reduction claimed of the leg, the settled half fell and the
        # claimed half did not, the sum went negative, and an entry opposing the
        # reference was handed it as an order that adds.
        remaining = None if row.units is None else max(0.0, row.units - row.filled_qty)
        reduces = sign(tally.settled) == -way
        if remaining is None:
            tally.unreadable = row.side
            # Nothing is sent against a position an order the engine cannot read
            # is working against. Between a close that sends nothing and an order
            # that crosses zero, 17.1 has already chosen.
            if reduces:
                tally.blocked = True
            continue
        tally.working += way * remaining
        if reduces:
            tally.against += remaining

    held: List[Holding] = []
    for ref in minted:
        tally = tallies[ref]
        outstanding = tally.settled + tally.working
        if outstanding == 0 and tally.unreadable is None:
            continue
        side = tally.unreadable if outstanding == 0 else _side_of(outstanding)
        # A reference holding a quantity the engine cannot read holds an unknown
        # number of units, and understating it is the safe half of that: an
        # opposing order divided against too small a number opens the remainder
        # on a reference of its own, which crosses nothing.
        units = None if outstanding == 0 else abs(outstanding)
        # What a close may send is what settled here and is not already coming
        # off, and only where what settled is on this side. A reference whose
        # working orders run past its settled quantity reads as the other side,
        # because that is what it will hold, and nothing of that side has settled.
        facing = 1 if side == "buy" else -1
        if tally.blocked or sign(tally.settled) != facing:
            settled = 0.0
        else:
            settled = max(0.0, abs(tally.settled) - tally.against)
        held.append(Holding(ref=ref, side=side, units=units, settled=settled))
    return tuple(held)


def opposing(book: Sequence[Holding], side: str) -> Tuple[Holding, ...]:
    """The references an order of this side reduces, oldest first."""
    return tuple(one for one in book if one.side != side)


def outgoing_for(ctx: Book, book: Sequence[Holding], side: str) -> Optional[int]:
    """The position an order the engine cannot size is sent against, or none.

    A close is never minted a position of its own. It is named for reducing, so
    it goes on the position it is closing, and where the engine cannot read the
    quantity it states, that position is the one the order may take past zero:
    the one shape of 17.1 an engine does not keep.

    What has settled comes first and the book's own list second. A reference
    whose settled quantity is entirely spoken for by orders still going is not in
    the book, because it has nothing left for an engine-sized close to send; an
    order the engine cannot size is not choosing a quantity, so that exclusion
    does not apply to it. Taking the book's answer alone sent a close on the
    reference a short entry had just opened, which is a call named close adding
    to a position.
    """
    facing = -1 if side == "buy" else 1
    seen = set()
    for row in ctx.rows():
        if row.position_ref in seen:
            continue
        seen.add(row.position_ref)
        if sign(ctx.size_of(row.position_ref)) == facing:
            return row.position_ref
    rest = opposing(book, side)
    return rest[0].ref if rest else None


def protecting(ctx: Book) -> Optional[int]:
    """The position a bracket protects, or none where the leg holds none.

    Holding first, opening second, which is the order 17.7 states them in, and
    the newest of them where the leg holds more than one. A bracket appends no
    row and moves no position, so it has nothing of its own to name: it names
    what the leg has, and what the leg has is what its own fills settled.

    Derived here rather than kept as the last reference minted. A stored slot
    answered neither question: cleared when one reference returned to zero it
    reported a leg still holding an older position as holding none, and kept for
    an order the destination then refused it named a position that never opened.
    Both are wrong in the direction a host cannot check, because ``0`` is the one
    value ``host-interface.md`` 7.1 tells a host means there is nothing to look up.
    """
    held: Optional[int] = None
    seen = set()
    for row in ctx.rows():
        if row.position_ref in seen:
            continue
        seen.add(row.position_ref)
        # Rows are oldest first and references are minted in order, so the last
        # one this loop keeps is the newest reference something has settled on.
        if ctx.size_of(row.position_ref) != 0:
            held = row.position_ref
    if held is not None:
        return held
    book = holdings(ctx)
    return None if not book else book[-1].ref


def joining(book: Sequence[Holding], side: str) -> Optional[int]:
    """The reference an order that adds to a position joins, or none to mint one.

    The newest open reference on that side, so that two entries sent on two bars
    before either fills belong to one position rather than to two. A reference
    whose whole quantity is already going is not open to join: an entry joining
    it would settle into a position that reaches zero and ends, and 17.7's
    sentence about how a position ends would have to happen twice for one
    reference.
    """
    for one in reversed(list(book)):
        if one.side == side:
            return one.ref
    return None


@dataclass(frozen=True)
class Share:
    """One order of a call: the units it sends and the reference it sends them on."""

    ref: int
    units: float


def divide(
    book: Sequence[Holding],
    side: str,
    units: float,
    room: Callable[[Holding], Optional[float]],
) -> Tuple[Tuple[Share, ...], float]:
    """How a quantity is divided across the references it reduces, oldest first.

    A reducing order that spans two positions is two orders, for the reason 17.1
    gives for a flip: one order against two positions would leave a late fill
    with no way to say which of them it settled.

    ``room`` is which of the two numbers a holding offers is the ceiling here:
    what an opposing order may take, or what has settled. The caller chooses,
    because the caller knows whether the quantity is the script's or the
    engine's. What is left over when every reference is full is the caller's to
    open or to drop, and nothing is ever sent past a reference's own ceiling.
    """
    shares: List[Share] = []
    left = units
    for one in opposing(book, side):
        if left <= 0:
            break
        ceiling = room(one)
        if ceiling is None or ceiling <= 0:
            continue
        take = min(left, ceiling)
        shares.append(Share(ref=one.ref, units=take))
        left -= take
    return tuple(shares), left
