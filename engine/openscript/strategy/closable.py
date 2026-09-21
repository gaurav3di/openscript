"""What is left to reduce and which side reduces it, ``stdlib.md`` 17.1 and 17.2.

**Both questions are about a part rather than about the leg**, and the leg is the
case of a part that no tag names. A leg can be long under one tag and short under
another, and then its net answers neither question for either of them: a close
taking its side from the net sent an order that added to the part it was told to
flatten, and a count taken from the net did not see the close already on its way
to that part.

**What is available to reduce is the settled position less everything already
working against it.** A position is folded from settled fills and from nothing
else (17.8), which is right and is what makes this file necessary: an order the
destination has not answered has filled nothing, so the leg still reads what it
held before that order left, and measured against that alone every reducing order
sends the whole position again.

**The scope is the run and the position, not the bar.** Counted over one call,
two bare closes on one bar took a leg holding three long to three short. Counted
over one bar, the same two closes one bar apart did the same thing, because the
bar's own record is emptied when the bar index changes. So the record is the
ledger's, which is the run's: an order the destination still has is exactly a row
that is neither terminal nor fully filled.

**In units, because a position is.** A quantity the script stated is in the
declaration's own unit (``host-interface.md`` 7.1), so it is a number this file
can read only where that unit is units. What is done with an order it cannot read
is the only reading that cannot cross zero: that the order took the whole of the
part. So what is left carries whether it was counted or assumed. The mapping
reads the number, because sending nothing is safe either way; the refusal reads
both, because a refusal may only name a number it measured.
"""

from dataclasses import dataclass
from typing import Optional, Protocol, Sequence

from .positions import sign
from .rows import LedgerRow, working_units
from .statuses import is_terminal


class Closing(Protocol):
    """What the arithmetic below needs: the leg and the rows of its own ledger."""

    def size(self) -> float:
        """The leg's net position in units, folded from settled fills."""

    def rows(self) -> Sequence[LedgerRow]:
        """The rows this strategy placed, newest last."""


@dataclass(frozen=True)
class Closable:
    """What one part of the leg can still close, and whether that was measured."""

    #: The units a close may still send against it.
    units: float
    #: Whether every order counted against it stated a quantity in units.
    counted: bool


def closing_side(size: float) -> Optional[str]:
    """The side that reduces a position, or nothing when there is none to reduce.

    One fact with two readers: the mapping gives a close its direction with it,
    and the arithmetic below tells an order on its way out of the position from
    one on its way in, which is the difference between a reduction that is still
    working and an entry that holds nothing.
    """
    if size > 0:
        return "sell"
    if size < 0:
        return "buy"
    return None


def held_under(ctx: Closing, tag: str) -> float:
    """The settled units held under one tag, signed the way a position is."""
    held = 0.0
    for row in ctx.rows():
        if row.tag != tag:
            continue
        held += row.filled_qty if row.side == "buy" else -row.filled_qty
    return held


def _holding_of(ctx: Closing, tag: Optional[str]) -> float:
    """What the part a call names holds, signed the way a position is.

    The leg where the call names no tag, and the settled quantity of that tag's
    own rows where it names one. One function because it is one question, and
    every number this file produces about a part is taken from it.
    """
    return ctx.size() if tag is None else held_under(ctx, tag)


def closing_for(ctx: Closing, tag: Optional[str]) -> Optional[str]:
    """The side that reduces the part a call names, or nothing where it holds none.

    Taken from the leg instead, a call named ``close`` opened a position: a leg
    holding ten long under one tag and four short under another nets six long, so
    closing the short part was answered with a sell, which took that part to eight
    short and cut the other one to six. A part whose own rows have netted to
    nothing has no side and the call sends nothing, which is 17.2's idempotence.
    """
    return closing_side(_holding_of(ctx, tag))


def _committed(ctx: Closing, tag: Optional[str]) -> Closable:
    """The units already working against the position, across the whole run.

    Only an order on the side that reduces what the leg holds now, and every
    order on that side. A row records what it reduced at the moment it was sent,
    and a leg that has changed sign since is being reduced from the other side:
    an order still working on the old side is adding to the leg rather than
    taking from it, and an order recorded as adding is a reduction now whatever
    it was then. The side is the part's own, which is the leg's where no tag
    names one.
    """
    held = _holding_of(ctx, tag)
    side = closing_side(held)
    if side is None:
        return Closable(units=0.0, counted=True)
    units = 0.0
    counted = True
    for row in ctx.rows():
        if row.side != side or is_terminal(row.status):
            continue
        reduces = row.reduces
        if reduces is not None:
            if tag is not None and reduces.part != tag:
                continue
            working = working_units(row)
            if working == 0:
                continue
            units += working
            counted = counted and reduces.counted
            continue
        # An order that was an entry when it left. Its own tag is what names it,
        # because a reduction's part is the tag a close named and an entry named
        # no part of anything.
        if tag is not None and row.tag != tag:
            continue
        if row.units is None:
            # A quantity in the declaration's own unit, working against this part
            # and unreadable as a number of units. Taken to cover the whole of
            # what is there, which is the reading 17.1 already makes for the
            # other order it cannot read.
            units += abs(held)
            counted = False
            continue
        units += max(0.0, row.units - row.filled_qty)
    return Closable(units=units, counted=counted)


def closable(ctx: Closing, tag: Optional[str]) -> Closable:
    """What a ``close`` can still close, in units, whether or not it names a quantity.

    A part on the leg's own side is bounded by the leg, so that closing a part can
    never take the leg through zero. A part on the other side is not: closing a
    short part under a long leg is a buy, which moves the leg away from zero
    rather than towards it, so there is nothing for the leg's own number to bound.
    What that order may actually send is still bounded per position by what has
    settled there, so a part whose reference has already returned to zero sends
    nothing rather than opening it again.
    """
    spent = _committed(ctx, None)
    leg = max(0.0, abs(ctx.size()) - spent.units)
    if tag is None:
        return Closable(units=leg, counted=spent.counted)
    held = held_under(ctx, tag)
    own = _committed(ctx, tag)
    part = max(0.0, abs(held) - own.units)
    if sign(held) != sign(ctx.size()):
        return Closable(units=part, counted=own.counted)
    if part <= leg:
        return Closable(units=part, counted=own.counted)
    return Closable(units=leg, counted=spent.counted)


def closable_units(ctx: Closing, tag: Optional[str]) -> float:
    """What a close can still close, for the mapping, which sends a number."""
    return closable(ctx, tag).units
