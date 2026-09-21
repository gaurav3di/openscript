"""What a trade is, which is the definition every statistic is counted over.

**A trade is one position reference, from the fill that first takes it away from
zero to the fill that returns it to zero.** Nothing else is invented, because the
engine already mints a reference per position, no order crosses zero, and every
fill names the reference it settled however late it arrives.

Everything awkward falls out of that rather than needing a rule of its own. A
pyramided entry is more entry fills on one trade. A partial close is an exit fill
that does not close the trade. A flip is two references and therefore two trades,
which is what a reversing order already sends. A reference still holding
something at the last bar is an open trade: it is in the list with ``is_open``
true, it is counted in equity, and it is counted in no win rate.

**What the fold reads, and what it refuses to work out for itself.** A fill
carries the signed size of its reference either side of the settlement, so the
fold reads what the position book did rather than recomputing it from quantities
and sides. That is the whole of how a partial close, a pyramided entry and a
reversal tell themselves apart. It also settles the one case the definition does
not cover on its face: a destination that fills more than the order asked takes a
reference through zero rather than to it, so the fill closes the trade that was
held and opens a second one on the same reference, at its own price and on its
own bar.

**Reducing a position does not move its average**, which is the position book's
rule read here rather than a second one: a reducing fill adds to the exits and
touches neither the entry quantity nor the entry cost.

**A charge lands whole on one trade and is never split.** It was rounded once for
the fill that incurred it, and splitting it would round it again and put a residue
somewhere. So it is attributed to the trade the fill closed where it closed one,
and to the trade it opened otherwise, which makes the charges of the trades add
up to the charges of the fills exactly rather than nearly.

**Gross profit is over the units that have left.** For a closed trade that is
every unit it entered. For one still open it is what its exits have realised so
far, which is a figure that is true rather than a zero standing in for money the
run has already made.
"""

from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

from .shapes import BarMark, Contract, RecordedFill


def _sign(value: float) -> int:
    """The sign of a size, which is the whole of how a move is read.

    Written here rather than imported from the ledger, because this package
    imports no engine: a stored record has to be reportable again with no engine
    present, which is what makes a run record a conformance case rather than a
    souvenir.
    """
    if value > 0:
        return 1
    if value < 0:
        return -1
    return 0


@dataclass(frozen=True)
class Trade:
    """One round trip on one position reference."""

    #: 1-based, in the order the trade opened.
    index: int
    position_ref: int
    side: str
    opened_on_bar: int
    opened_at: Optional[float]
    closed_on_bar: Optional[int]
    closed_at: Optional[float]
    bars_held: Optional[int]
    #: Total units entered.
    units: float
    #: Quantity weighted over the entry fills.
    entry_price: float
    #: Quantity weighted over the exit fills.
    exit_price: Optional[float]
    entries: int
    exits: int
    gross_profit: float
    charges: float
    net_profit: float
    #: Excursion at bar closes while open. Favourable is zero or better, adverse
    #: zero or worse, and both are zero for a trade no bar closed on.
    max_favourable: float
    max_adverse: float
    is_open: bool


@dataclass
class _Building:
    """A trade while it is still being folded: the totals a round trip is made of."""

    index: int
    position_ref: int
    side: str
    opened_on_bar: int
    opened_at: Optional[float]
    closed_on_bar: Optional[int] = None
    closed_at: Optional[float] = None
    entry_units: float = 0.0
    entry_cost: float = 0.0
    exit_units: float = 0.0
    exit_cost: float = 0.0
    entries: int = 0
    exits: int = 0
    charges: float = 0.0
    #: Signed, and what the reference holds for this trade right now.
    size: float = 0.0
    max_favourable: float = 0.0
    max_adverse: float = 0.0


def closed_by(before: float, after: float) -> float:
    """How much of a move from one size to another closed what was held.

    A move to the other side of zero closed all of it, which is the case a
    destination that overfilled produces and the one this has to get right.
    """
    if before == 0:
        return 0.0
    same = _sign(after) == _sign(before)
    return max(0.0, abs(before) - abs(after)) if same else abs(before)


def opened_by(before: float, after: float) -> float:
    """And how much of it opened something, which is the rest of the same move."""
    if after == 0:
        return 0.0
    if before == 0 or _sign(after) != _sign(before):
        return abs(after)
    return max(0.0, abs(after) - abs(before))


def _average_of(cost: float, units: float) -> float:
    return 0.0 if units == 0 else cost / units


def _begin(fill: RecordedFill, units: float, index: int) -> _Building:
    return _Building(
        index=index,
        position_ref=fill.position_ref,
        side="long" if fill.ref_size_after > 0 else "short",
        opened_on_bar=fill.bar_index,
        opened_at=fill.bar_time,
        entry_units=units,
        entry_cost=units * fill.price,
        entries=1,
        size=fill.ref_size_after,
    )


def _fold(
    fill: RecordedFill, charge: float, built: List[_Building], live: List[_Building]
) -> None:
    """One fill against the trades its reference holds."""
    closing = closed_by(fill.ref_size_before, fill.ref_size_after)
    opening = opened_by(fill.ref_size_before, fill.ref_size_after)
    at = -1
    for index, trade in enumerate(live):
        if trade.position_ref == fill.position_ref:
            at = index
            break
    held = None if at < 0 else live[at]
    paid = False

    if held is not None and closing > 0:
        held.exit_units += closing
        held.exit_cost += closing * fill.price
        held.exits += 1
        held.charges += charge
        paid = True
        # What the reference left this trade holding: nothing at all when the
        # fill carried it through zero, since the other side of zero is the next
        # trade.
        held.size = 0.0 if opening > 0 else fill.ref_size_after
        if held.size == 0:
            held.closed_on_bar = fill.bar_index
            held.closed_at = fill.bar_time
            del live[at]

    if opening > 0:
        # A fill that closed something opens a trade of its own rather than
        # adding to the one it just finished.
        adding = None if closing > 0 else held
        if adding is None:
            fresh = _begin(fill, opening, len(built) + 1)
            built.append(fresh)
            live.append(fresh)
            if not paid:
                fresh.charges += charge
        else:
            adding.entry_units += opening
            adding.entry_cost += opening * fill.price
            adding.entries += 1
            adding.size = fill.ref_size_after
            if not paid:
                adding.charges += charge
        return

    # A fill that moved nothing still cost something, and it cost it on account
    # of the trade its reference is holding.
    if not paid and held is not None:
        held.charges += charge


def _mark_to(live: Sequence[_Building], close: float, point_value: float) -> None:
    """Every open trade against one bar's close."""
    for trade in live:
        entry = _average_of(trade.entry_cost, trade.entry_units)
        excursion = (close - entry) * trade.size * point_value
        if excursion > trade.max_favourable:
            trade.max_favourable = excursion
        if excursion < trade.max_adverse:
            trade.max_adverse = excursion


def _finish(trade: _Building, contract: Contract) -> Trade:
    entry_price = _average_of(trade.entry_cost, trade.entry_units)
    exit_price = None if trade.exit_units == 0 else trade.exit_cost / trade.exit_units
    way = 1 if trade.side == "long" else -1
    gross = (
        0.0
        if exit_price is None
        else (exit_price - entry_price) * trade.exit_units * contract.point_value * way
    )
    return Trade(
        index=trade.index,
        position_ref=trade.position_ref,
        side=trade.side,
        opened_on_bar=trade.opened_on_bar,
        opened_at=trade.opened_at,
        closed_on_bar=trade.closed_on_bar,
        closed_at=trade.closed_at,
        bars_held=None if trade.closed_on_bar is None else trade.closed_on_bar - trade.opened_on_bar,
        units=trade.entry_units,
        entry_price=entry_price,
        exit_price=exit_price,
        entries=trade.entries,
        exits=trade.exits,
        gross_profit=gross,
        charges=trade.charges,
        net_profit=gross - trade.charges,
        max_favourable=trade.max_favourable,
        max_adverse=trade.max_adverse,
        is_open=trade.closed_on_bar is None,
    )


def trades_of(
    fills: Sequence[RecordedFill],
    charges: Sequence[float],
    marks: Sequence[BarMark],
    contract: Contract,
) -> Tuple[Trade, ...]:
    """The round trips a run's fills make up, in the order they opened.

    ``charges[index]`` is the money ``fills[index]`` was charged, rounded once by
    whoever computed it, so the two travel as one thing and nothing here rounds
    anything a second time. A caller with no cost model supplies no charges at all
    and every trade's charges are zero.

    The fills are read in ``seq`` order whatever order they are handed in, because
    ``seq`` is the order the engine folded them and a report that depended on the
    order a caller happened to be holding them in would not be reproducible. The
    marks are read in bar order for the same reason, and a bar is marked after
    every fill up to it has been folded, because a fill happens during its bar and
    the close comes after.
    """
    paired = [
        (fill, charges[index] if index < len(charges) else 0.0)
        for index, fill in enumerate(fills)
    ]
    settled = sorted(paired, key=lambda one: one[0].seq)
    built: List[_Building] = []
    live: List[_Building] = []

    at = 0
    for bar in sorted(marks, key=lambda one: one.bar_index):
        while at < len(settled) and settled[at][0].bar_index <= bar.bar_index:
            _fold(settled[at][0], settled[at][1], built, live)
            at += 1
        # A bar with no close is not a price anything can be marked at. It marks
        # nothing rather than marking zero, which would read as a total loss.
        if bar.close is not None:
            _mark_to(live, bar.close, contract.point_value)
    while at < len(settled):
        _fold(settled[at][0], settled[at][1], built, live)
        at += 1

    return tuple(_finish(trade, contract) for trade in built)
