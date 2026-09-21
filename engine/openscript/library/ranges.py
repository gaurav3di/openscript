"""The readings of `stdlib.md` section 20.5 that are taken from the bar's own range.

**There are two true ranges and they are different quantities.** The plain one is
the call a script can make, and `stdlib.md` section 6 grants the oldest bar of
the dataset the library's one exception to absence propagation there: the reading
is ``high - low``, because the other two terms need a close that does not exist
and the bar's own range is a true statement about that bar. The gap aware form is
the same three terms with no exception, it is absent on that bar like any other
change, and it is what the choppiness reading and the directional index take.
Section 6 says which of the two a function takes by declaring its warmup one bar
later than the plain reading would give.

Neither form is written out again here. ``bars.py`` holds the three terms and the
exception, and this file asks it for the reading it wants by saying whether the
bar it is on is the oldest one.
"""

from typing import Optional

from . import averages, elementary
from .bars import true_range
from .extremes import window_high, window_low
from .series import Region, contributed, total, window
from .values import ABSENT, Value, number, result


def plain_range(ctx) -> Value:
    """``trueRange()`` as a stateful caller reads it, oldest bar exception and all."""
    return true_range(
        ctx.bar("high"), ctx.bar("low"), ctx.bar("previousClose"), ctx.first_bar()
    )


def gap_range(ctx) -> Value:
    """The gap aware form: the same three terms with no exception on the oldest bar.

    It is not a call a script can make. An engine reaches it through this half of
    the library, which is where the two functions that count changes rather than
    levels ask for it.
    """
    return true_range(ctx.bar("high"), ctx.bar("low"), ctx.bar("previousClose"), False)


def average_range(state: Region, ctx, length: Optional[int]) -> Value:
    """``atr(len)``: ``rma`` over ``trueRange``, that first bar included."""
    return averages.smoothed(state, plain_range(ctx), length)


def normalised_range(state: Region, ctx, length: Optional[int]) -> Value:
    """``natr(len)``: ``(100 * atr) / close``, the percentage form."""
    width = average_range(state, ctx, length)
    close = number(ctx.bar("close"))
    if not isinstance(width, float) or close is None:
        return ABSENT
    if close == 0:
        return ABSENT
    return result((100 * width) / close)


def channel(state: Region, ctx, length: Optional[int]) -> list:
    """``donchian(len)``: the window's outright high, its midpoint and its low.

    The midpoint is the mean of the two extremes as reported, which is the one
    arrangement section 20.3 states for a midpoint of a channel.
    """
    highs = contributed(state, "high", number(ctx.bar("high")), length)
    lows = contributed(state, "low", number(ctx.bar("low")), length)
    upper = window_high(highs, length)
    lower = window_low(lows, length)
    if not isinstance(upper, float) or not isinstance(lower, float):
        return [ABSENT, ABSENT, ABSENT]
    return [upper, result((upper + lower) / 2), lower]


def choppiness(state: Region, ctx, length: Optional[int]) -> Value:
    """``chop(len)``: the distance travelled against the range covered.

    The ratio is formed first, then its logarithm, then the multiplication by
    100, then the division by the logarithm of the length. The result is absent
    where the span or the distance is not above zero, and where the length is 1
    and the scale is zero.

    **This reading depends on ``log10``**, so it reaches gap 1 of section 20.11
    and carries no cross-engine guarantee: there is no portable reference
    algorithm for a logarithm anywhere in the specification.
    """
    ranges = contributed(state, "range", gap_range(ctx), length)
    highs = contributed(state, "high", number(ctx.bar("high")), length)
    lows = contributed(state, "low", number(ctx.bar("low")), length)
    held = window(ranges, length)
    upper = window_high(highs, length)
    lower = window_low(lows, length)
    if held is None or length is None:
        return ABSENT
    if not isinstance(upper, float) or not isinstance(lower, float):
        return ABSENT
    distance = total(held)
    span = upper - lower
    if span <= 0 or distance <= 0:
        return ABSENT
    travelled = elementary.log10(distance / span)
    scale = elementary.log10(float(length))
    if not isinstance(travelled, float) or not isinstance(scale, float) or scale == 0:
        return ABSENT
    return result((100 * travelled) / scale)
