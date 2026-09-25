"""The means of `stdlib.md` section 20.3 that are built out of other means, and the fit.

Four of these feed one average's output into another, absences and all, which is
where their warmups come from: the outer average seeds on the first values the
inner one produced, not on the first bars of the source. That composition is the
whole reason `stdlib.md` section 1 states warmups in bars of the call's own
source rather than in bars of the chart.

The other two compute over the window directly: the portable Gaussian kernel
of section 20.10.2, and the least
squares fit, whose constants are functions of the length alone.

``named`` is here rather than beside the six means because it has to be able to
select any of them, this file's included.
"""

import math

from . import averages, elementary
from .gaussian import gaussian_weights
from .rounding import round_half_away
from .series import Region, contributed, region, window
from .values import ABSENT, Value, number, result, whole

#: The six averages ``ma`` and the channel studies select by name, section 4.
NAMED = ("sma", "ema", "wma", "rma", "hma", "vwma")


def named(state: Region, ctx, value: Value, length: int | None, kind: Value) -> Value:
    """``ma(src, len, type)``: exactly the named average's arithmetic.

    Each type has a state region of its own, so a run that switched type mid
    history starts the new average from its own seed rather than from what the
    old one left behind. The volume weighted type reads the bar, which is why
    this one takes the context that the five others have no use for.
    """
    if not isinstance(kind, str) or kind not in NAMED:
        return ABSENT
    held = region(state, kind)
    if kind == "sma":
        return averages.simple(held, value, length)
    if kind == "ema":
        return averages.exponential(held, value, length)
    if kind == "wma":
        return averages.linear(held, value, length)
    if kind == "rma":
        return averages.smoothed(held, value, length)
    if kind == "hma":
        return hull(held, value, length)
    return averages.volume_weighted(held, value, ctx.bar("volume"), length)


def half_length(length: int | None) -> int | None:
    """``floor(len / 2)``, held at a minimum of 1: the inner length of ``hma``.

    Section 4 fixes the outer length and says nothing about this one, so it is
    gap 2 of section 20.11: an implementation choice recorded rather than a
    reading of the page. Selecting the average by name reaches the gap as surely
    as calling it.
    """
    if length is None:
        return None
    half = length // 2
    return 1 if half < 1 else half


def root_length(length: int | None) -> int | None:
    """``round(sqrt(len))``, held at a minimum of 1: the outer length of ``hma``.

    The rounding is section 8.1's, halves away from zero, and the square root is
    the one call section 20.10 exempts from gap 1: IEEE-754 has it correctly
    rounded, so it is bit identical on every conforming platform without a
    portable implementation of its own.
    """
    if length is None:
        return None
    outer = whole(round_half_away(math.sqrt(float(length))))
    return 1 if outer is None or outer < 1 else outer


def hull(state: Region, value: Value, length: int | None) -> Value:
    """``hma(src, len)``: three linearly weighted means, the raw one formed left to right.

    The raw series is fed to the outer mean absences and all, so the outer mean
    fills on the first ``outer`` values it produced, which is where the declared
    warmup of ``len + round(sqrt(len)) - 2`` comes from.
    """
    fast = averages.linear(region(state, "half"), value, half_length(length))
    slow = averages.linear(region(state, "full"), value, length)
    raw = ABSENT
    if isinstance(fast, float) and isinstance(slow, float):
        raw = result(2 * fast - slow)
    return averages.linear(region(state, "outer"), raw, root_length(length))


def doubled(state: Region, value: Value, length: int | None) -> Value:
    """``dema(src, len)``: ``2 * e1 - e2``, formed left to right."""
    first, second, _third = _chain(state, value, length, 2)
    if not isinstance(first, float) or not isinstance(second, float):
        return ABSENT
    return result(2 * first - second)


def tripled(state: Region, value: Value, length: int | None) -> Value:
    """``tema(src, len)``: three terms added left to right, not ``3 * (e1 - e2) + e3``."""
    first, second, third = _chain(state, value, length, 3)
    if not isinstance(first, float) or not isinstance(second, float):
        return ABSENT
    if not isinstance(third, float):
        return ABSENT
    return result(3 * first - 3 * second + third)


def _chain(state: Region, value: Value, length: int | None, depth: int):
    """The exponential means of a chain, each fed the previous one's output.

    Absences and all: an average fed absence freezes rather than skipping, which
    is what makes the third mean's warmup three times the length less three
    rather than an accident of how much history happened to be present.
    """
    first = averages.exponential(region(state, "one"), value, length)
    second = averages.exponential(region(state, "two"), first, length)
    if depth < 3:
        return first, second, ABSENT
    third = averages.exponential(region(state, "three"), second, length)
    return first, second, third


def smoothed_three(state: Region, value: Value, length: int | None) -> Value:
    """The third mean of the same chain, which is what ``trix`` takes the change of."""
    _first, _second, third = _chain(state, value, length, 3)
    return third


def gaussian(
    state: Region, value: Value, length: int | None, offset: Value, sigma: Value
) -> Value:
    """``alma(src, len, offset, sigma)``: the kernel built from the position, two passes.

    Position 0 is the oldest bar of the window and both passes run over that
    order. The denominator of the exponent is **one product, divided once**: the
    chain of divisions in circulation differs on about one exponent in four.

    A bounded pure cache holds immutable weights for exact parameter values.
    It holds no source observations and does not enter checkpoint state.
    """
    values = contributed(state, "src", number(value), length)
    held = window(values, length)
    peak_at = number(offset)
    width = number(sigma)
    if held is None or length is None or peak_at is None or width is None:
        return ABSENT
    if width <= 0:
        return ABSENT
    kernel = gaussian_weights(length, peak_at, width)
    if kernel is None:
        return ABSENT
    weights, norm = kernel
    running = 0.0
    for position in range(length):
        running = running + held[length - 1 - position] * weights[position]
    if norm == 0:
        return ABSENT
    return result(running / norm)


def fitted(state: Region, value: Value, length: int | None, offset: Value) -> Value:
    """``linreg(src, len, offset)``: the least squares line, read ``offset`` bars back.

    ``x`` runs 0 at the oldest bar of the window to ``len - 1`` at this one, and
    the sums over ``x`` are constants of the length. **The sum of squares is one
    product divided once**: splitting the 6 into the two factors it is made of
    holds every intermediate below the whole product and parts company with this
    at 3716 of the first hundred thousand lengths, the first at a length of 15.

    The two accumulations each add their own terms oldest first and neither reads
    the other, so whether an engine runs them in one pass or two is not fixed.
    The result is absent where the divisor is zero, which is every window of
    length 1: a line fitted to one point is not a fit.
    """
    values = contributed(state, "src", number(value), length)
    held = window(values, length)
    back = number(offset)
    if held is None or length is None or back is None:
        return ABSENT
    span = float(length)
    sum_x = ((span - 1) * span) / 2
    sum_x_squared = ((span - 1) * span * (2 * span - 1)) / 6
    divisor = span * sum_x_squared - sum_x * sum_x
    if divisor == 0:
        return ABSENT
    sum_y = 0.0
    sum_xy = 0.0
    for position in range(length):
        y = held[length - 1 - position]
        sum_y = sum_y + y
        sum_xy = sum_xy + y * float(position)
    slope = (span * sum_xy - sum_x * sum_y) / divisor
    intercept = (sum_y - slope * sum_x) / span
    return result(intercept + slope * (span - 1 - back))
