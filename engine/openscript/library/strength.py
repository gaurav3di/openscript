"""The position and strength readings of `stdlib.md` section 20.4.

Each of these asks the same question, where does this bar sit against its recent
past, and each answers it on a different scale. What they share is an
arrangement, and the arrangement is the thing two engines part company over:

- **The strength line is ``100 - 100 / (1 + up / down)``**, in that order: the
  ratio, then one added to it, then 100 divided by that, then subtracted from
  100. The other reading in circulation, ``100 * up / (up + down)``, is
  mathematically equal and lands one unit in the last place away on ordinary
  data. Over the eighty bar fixture the release gate compares bit for bit it
  differs on about half the values at every length.
- **The position readings multiply by 100 first**, which is the opposite of the
  directional index of section 20.3 and is deliberate: each is the association
  its own reading has always carried, and matching one to the other would move
  every value of one of them.
- **The deviation reading divides by the mean absolute deviation**, not by the
  standard deviation, and the constant is applied to the deviation rather than to
  the numerator. The 0.015 is calibrated against the mean absolute deviation, and
  substituting a standard deviation changes every reading while still producing a
  plausible line.

Naming a value first is not a second arrangement: writing the ratio into a name
and reading it back is bit identical to writing it out, because every operation
already rounds its result to binary64 (section 20.1's first rule).
"""

from typing import Optional

from . import averages, prices
from .extremes import window_high, window_low
from .series import Region, back, contributed, mean, region, total, window
from .values import ABSENT, Value, number, result


def line_of(up: Value, down: Value) -> Value:
    """The strength line both this section's reading and the money flow one take.

    **The result is 100 when the down side is zero**, which also covers a window
    that never moved and in which both sides are zero. The ratio has no value
    there, and every reference reading is 100.
    """
    if not isinstance(up, float) or not isinstance(down, float):
        return ABSENT
    if down == 0:
        return 100.0
    divisor = 1 + up / down
    if divisor == 0:
        return ABSENT
    return result(100 - 100 / divisor)


def rises_and_falls(values) -> tuple:
    """This bar's change split into the two sides, each an exact zero where flat.

    The falling side is formed by negating the change and taking the larger of
    that and zero, so a rising bar contributes an exact zero to it rather than a
    negative zero that a later division could carry a sign out of.
    """
    now = values[len(values) - 1]
    before = back(values, 1)
    if not isinstance(now, float) or not isinstance(before, float):
        return ABSENT, ABSENT
    delta = now - before
    up = delta if delta > 0 else 0.0
    down = -delta if -delta > 0 else 0.0
    return up, down


def strength(state: Region, value: Value, length: Optional[int]) -> Value:
    """``rsi(src, len)``: the one bar change split, each side smoothed with ``rma``."""
    values = contributed(state, "src", number(value), 2)
    up, down = rises_and_falls(values)
    average_up = averages.smoothed(region(state, "up"), up, length)
    average_down = averages.smoothed(region(state, "down"), down, length)
    return line_of(average_up, average_down)


def change_ratio(state: Region, value: Value, length: Optional[int]) -> Value:
    """``cmo(src, len)``: the two sides summed over the window outright, no smoothing."""
    values = contributed(state, "src", number(value), 2)
    up, down = rises_and_falls(values)
    rises = window(contributed(state, "up", up, length), length)
    falls = window(contributed(state, "down", down, length), length)
    if rises is None or falls is None:
        return ABSENT
    rise = total(rises)
    fall = total(falls)
    divisor = rise + fall
    if divisor == 0:
        return ABSENT
    return result((100 * (rise - fall)) / divisor)


def position(state: Region, ctx, length: Optional[int], smooth_k, smooth_d) -> list:
    """``stoch(len, smoothK, smoothD)``: the close inside the window's outright range.

    The range is the bars' own highs and lows and not the close's extremes, and
    the span is formed once: the result is absent where it is zero, which is a
    window that did not move at all.
    """
    highs = contributed(state, "high", number(ctx.bar("high")), length)
    lows = contributed(state, "low", number(ctx.bar("low")), length)
    raw = _placed(
        number(ctx.bar("close")), window_high(highs, length), window_low(lows, length)
    )
    return _smoothed_pair(state, raw, smooth_k, smooth_d)


def strength_position(
    state: Region,
    value: Value,
    strength_length: Optional[int],
    window_length: Optional[int],
    smooth_k,
    smooth_d,
) -> list:
    """``stochRsi(...)``: the same three lines with the strength reading in place of the close.

    The window high and the window low are taken from the strength reading itself
    rather than from the bars, which is the whole difference between this and the
    reading above.
    """
    reading = strength(region(state, "rsi"), value, strength_length)
    values = contributed(state, "src", reading, window_length)
    raw = _placed(
        reading if isinstance(reading, float) else None,
        window_high(values, window_length),
        window_low(values, window_length),
    )
    return _smoothed_pair(state, raw, smooth_k, smooth_d)


def range_position(state: Region, ctx, length: Optional[int]) -> Value:
    """``williamsR(len)``: the same position on the other scale.

    It is formed from the distance below the window high rather than as the
    stochastic reading less one hundred, which is a different last bit.
    """
    highs = contributed(state, "high", number(ctx.bar("high")), length)
    lows = contributed(state, "low", number(ctx.bar("low")), length)
    close = number(ctx.bar("close"))
    top = window_high(highs, length)
    bottom = window_low(lows, length)
    if close is None or not isinstance(top, float) or not isinstance(bottom, float):
        return ABSENT
    span = top - bottom
    if span == 0:
        return ABSENT
    return result((-100 * (top - close)) / span)


def deviation_reading(state: Region, ctx, length: Optional[int]) -> Value:
    """``cci(len)``: how far the typical price sits from its mean, in deviation units."""
    price = prices.typical(ctx)
    held = window(contributed(state, "src", price, length), length)
    if held is None or length is None or not isinstance(price, float):
        return ABSENT
    middle = mean(held, length)
    spread = 0.0
    for at in range(length - 1, -1, -1):
        spread = spread + abs(held[at] - middle)
    spread = spread / length
    divisor = 0.015 * spread
    if divisor == 0:
        return ABSENT
    return result((price - middle) / divisor)


def _placed(value: Optional[float], top: Value, bottom: Value) -> Value:
    """The position of a value inside a span, scaled by 100 before the division."""
    if value is None or not isinstance(top, float) or not isinstance(bottom, float):
        return ABSENT
    span = top - bottom
    if span == 0:
        return ABSENT
    return result((100 * (value - bottom)) / span)


def _smoothed_pair(state: Region, raw: Value, smooth_k, smooth_d) -> list:
    """The two smoothed lines both position readings report, in that order."""
    fast = averages.simple(region(state, "k"), raw, smooth_k)
    slow = averages.simple(region(state, "d"), fast, smooth_d)
    return [fast, slow]
