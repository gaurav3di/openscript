"""The spread readings of `stdlib.md` section 20.5 and the bands built on them.

**The variance is two passes and the one pass arrangement is not permitted.**
Subtracting the square of the mean from the mean of the squares is mathematically
equal, loses most of its significant digits on a price series where the values
are large and their spread is small, and can return a negative variance that then
has to be floored at zero. An implementation that needs a floor to stay real is
computing a different quantity, and the floor is how it hides.

**The two readings taken from the bands are computed from the bands as
reported.** A study that plots all three lines and a study that plots one reading
then agree to the last bit, which they would not if the reading were rebuilt from
the basis and the width.
"""

from typing import Optional

from . import averages, composites, elementary, ranges
from .series import Region, contributed, mean, region, window
from .values import ABSENT, Value, number, result


def variance(
    state: Region, value: Value, length: Optional[int], sample: Value
) -> Value:
    """``variance(src, len, sample)``: the mean first, the deviations from it second.

    Each deviation is squared as a product of the deviation with itself. The
    divisor is ``len`` for the population form and ``len - 1`` for the sample
    form, which is what the argument names rather than a correction a script has
    to write by hand.
    """
    held = window(contributed(state, "src", number(value), length), length)
    if held is None or length is None:
        return ABSENT
    squares = spread_of(held, length)
    divisor = (length - 1) if sample is True else length
    if divisor == 0:
        return ABSENT
    return result(squares / divisor)


def spread_of(held, length: int) -> float:
    """The second pass: the squared deviations from the finished mean, oldest first."""
    middle = mean(held, length)
    squares = 0.0
    for at in range(length - 1, -1, -1):
        squares = squares + (held[at] - middle) * (held[at] - middle)
    return squares


def deviation(
    state: Region, value: Value, length: Optional[int], sample: Value
) -> Value:
    """``stdev(src, len, sample)``: the square root of that variance, taken once."""
    return elementary.sqrt(variance(state, value, length, sample))


def bands(state: Region, value: Value, length: Optional[int], multiplier: Value) -> list:
    """``bollinger(src, len, mult)``: a mean with deviation bands, formed as written.

    The multiplier is applied to the width and the product added to the basis,
    which is one rounding of the product and one of the sum.
    """
    basis = averages.simple(region(state, "basis"), value, length)
    width = deviation(region(state, "width"), value, length, False)
    return _banded(basis, width, number(multiplier))


def band_width(
    state: Region, value: Value, length: Optional[int], multiplier: Value
) -> Value:
    """``bbWidth(src, len, mult)``: the band width over the basis, a squeeze reads low."""
    basis, upper, lower = bands(state, value, length, multiplier)
    if not isinstance(upper, float) or not isinstance(lower, float):
        return ABSENT
    if not isinstance(basis, float) or basis == 0:
        return ABSENT
    return result((upper - lower) / basis)


def band_position(
    state: Region, value: Value, length: Optional[int], multiplier: Value
) -> Value:
    """``bbPercent(src, len, mult)``: where the source sits between the two bands."""
    _basis, upper, lower = bands(state, value, length, multiplier)
    price = number(value)
    if not isinstance(upper, float) or not isinstance(lower, float) or price is None:
        return ABSENT
    span = upper - lower
    if span == 0:
        return ABSENT
    return result((price - lower) / span)


def range_bands(
    state: Region,
    ctx,
    length: Optional[int],
    multiplier: Value,
    width_length: Optional[int],
    kind: Value,
) -> list:
    """``keltner(len, mult, atrLen, maType)``: the same picture built from the range.

    **The basis is the close**, averaged at ``len`` by the type the argument
    names, and not the typical price. Section 6 writes the call without a source
    argument and the close is the source it means: the two agree only on a bar
    whose close is its own typical price, so this decides which function the call
    is rather than the order its arithmetic runs in.

    The width is the average true range exactly as section 20.5 defines it, the
    oldest bar's exception included, and not the gap aware form the directional
    index takes.
    """
    basis = composites.named(region(state, "basis"), ctx, ctx.bar("close"), length, kind)
    width = ranges.average_range(region(state, "width"), ctx, width_length)
    return _banded(basis, width, number(multiplier))


def historical(
    state: Region, value: Value, length: Optional[int], periods: Value
) -> Value:
    """``hv(src, len, periodsPerYear)``: the spread of the log return, annualised once.

    The ratio is formed before the logarithm is taken. The result is a proportion
    and is not scaled by a hundred: section 6 says annualised standard deviation
    of log returns and says nothing about a percentage, so a study that wants a
    percentage axis multiplies at the plot, where a reader can see it happen.

    The logarithm follows the portable interval recipe of section 20.10.2.
    """
    values = contributed(state, "src", number(value), 2)
    now = values[len(values) - 1]
    before = values[len(values) - 2] if len(values) > 1 else ABSENT
    ratio = ABSENT
    if isinstance(now, float) and isinstance(before, float) and now > 0 and before > 0:
        ratio = now / before
    step = elementary.log(ratio)
    spread = deviation(region(state, "spread"), step, length, False)
    count = number(periods)
    if count is None or count <= 0:
        return ABSENT
    scale = elementary.sqrt(count)
    if not isinstance(spread, float) or not isinstance(scale, float):
        return ABSENT
    return result(spread * scale)


def _banded(basis: Value, width: Value, multiplier: Optional[float]) -> list:
    """The three lines of a band study: the basis, and the width either side of it."""
    if not isinstance(basis, float) or not isinstance(width, float):
        return [basis if isinstance(basis, float) else ABSENT, ABSENT, ABSENT]
    if multiplier is None:
        return [basis, ABSENT, ABSENT]
    return [basis, result(basis + multiplier * width), result(basis - multiplier * width)]
