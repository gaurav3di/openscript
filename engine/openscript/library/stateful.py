"""The stateful half of the library manifest: what a name and an arity resolve to.

The other half of the table ``stateless.py`` holds, on the same terms.
`compiled-program.md` section 2.5 has the engine check every entry of a program's
library table against its manifest at load, by name and by arity, and ``state``
and ``effect`` have to agree there as well, so a row is wrong if it says a
function holds nothing when it holds a window.

**Every entry here is ``state`` true and ``effect`` none.** A region is created
per call site by the engine and handed back to the same call site on every bar,
and section 6's rollback copies it without knowing whose it is. That is why a
call here takes three things rather than two: the context, the arguments, and
the region it is the only reader of.

**A kernel takes the context only where the vector file says it read the bar.**
``atr`` reads the high, the low and the previous close; ``sma`` reads nothing but
its arguments. Passing the context to everything would make it impossible to
tell, from this file, which functions an engine has to state bar facts for.
"""

from typing import Any, Callable, List, NamedTuple, Optional, Sequence

from . import (
    averages,
    bookkeeping,
    composites,
    counting,
    deviation,
    extremes,
    flows,
    momentum,
    ranges,
    strength,
    trend,
)
from .series import Region
from .stateless import Context
from .values import Value, whole

#: One library call at a bar: the context, this bar's arguments, and the region.
Call = Callable[[Context, Sequence[Value], Region], Value]


class Entry(NamedTuple):
    """One manifest row, the four fields of section 2.5 and the call itself."""

    name: str
    arity: int
    call: Call
    state: bool = True
    effect: str = "none"


def at(args: Sequence[Value], index: int) -> Value:
    """An argument, or absence where the caller passed fewer than the arity.

    A call arrives with its defaults already filled (`compiled-program.md`
    section 4.10), so a short argument list is a program the load-time check
    should have refused. Absence rather than a raise, for the reason
    ``values.py`` gives: nothing in this package raises.
    """
    return args[index] if index < len(args) else None


def length_of(value: Value) -> Optional[int]:
    """A length argument as the whole number of bars it has to be.

    `stdlib.md` section 2.5 refuses a fractional or negative length with a
    diagnostic before the call arrives, so what is left here is the backstop:
    anything that is not a whole count is absence, and a window of absence is
    absent rather than guessed at.
    """
    return whole(value)


def _measured(name: str, of: Callable[[Region, Value, Optional[int]], Value]) -> Entry:
    """A row of the shape ``(src, len)``, which most of the library is."""
    return Entry(name, 2, lambda ctx, args, state: of(state, at(args, 0), length_of(at(args, 1))))


def _windowed(name: str, of: Callable[[Region, Any, Optional[int]], Value]) -> Entry:
    """A row of the shape ``(len)`` whose kernel reads the bar."""
    return Entry(name, 1, lambda ctx, args, state: of(state, ctx, length_of(at(args, 0))))


def _pivot(name: str, of) -> Entry:
    """A row of the shape ``(src, left, right)``."""
    return Entry(
        name,
        3,
        lambda ctx, args, state: of(
            state, at(args, 0), length_of(at(args, 1)), length_of(at(args, 2))
        ),
    )


def _paired(name: str, of) -> Entry:
    """A row of the shape ``(a, b, len)``, two series over one window."""
    return Entry(
        name,
        3,
        lambda ctx, args, state: of(state, at(args, 0), at(args, 1), length_of(at(args, 2))),
    )


def _crossing(name: str, of) -> Entry:
    """A row of the shape ``(a, b)``, which is every crossing test."""
    return Entry(name, 2, lambda ctx, args, state: of(state, at(args, 0), at(args, 1)))


def _array(items: List[Value], ctx: Context) -> Value:
    """A multi-output call's answer: an array that is never absent, section 2.3."""
    return ctx.make_array(items)


# `stdlib.md` section 20.3, the means.
_AVERAGES: tuple[Entry, ...] = (
    _measured("sma", averages.simple),
    _measured("ema", averages.exponential),
    _measured("rma", averages.smoothed),
    _measured("wma", averages.linear),
    Entry("swma", 1, lambda ctx, args, state: averages.symmetric(state, at(args, 0))),
    Entry(
        "vwma",
        2,
        lambda ctx, args, state: averages.volume_weighted(
            state, at(args, 0), ctx.bar("volume"), length_of(at(args, 1))
        ),
    ),
    _measured("hma", composites.hull),
    _measured("dema", composites.doubled),
    _measured("tema", composites.tripled),
    Entry(
        "alma",
        4,
        lambda ctx, args, state: composites.gaussian(
            state, at(args, 0), length_of(at(args, 1)), at(args, 2), at(args, 3)
        ),
    ),
    Entry(
        "linreg",
        3,
        lambda ctx, args, state: composites.fitted(
            state, at(args, 0), length_of(at(args, 1)), at(args, 2)
        ),
    ),
    Entry(
        "ma",
        3,
        lambda ctx, args, state: composites.named(
            state, ctx, at(args, 0), length_of(at(args, 1)), at(args, 2)
        ),
    ),
)


# `stdlib.md` section 20.8, the totals and the ranks, and section 20.10's scans.
_HELPERS: tuple[Entry, ...] = (
    _measured("highest", extremes.highest),
    _measured("lowest", extremes.lowest),
    _measured("highestBars", extremes.highest_bars),
    _measured("lowestBars", extremes.lowest_bars),
    _pivot("pivotHigh", extremes.pivot_high),
    _pivot("pivotLow", extremes.pivot_low),
    _measured("sum", counting.windowed_sum),
    _measured("count", counting.counted),
    _measured("sumSkip", counting.skipping_sum),
    _measured("avgSkip", counting.skipping_mean),
    _measured("countPresent", counting.present_count),
    _measured("median", counting.middle),
    _measured("percentRank", counting.rank_of),
    Entry("cum", 1, lambda ctx, args, state: counting.accumulated(state, at(args, 0))),
    Entry(
        "history",
        2,
        lambda ctx, args, state: counting.history_at(state, at(args, 0), length_of(at(args, 1))),
    ),
    Entry(
        "percentile",
        3,
        lambda ctx, args, state: counting.ranked(
            state, at(args, 0), length_of(at(args, 1)), at(args, 2)
        ),
    ),
    _paired("covariance", counting.covariance),
    _paired("correlation", counting.correlation),
)

# `stdlib.md` section 9, the comparisons and the two that wait for a condition.
_BOOKKEEPING: tuple[Entry, ...] = (
    Entry("change", 1, lambda ctx, args, state: bookkeeping.change(state, at(args, 0), 1)),
    _measured("change", bookkeeping.change),
    _measured("rising", bookkeeping.rising),
    _measured("falling", bookkeeping.falling),
    _crossing("crossUp", bookkeeping.crossed_up),
    _crossing("crossDown", bookkeeping.crossed_down),
    _crossing("cross", bookkeeping.crossed),
    Entry("barsSince", 1, lambda ctx, args, state: bookkeeping.bars_since(state, at(args, 0))),
    Entry(
        "valueWhen",
        3,
        lambda ctx, args, state: bookkeeping.value_when(
            state, at(args, 0), at(args, 1), length_of(at(args, 2))
        ),
    ),
)


# `stdlib.md` section 20.5, the ranges and the bands.
_RANGES: tuple[Entry, ...] = (
    _windowed("atr", ranges.average_range),
    _windowed("natr", ranges.normalised_range),
    _windowed("chop", ranges.choppiness),
    Entry(
        "donchian",
        1,
        lambda ctx, args, state: _array(ranges.channel(state, ctx, length_of(at(args, 0))), ctx),
    ),
    Entry(
        "variance",
        3,
        lambda ctx, args, state: deviation.variance(
            state, at(args, 0), length_of(at(args, 1)), at(args, 2)
        ),
    ),
    Entry(
        "stdev",
        3,
        lambda ctx, args, state: deviation.deviation(
            state, at(args, 0), length_of(at(args, 1)), at(args, 2)
        ),
    ),
    Entry(
        "bollinger",
        3,
        lambda ctx, args, state: _array(
            deviation.bands(state, at(args, 0), length_of(at(args, 1)), at(args, 2)), ctx
        ),
    ),
    Entry(
        "bbWidth",
        3,
        lambda ctx, args, state: deviation.band_width(
            state, at(args, 0), length_of(at(args, 1)), at(args, 2)
        ),
    ),
    Entry(
        "bbPercent",
        3,
        lambda ctx, args, state: deviation.band_position(
            state, at(args, 0), length_of(at(args, 1)), at(args, 2)
        ),
    ),
    Entry(
        "keltner",
        4,
        lambda ctx, args, state: _array(
            deviation.range_bands(
                state,
                ctx,
                length_of(at(args, 0)),
                at(args, 1),
                length_of(at(args, 2)),
                at(args, 3),
            ),
            ctx,
        ),
    ),
    Entry(
        "hv",
        3,
        lambda ctx, args, state: deviation.historical(
            state, at(args, 0), length_of(at(args, 1)), at(args, 2)
        ),
    ),
)


# `stdlib.md` section 20.3, the trend studies that carry a decision from bar to bar.
_TREND: tuple[Entry, ...] = (
    Entry(
        "supertrend",
        2,
        lambda ctx, args, state: _array(
            trend.trailing_band(state, ctx, at(args, 0), length_of(at(args, 1))), ctx
        ),
    ),
    Entry(
        "psar",
        3,
        lambda ctx, args, state: _array(
            trend.accelerating_stop(state, ctx, at(args, 0), at(args, 1), at(args, 2)), ctx
        ),
    ),
    Entry(
        "adx",
        2,
        lambda ctx, args, state: _array(
            trend.directional(state, ctx, length_of(at(args, 0)), length_of(at(args, 1))), ctx
        ),
    ),
    Entry(
        "aroon",
        1,
        lambda ctx, args, state: _array(trend.ages(state, ctx, length_of(at(args, 0))), ctx),
    ),
    Entry(
        "ichimoku",
        3,
        lambda ctx, args, state: _array(
            trend.cloud(
                state, ctx, length_of(at(args, 0)), length_of(at(args, 1)), length_of(at(args, 2))
            ),
            ctx,
        ),
    ),
)


# `stdlib.md` section 20.4, the momentum and position readings.
_OSCILLATORS: tuple[Entry, ...] = (
    _measured("rsi", strength.strength),
    _measured("cmo", strength.change_ratio),
    _measured("mom", momentum.distance),
    _measured("roc", momentum.rate),
    _measured("trix", momentum.smoothed_rate),
    _measured("dpo", momentum.detrended),
    _windowed("cci", strength.deviation_reading),
    _windowed("williamsR", strength.range_position),
    Entry(
        "stoch",
        3,
        lambda ctx, args, state: _array(
            strength.position(
                state, ctx, length_of(at(args, 0)), length_of(at(args, 1)), length_of(at(args, 2))
            ),
            ctx,
        ),
    ),
    Entry(
        "stochRsi",
        5,
        lambda ctx, args, state: _array(
            strength.strength_position(
                state,
                at(args, 0),
                length_of(at(args, 1)),
                length_of(at(args, 2)),
                length_of(at(args, 3)),
                length_of(at(args, 4)),
            ),
            ctx,
        ),
    ),
    Entry(
        "macd",
        4,
        lambda ctx, args, state: _array(
            momentum.gap(
                state,
                at(args, 0),
                length_of(at(args, 1)),
                length_of(at(args, 2)),
                length_of(at(args, 3)),
                False,
            ),
            ctx,
        ),
    ),
    Entry(
        "ppo",
        4,
        lambda ctx, args, state: _array(
            momentum.gap(
                state,
                at(args, 0),
                length_of(at(args, 1)),
                length_of(at(args, 2)),
                length_of(at(args, 3)),
                True,
            ),
            ctx,
        ),
    ),
    Entry(
        "awesomeOsc",
        2,
        lambda ctx, args, state: momentum.midpoint_gap(
            state, ctx, length_of(at(args, 0)), length_of(at(args, 1))
        ),
    ),
    Entry(
        "tsi",
        3,
        lambda ctx, args, state: momentum.double_smoothed(
            state, at(args, 0), length_of(at(args, 1)), length_of(at(args, 2))
        ),
    ),
    Entry(
        "ultimateOsc",
        3,
        lambda ctx, args, state: momentum.blended(
            state, ctx, length_of(at(args, 0)), length_of(at(args, 1)), length_of(at(args, 2))
        ),
    ),
)


# `stdlib.md` section 20.6, the volume readings.
_VOLUME: tuple[Entry, ...] = (
    Entry("obv", 0, lambda ctx, args, state: flows.balance(state, ctx)),
    Entry("ad", 0, lambda ctx, args, state: flows.accumulation(state, ctx)),
    Entry("pvt", 0, lambda ctx, args, state: flows.price_trend(state, ctx)),
    Entry("vwap", 1, lambda ctx, args, state: flows.session_average(state, ctx, at(args, 0))),
    Entry(
        "vwapAnchor",
        2,
        lambda ctx, args, state: flows.anchored_average(state, ctx, at(args, 0), at(args, 1)),
    ),
    _windowed("cmf", flows.flow_fraction),
    _windowed("mfi", flows.money_flow),
    _windowed("eom", flows.movement),
    _windowed("forceIndex", flows.force),
    _windowed("relativeVolume", flows.relative_volume),
    Entry(
        "adOsc",
        2,
        lambda ctx, args, state: flows.accumulation_gap(
            state, ctx, length_of(at(args, 0)), length_of(at(args, 1))
        ),
    ),
)


ENTRIES: tuple[Entry, ...] = (
    _AVERAGES + _HELPERS + _BOOKKEEPING + _RANGES + _TREND + _OSCILLATORS + _VOLUME
)


def table() -> dict[tuple[str, int], Entry]:
    """The entries by name and arity, which is how a manifest is looked up."""
    return {(entry.name, entry.arity): entry for entry in ENTRIES}
