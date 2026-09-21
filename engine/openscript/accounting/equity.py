"""The equity curve: one point per bar in the report window.

**Marked to the close and to nothing else.** An intrabar extreme is a price the
strategy could not have acted on, so it is not a profit it had, and a curve drawn
through the extremes flatters every run that ever held a losing position. Where a
bar's close is absent the previous mark carries and the point says so, rather
than a zero a reader would compare against.

**Drawdown is stated on equity including open profit**, and the basis is carried
on every point rather than left to the reader. A report whose drawdown basis is
not written down is a report whose worst figure means a different thing to each
reader.

**A trade's charges land on the bar it opened** and **its gross on the bar it
closed.** The trade list does not carry the timing of the fills underneath it, so
the cost has to land somewhere, and the open is the one place that is never later
than the truth. The gross lands at the close because that is the bar it stopped
being an opinion and became a number; while the trade is open it is in the open
profit instead, marked to the close, and the two never overlap.

**What a trade list cannot say, said here rather than discovered later.** A trade
holds one entry price weighted over its entry fills, so a trade whose size changed
while it was open is not visible in it. A partial close is marked at the full size
from the bar the reduction settled on, so the open profit of the part already
closed is counted twice over. A scale-in is the worse of the two, because it is
wrong from the beginning: a trade that buys a hundred at ten and another hundred
at twenty is marked, from the bar it first opened, as two hundred units bought at
fifteen, and the curve reports a drawdown the account never had. Neither reaches
the realised total, which is folded from the fills. A curve folded from the fills
rather than from the trades would have neither, and that is a different fold
rather than a correction to this one.

**A percentage here is a fraction of its basis.** A hundredth of a percent down is
``-0.0001`` and not ``-0.01``, for every figure in this module that divides. The
multiplication by a hundred belongs to whatever prints it.
"""

from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

from .shapes import BarMark, Contract
from .trades import Trade


@dataclass(frozen=True)
class EquityPoint:
    """One report bar's standing, folded from the fills settled up to it."""

    bar_index: int
    time: Optional[float]
    #: Cumulative gross of closed trades.
    realised: float
    #: Cumulative.
    charges: float
    #: Marked to this bar's close.
    open_profit: float
    #: capital + realised - charges.
    cash: float
    #: cash + open profit.
    equity: float
    #: The open position's magnitude at this close.
    exposure: float
    #: equity less the running peak, zero or negative.
    drawdown: float
    #: That distance against the peak, a fraction.
    drawdown_percent: float
    #: equity less the running trough, zero or positive: drawdown's mirror, so
    #: the run's best stretch is measured the same way its worst one is.
    run_up: float
    #: That distance against the trough, a fraction, and zero where the trough
    #: is not above zero. Not the same guard drawdown gets, because the two
    #: bases are not the same kind of number: a peak starts at the capital and
    #: only rises, a trough starts there and only falls, so an account that lost
    #: everything has a trough at or below zero and reports zero here from that
    #: bar on. Zero is the wrong answer for a run that recovered and is reported
    #: anyway, because a percentage against a negative basis turns a positive
    #: climb into a negative fraction. ``run_up`` itself is unaffected.
    run_up_percent: float


def open_on_bar(trade: Trade, bar_index: int) -> bool:
    """Whether this trade was still held at the close of this bar.

    The boundaries are the whole of the rule and both are decisions. A trade is
    held from the close of the bar it opened on, because an entry that settled
    during a bar is a position that bar ended holding. It is not held at the close
    of the bar it closed on, because that bar ended flat. So a trade opened and
    closed inside one bar is held at no close at all.
    """
    if bar_index < trade.opened_on_bar:
        return False
    return trade.closed_on_bar is None or bar_index < trade.closed_on_bar


def ratio_of(value: float, basis: float) -> float:
    """A ratio against a basis that may not be there to divide by.

    Capital of zero and a peak of zero are both reachable, and both turn an honest
    division into a value a document cannot carry. A basis that is not positive has
    no ratio to state, so the figure beside it, which is money and is always true,
    is the one a reader is left with.
    """
    return value / basis if basis > 0 else 0.0


def _closed_by(trade: Trade, bar_index: int) -> bool:
    """Whether this bar is the bar the trade closed on, or one after it."""
    return trade.closed_on_bar is not None and trade.closed_on_bar <= bar_index


def equity_over(
    trades: Sequence[Trade],
    marks: Sequence[BarMark],
    contract: Contract,
    capital: float,
) -> Tuple[EquityPoint, ...]:
    """The curve, one point per report bar, in the order the bars arrived.

    Warmup bars are swept and not reported: their orders were real, so a trade
    opened during the warmup is already in the fold at the first point, with its
    charges already paid and its position already marked. A curve that began its
    fold at the first report bar would lose both, and would lose them silently.

    The running peak starts at the capital rather than at the first point, so a run
    that is down from its first bar is in drawdown at its first bar. Starting it at
    the first point would report every run as having begun at its high.

    The trades arrive in the order they opened and the bars in the order they were
    loaded, and both are swept with a pointer rather than searched: a report over
    fifty thousand bars that rescans its trade list on every one of them is a
    report nobody waits for.
    """
    points: List[EquityPoint] = []
    held: List[Trade] = []
    at = 0
    realised = 0.0
    charges = 0.0
    peak = capital
    trough = capital
    mark: Optional[float] = None

    for bar in marks:
        # Opened by this bar, charges and all.
        while at < len(trades) and trades[at].opened_on_bar <= bar.bar_index:
            charges += trades[at].charges
            held.append(trades[at])
            at += 1

        # Closed by this bar, gross and all. A trade that opened and closed inside
        # one bar is taken on and given up here in that order, so its cost and its
        # gross are both in this point and its position is in none.
        closed_here = False
        for trade in held:
            if _closed_by(trade, bar.bar_index):
                realised += trade.gross_profit
                closed_here = True
        if closed_here:
            held = [trade for trade in held if not _closed_by(trade, bar.bar_index)]

        # A close the host did not have leaves the previous mark standing. It is
        # carried across the warmup boundary too, so the first report bar of a run
        # whose close is absent is marked at the last price there was.
        if bar.close is not None:
            mark = bar.close
        if not bar.in_report:
            continue

        open_profit = 0.0
        exposure = 0.0
        for trade in held:
            # Before the first close there has ever been, a trade is marked at its
            # own entry: no profit, and the position still visible in the exposure.
            price = trade.entry_price if mark is None else mark
            way = 1 if trade.side == "long" else -1
            open_profit += way * (price - trade.entry_price) * trade.units * contract.point_value
            exposure += abs(trade.units * price * contract.point_value)

        cash = capital + realised - charges
        equity = cash + open_profit
        if equity > peak:
            peak = equity
        if equity < trough:
            trough = equity
        drawdown = equity - peak
        run_up = equity - trough
        points.append(
            EquityPoint(
                bar_index=bar.bar_index,
                time=bar.time,
                realised=realised,
                charges=charges,
                open_profit=open_profit,
                cash=cash,
                equity=equity,
                exposure=exposure,
                drawdown=drawdown,
                drawdown_percent=ratio_of(drawdown, peak),
                run_up=run_up,
                run_up_percent=ratio_of(run_up, trough),
            )
        )

    return tuple(points)


def bars_in_market_over(trades: Sequence[Trade], equity: Sequence[EquityPoint]) -> int:
    """How many of these bars ended with something held.

    Swept rather than searched: a sorted list of the bars trades opened on, a
    sorted list of the bars they closed on, and the running difference between how
    many of each have gone by. That is the boundary rule ``open_on_bar`` states,
    arrived at from the other side, and a count that disagreed with the curve
    beside it about which bars were in the market is exactly the kind of defect a
    reader finds by adding two of the printed figures up.
    """
    opens = sorted(trade.opened_on_bar for trade in trades)
    closes = sorted(
        trade.closed_on_bar for trade in trades if trade.closed_on_bar is not None
    )

    opened = 0
    closed = 0
    live = 0
    bars = 0
    for point in equity:
        while opened < len(opens) and opens[opened] <= point.bar_index:
            live += 1
            opened += 1
        while closed < len(closes) and closes[closed] <= point.bar_index:
            live -= 1
            closed += 1
        if live > 0:
            bars += 1
    return bars
