"""The momentum readings of `stdlib.md` section 20.4, and the two gaps between means.

**These scale by 100 before dividing**, which is the association their own
readings have always carried and the opposite of the directional index of section
20.3. Writing one of them the other way round moves every value it reports.

Two of them are named in section 20.4 only so that the absence of a recipe is not
read as an oversight: the momentum reading is a single subtraction, and the
awesome oscillator is the fast simple mean of the bar midpoint less the slow one,
in that order.
"""

from typing import Optional

from . import averages, bookkeeping, composites, prices
from .series import Region, back, contributed, region, total, window
from .values import ABSENT, Value, number, result


def gap(
    state: Region,
    value: Value,
    fast_length: Optional[int],
    slow_length: Optional[int],
    signal_length: Optional[int],
    percent: bool,
) -> list:
    """``macd(...)`` and ``ppo(...)``, which differ only in the first line.

    The signal average is fed the line absences and all, so it seeds on the first
    ``signal`` values the line produced, which is where its warmup comes from. The
    histogram is the difference of the two values as reported, not recomputed
    from the averages.
    """
    fast = averages.exponential(region(state, "fast"), value, fast_length)
    slow = averages.exponential(region(state, "slow"), value, slow_length)
    line = ABSENT
    if isinstance(fast, float) and isinstance(slow, float):
        if not percent:
            line = result(fast - slow)
        elif slow != 0:
            line = result((100 * (fast - slow)) / slow)
    trigger = averages.exponential(region(state, "signal"), line, signal_length)
    histogram = ABSENT
    if isinstance(line, float) and isinstance(trigger, float):
        histogram = result(line - trigger)
    return [line, trigger, histogram]


def distance(state: Region, value: Value, length: Optional[int]) -> Value:
    """``mom(src, len)``: ``src - src[len]``, which is the change of section 9."""
    return bookkeeping.change(state, value, length)


def rate(state: Region, value: Value, length: Optional[int]) -> Value:
    """``roc(src, len)``: the same change as a percentage of the older value."""
    keep = None if length is None else length + 1
    values = contributed(state, "src", number(value), keep)
    now = values[len(values) - 1]
    before = back(values, length)
    if not isinstance(now, float) or not isinstance(before, float) or before == 0:
        return ABSENT
    return result((100 * (now - before)) / before)


def midpoint_gap(
    state: Region, ctx, fast_length: Optional[int], slow_length: Optional[int]
) -> Value:
    """``awesomeOsc(fast, slow)``: the fast simple mean of the midpoint less the slow one."""
    value = prices.midpoint(ctx)
    fast = averages.simple(region(state, "fast"), value, fast_length)
    slow = averages.simple(region(state, "slow"), value, slow_length)
    if not isinstance(fast, float) or not isinstance(slow, float):
        return ABSENT
    return result(fast - slow)


def smoothed_rate(state: Region, value: Value, length: Optional[int]) -> Value:
    """``trix(src, len)``: the one bar percentage change of a triple exponential mean.

    The other reading in circulation takes the change of the logarithm of the
    average instead. It is a different number and it is not what section 5
    describes.
    """
    smoothed = composites.smoothed_three(region(state, "chain"), value, length)
    values = contributed(state, "smoothed", smoothed, 2)
    now = values[len(values) - 1]
    before = back(values, 1)
    if not isinstance(now, float) or not isinstance(before, float) or before == 0:
        return ABSENT
    return result((100 * (now - before)) / before)


def double_smoothed(
    state: Region, value: Value, long_length: Optional[int], short_length: Optional[int]
) -> Value:
    """``tsi(src, longLen, shortLen)``: the one bar change smoothed twice, over its own size.

    The long length comes first and the short one second, and the absolute size
    of the change is smoothed the same way in its own pair of state regions.
    """
    delta = bookkeeping.change(state, value, 1)
    size = abs(delta) if isinstance(delta, float) else ABSENT
    smoothed_change = _twice(region(state, "change"), delta, long_length, short_length)
    smoothed_size = _twice(region(state, "size"), size, long_length, short_length)
    if not isinstance(smoothed_change, float) or not isinstance(smoothed_size, float):
        return ABSENT
    if smoothed_size == 0:
        return ABSENT
    return result((100 * smoothed_change) / smoothed_size)


def _twice(
    state: Region, value: Value, long_length: Optional[int], short_length: Optional[int]
) -> Value:
    """One quantity smoothed with the long length and then with the short one."""
    once = averages.exponential(region(state, "long"), value, long_length)
    return averages.exponential(region(state, "short"), once, short_length)


def detrended(state: Region, value: Value, length: Optional[int]) -> Value:
    """``dpo(src, len)``: the simple mean removed as it stood, displaced back.

    The displacement is ``floor(len / 2) + 1`` bars, which is what the declared
    warmup of bar ``len + floor(len / 2)`` requires.
    """
    price = number(value)
    average = averages.simple(region(state, "mean"), price, length)
    shift = None if length is None else length // 2 + 1
    keep = None if shift is None else shift + 1
    held = contributed(state, "mean-values", average, keep)
    older = back(held, shift)
    if price is None or not isinstance(older, float):
        return ABSENT
    return result(price - older)


def blended(
    state: Region,
    ctx,
    first_length: Optional[int],
    second_length: Optional[int],
    third_length: Optional[int],
) -> Value:
    """``ultimateOsc(len1, len2, len3)``: pressure over range, blended over three windows.

    Both per-bar terms are formed against the previous close, which is the close
    of the bar before this one as this call site saw it and not a fact the host
    states: this reading counts changes, so the oldest bar has no term at all and
    the exception section 6 grants the plain true range has nothing to do with
    it. The three weighted terms are added left to right, shortest window first,
    and the division by 7 is applied once at the end.
    """
    high = number(ctx.bar("high"))
    low = number(ctx.bar("low"))
    close = number(ctx.bar("close"))
    before = back(contributed(state, "close", number(ctx.bar("close")), 2), 1)
    pressure = ABSENT
    span = ABSENT
    if high is not None and low is not None and close is not None:
        if isinstance(before, float):
            floor_of = low if low < before else before
            ceiling_of = high if high > before else before
            pressure = result(close - floor_of)
            span = result(ceiling_of - floor_of)
    deepest = _deepest(first_length, second_length, third_length)
    pressures = contributed(state, "pressure", pressure, deepest)
    spans = contributed(state, "range", span, deepest)
    fast = _ratio(pressures, spans, first_length)
    middle = _ratio(pressures, spans, second_length)
    slow = _ratio(pressures, spans, third_length)
    if not isinstance(fast, float) or not isinstance(middle, float):
        return ABSENT
    if not isinstance(slow, float):
        return ABSENT
    blend = 4 * fast
    blend = blend + 2 * middle
    blend = blend + slow
    return result((100 * blend) / 7)


def _deepest(*lengths) -> Optional[int]:
    """The widest of the three windows, which is what both buffers keep."""
    known = [one for one in lengths if one is not None]
    return max(known) if known else None


def _ratio(pressures, spans, length: Optional[int]) -> Value:
    """One window's pressure over its range, each the fresh sum of section 20.2.1."""
    top = window(pressures, length)
    bottom = window(spans, length)
    if top is None or bottom is None:
        return ABSENT
    numerator = result(total(top))
    divisor = result(total(bottom))
    if numerator is None or divisor is None or divisor == 0:
        return ABSENT
    return result(numerator / divisor)
