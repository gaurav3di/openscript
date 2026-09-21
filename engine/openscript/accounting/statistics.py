"""The summary, and the two figures in it that decide whether a run means anything.

**Win rate is over closed trades, on net profit after charges**, and a trade whose
net is exactly zero is a scratch counted in neither half. It is absent where
nothing closed rather than zero, because zero is a number a reader compares
against and "nothing has closed yet" is not a losing run.

**Expectancy is money per closed trade**, and it has two spellings that must
agree: the win rate against the average win and the average loss, and the net
profit over the trade count. Two spellings of one figure that disagree is how a
report loses its reader, so one of them is the computation and the other is a
test.

**And its standard error is what answers the question a comparison asks.** The
sample standard deviation of per-trade net over the square root of the trade count
is what turns "this run made more" into "this run made more than the noise", and
without it a difference of two percent over eleven trades reads like a result.

Bar times rather than bar indices, wherever a figure addresses a bar: loading more
history shifts every index, so a report that addresses a bar by index changes when
the warmup changes.

## Which trades a figure is counted over, which is three different answers

Almost every defect this file can have is a figure counted over the wrong half of
a list holding closed trades and open ones together.

- **Net profit, and everything derived from it**, is over closed trades. An open
  trade's net is its charges so far with no gross against them, so counting it
  would report a run holding a winner as having lost money.
- **Charges are over every trade**, open ones included, because the money left the
  account whether or not the position came back. This is the figure the equity
  curve's last point carries, and the two are asserted equal.
- **The drawdown figures are over the curve** and not over the trades at all. A
  drawdown is a thing equity did between two trades as often as during one.

## The cases where a statistic is not a number

Every one of them is a division, and every one is answered here rather than left
to arrive as a value a document turns into nothing. Nothing closed: the win rate
is absent, which is a different claim from zero, and expectancy and its error are
zero because the type is money and money is not nullable. One closed trade: a
sample of one has no spread, so the standard error is zero. Every closed trade a
scratch: no denominator, so the win rate is absent again. Nothing lost: the profit
factor is absent rather than an infinity. Everything lost: the profit factor is
zero, expectancy is negative, the average win is zero, and none of the four is a
division by zero.
"""

import math
from dataclasses import dataclass
from typing import List, Optional, Sequence

from .equity import EquityPoint, bars_in_market_over, ratio_of
from .shapes import Contract
from .trades import Trade


@dataclass(frozen=True)
class Summary:
    """What the whole run came to."""

    capital: float
    currency: str
    net_profit: float
    #: Sum of winning trades, before charges.
    gross_profit: float
    #: The losing trades' gross, as a magnitude, and it can come out at or below
    #: zero: a trade whose gross was positive and whose charges took it under
    #: lands in the losses carrying a positive gross. ``_tally_of`` says why that
    #: is preferred to counting one trade as a loser in one figure and a winner in
    #: another, and it is written here because a reader dividing by it was handed a
    #: negative profit factor with nothing saying that could happen.
    gross_loss: float
    charges: float
    #: net profit over capital, a fraction and not a figure times a hundred.
    return_percent: float
    #: Closed only.
    trade_count: int
    open_trade_count: int
    wins: int
    losses: int
    #: Exactly zero net.
    scratches: int
    #: wins over wins plus losses, absent when none closed.
    win_rate: Optional[float]
    average_win: float
    #: Positive magnitude.
    average_loss: float
    #: Money per closed trade.
    expectancy: float
    expectancy_standard_error: float
    #: Gross profit over gross loss, absent where there is no ratio to take. A
    #: profit factor is a non-negative ratio everywhere it is used, so a negative
    #: one is not a surprising value, it is a number nobody can act on.
    profit_factor: Optional[float]
    #: Zero or negative, the same sign the curve states it with.
    max_drawdown: float
    #: The deepest point's own fraction, not the worst fraction of any point.
    max_drawdown_percent: float
    #: A bar time, never an index.
    max_drawdown_at: Optional[float]
    longest_drawdown_bars: int
    average_bars_held: Optional[float]
    bars_in_market: int
    bar_count: int


@dataclass
class _Tally:
    """The closed trades split three ways, and the sums each half contributes."""

    net_profit: float = 0.0
    gross_profit: float = 0.0
    gross_loss: float = 0.0
    charges: float = 0.0
    trade_count: int = 0
    open_trade_count: int = 0
    wins: int = 0
    losses: int = 0
    scratches: int = 0
    win_total: float = 0.0
    loss_total: float = 0.0
    held_total: float = 0.0
    held_count: int = 0


@dataclass
class _Depth:
    """The deepest point of the curve, and how long the run stayed under water."""

    max_drawdown: float = 0.0
    max_drawdown_percent: float = 0.0
    max_drawdown_at: Optional[float] = None
    longest_drawdown_bars: int = 0


def _tally_of(trades: Sequence[Trade]) -> _Tally:
    """One pass over the trades, in the order they are given.

    A trade wins or loses on its net after charges, and its gross is what it
    contributes to the gross figures: "the sum of the winning trades, before
    charges" is two statements and this is where they meet. The one arrangement
    that reads oddly is a trade whose gross was positive and whose charges took it
    under, which lands in the losses and takes its positive gross with it. That is
    on purpose: the alternative is a trade counted as a loser in one figure and a
    winner in another, and a profit factor whose two halves are counted over
    different sets is worse than one whose magnitude is odd on a trade that barely
    moved.
    """
    tally = _Tally()
    for trade in trades:
        tally.charges += trade.charges
        if trade.is_open:
            tally.open_trade_count += 1
            continue
        tally.trade_count += 1
        tally.net_profit += trade.net_profit
        if trade.bars_held is not None:
            tally.held_total += trade.bars_held
            tally.held_count += 1
        if trade.net_profit > 0:
            tally.wins += 1
            tally.win_total += trade.net_profit
            tally.gross_profit += trade.gross_profit
        elif trade.net_profit < 0:
            tally.losses += 1
            tally.loss_total += trade.net_profit
            tally.gross_loss -= trade.gross_profit
        else:
            tally.scratches += 1
    return tally


def _depth_of(equity: Sequence[EquityPoint]) -> _Depth:
    """The deepest the curve went, named as one point rather than as three figures.

    The money, the fraction and the time all come from the same point, and the
    point is the deepest in money with the earliest one winning a tie. Taking the
    worst fraction from one bar and the worst money from another would describe a
    moment the run never had.

    The longest run is the longest stretch of consecutive bars under a peak, which
    is often the figure that actually stops a trader, and it is not the total
    number of bars spent under water.
    """
    depth = _Depth()
    under = 0
    for point in equity:
        if point.drawdown < depth.max_drawdown:
            depth.max_drawdown = point.drawdown
            depth.max_drawdown_percent = point.drawdown_percent
            depth.max_drawdown_at = point.time
        if point.drawdown < 0:
            under += 1
            if under > depth.longest_drawdown_bars:
                depth.longest_drawdown_bars = under
        else:
            under = 0
    return depth


def _standard_error_of(
    trades: Sequence[Trade], expectancy: float, trade_count: int
) -> float:
    """The sample deviation of per-trade net over the root of the count.

    The sample deviation, with the count less one under it, and not the population
    one. The trades a run took are a sample of the trades the strategy would take,
    which is the whole reason this figure is here, and the population spelling
    understates the spread by exactly the amount that matters on the short runs
    where the question is asked. Fewer than two closed trades has no spread to
    measure and gives zero.
    """
    if trade_count < 2:
        return 0.0
    squares = 0.0
    for trade in trades:
        if trade.is_open:
            continue
        away = trade.net_profit - expectancy
        squares += away * away
    return math.sqrt(squares / (trade_count - 1) / trade_count)


def summary_of(
    trades: Sequence[Trade],
    equity: Sequence[EquityPoint],
    contract: Contract,
    capital: float,
) -> Summary:
    """The whole run in one shape, folded from its trades and its own curve.

    The curve is passed in rather than recomputed, because a summary that folded
    its own would be a second equity curve with a second set of rounding, and the
    first disagreement between them would be a drawdown figure that no point in the
    reported curve ever reached.
    """
    tally = _tally_of(trades)
    depth = _depth_of(equity)
    decided = tally.wins + tally.losses

    # Net over the closed count, and nothing else, because this is the figure the
    # other spelling is checked against. The win rate spelling divides by the
    # decided trades instead, so the two are the same number exactly when no trade
    # scratched.
    expectancy = 0.0 if tally.trade_count == 0 else tally.net_profit / tally.trade_count

    return Summary(
        capital=capital,
        currency=contract.currency,
        net_profit=tally.net_profit,
        gross_profit=tally.gross_profit,
        gross_loss=tally.gross_loss,
        charges=tally.charges,
        return_percent=ratio_of(tally.net_profit, capital),
        trade_count=tally.trade_count,
        open_trade_count=tally.open_trade_count,
        wins=tally.wins,
        losses=tally.losses,
        scratches=tally.scratches,
        win_rate=None if decided == 0 else tally.wins / decided,
        average_win=0.0 if tally.wins == 0 else tally.win_total / tally.wins,
        average_loss=0.0 if tally.losses == 0 else -tally.loss_total / tally.losses,
        expectancy=expectancy,
        expectancy_standard_error=_standard_error_of(trades, expectancy, tally.trade_count),
        profit_factor=(
            tally.gross_profit / tally.gross_loss if tally.gross_loss > 0 else None
        ),
        max_drawdown=depth.max_drawdown,
        max_drawdown_percent=depth.max_drawdown_percent,
        max_drawdown_at=depth.max_drawdown_at,
        longest_drawdown_bars=depth.longest_drawdown_bars,
        average_bars_held=(
            None if tally.held_count == 0 else tally.held_total / tally.held_count
        ),
        bars_in_market=bars_in_market_over(trades, equity),
        bar_count=len(equity),
    )
