"""The trades taken apart: by direction, by extreme, and by run.

The summary answers what the whole run did. Three questions it cannot answer are
asked here, and each of them is a question about whether the summary means what
it looks like it means.

**Which side made the money.** A run whose long trades paid for its short ones
reports a healthy net and is two strategies, one of which is losing. The summary
cannot show that, because every figure in it is folded over both sides at once.
Splitting it is not a refinement of the headline number, it is the first thing
that can contradict it.

**Whether one trade is the result.** A hundred trades and a profit factor of two
reads as an edge until the largest win is the whole of the net. The expectancy's
standard error already says how wide the spread is; the largest win and the
largest loss say where the width came from, which is the part a reader can act
on.

**What the run of losses was.** The deepest drawdown is a money figure and the
longest one is a bar count, and neither is the number that actually stops
somebody trading a strategy. That number is how many times in a row it was
wrong, and it is not derivable from anything in the summary: the same win rate
over the same trades gives a streak of two or a streak of eleven depending on an
ordering the summary folds away.

**Every figure here is over closed trades, and that is the whole rule.** An open
trade has no net to win or lose by, so it is in none of these counts, in no
streak and in no extreme. The consequence worth stating: ``long.count`` plus
``short.count`` is the summary's ``trade_count`` and not the length of the list
folded, and the summary's ``open_trade_count`` is where the difference goes.

This is the first engine's ``src/core/accounting/analysis.ts`` in this language's
spellings. The two are one algorithm and the conformance suite is what holds
them to it.
"""

from dataclasses import dataclass
from typing import List, Optional, Sequence

from .trades import Trade


@dataclass(frozen=True)
class SideAnalysis:
    """One direction's own figures, folded over that side's closed trades."""

    count: int
    wins: int
    losses: int
    #: Exactly zero net, counted in neither half, as in the summary.
    scratches: int
    #: Net after charges, which is the figure the sides are compared on.
    net_profit: float
    #: ``wins / (wins + losses)``, ``None`` where this side decided nothing.
    win_rate: Optional[float]


@dataclass(frozen=True)
class TradeAnalysis:
    """The trades by direction, by extreme and by run.

    ``long`` and ``short`` partition the closed trades, so their counts sum to
    the summary's ``trade_count`` and their nets sum to its ``net_profit``.
    """

    long: SideAnalysis
    short: SideAnalysis
    #: The best closed trade's net, zero where none closed and zero where every
    #: closed trade lost. Zero rather than ``None``, because the figure is read
    #: beside ``largest_loss`` and against the net, and a ``None`` in a column
    #: of money makes every reader handle a case that means "nothing won",
    #: which is what zero already means in this column.
    largest_win: float
    #: The worst closed trade's net as a positive magnitude, zero where none lost.
    largest_loss: float
    #: The longest run of consecutive winning closed trades, in the order they
    #: closed, and not the order they opened: that is the order the account
    #: experienced them in. The two differ whenever a trade is held across
    #: another one's whole life, which is every scaling strategy.
    max_consecutive_wins: int
    #: The same, for losses.
    max_consecutive_losses: int


@dataclass
class _SideTally:
    """A side's figures under construction, before the rates are taken."""

    count: int = 0
    wins: int = 0
    losses: int = 0
    scratches: int = 0
    net_profit: float = 0.0


def _side_of(tally: _SideTally) -> SideAnalysis:
    decided = tally.wins + tally.losses
    return SideAnalysis(
        count=tally.count,
        wins=tally.wins,
        losses=tally.losses,
        scratches=tally.scratches,
        net_profit=tally.net_profit,
        win_rate=None if decided == 0 else tally.wins / decided,
    )


def analysis_of(trades: Sequence[Trade]) -> TradeAnalysis:
    """One pass over the closed trades, in closing order.

    The list arrives in opening order, which is what the equity fold needs. The
    streaks need closing order, so the closed trades are ordered here rather
    than anywhere else: reordering the list the caller holds would change the
    equity curve.

    A trade whose net is exactly zero is a scratch, which is the summary's rule.
    A scratch **breaks** a streak without extending either one: a strategy that
    went right, flat, right was not right twice running, and counting the flat
    trade as either would make the streak a figure that depends on a rounding at
    the last digit.
    """
    long = _SideTally()
    short = _SideTally()
    largest_win = 0.0
    largest_loss = 0.0
    max_consecutive_wins = 0
    max_consecutive_losses = 0
    win_streak = 0
    loss_streak = 0

    closed: List[Trade] = [trade for trade in trades if not trade.is_open]
    # A trade closes on a bar, and two can close on the same one. The opening
    # order breaks the tie, because it is the order the list arrived in and the
    # only other fact available: a sort that is not total gives two engines two
    # different streaks from one list of trades.
    closed.sort(key=lambda trade: (
            0 if trade.closed_on_bar is None else trade.closed_on_bar,
            trade.index,
        ))

    for trade in closed:
        side = long if trade.side == "long" else short
        side.count += 1
        side.net_profit += trade.net_profit

        if trade.net_profit > 0:
            side.wins += 1
            if trade.net_profit > largest_win:
                largest_win = trade.net_profit
            win_streak += 1
            loss_streak = 0
            if win_streak > max_consecutive_wins:
                max_consecutive_wins = win_streak
        elif trade.net_profit < 0:
            side.losses += 1
            if -trade.net_profit > largest_loss:
                largest_loss = -trade.net_profit
            loss_streak += 1
            win_streak = 0
            if loss_streak > max_consecutive_losses:
                max_consecutive_losses = loss_streak
        else:
            side.scratches += 1
            win_streak = 0
            loss_streak = 0

    return TradeAnalysis(
        long=_side_of(long),
        short=_side_of(short),
        largest_win=largest_win,
        largest_loss=largest_loss,
        max_consecutive_wins=max_consecutive_wins,
        max_consecutive_losses=max_consecutive_losses,
    )
