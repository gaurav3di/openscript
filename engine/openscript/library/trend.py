"""The trend studies of `stdlib.md` section 20.3 that carry a decision from bar to bar.

These five are the ones where a seeding rule is not a detail. A band that starts
on the wrong side, a stop clamped into the previous two bars' range, or a
directional reading smoothed against the wrong range is a **different study**
rather than a different last bit: it flips on different bars and stays apart
until a later flip happens to put the two back together. So each entry below
says what it is not, and the reason is in section 20.3 rather than here.

Both bands and both stops keep their state as plain numbers and a side, because
section 2.11 requires a region an engine can copy without knowing whose it is.
"""

from typing import Optional

from . import averages, prices, ranges
from .extremes import high_at, low_at
from .ranges import gap_range
from .series import Region, contributed, raw_window, region, window
from .values import ABSENT, Value, number, result

#: The two directions, as section 4 reports them: the sign of the side the band
#: is protecting against, so that ``direction != direction[1]`` reads as the flip.
LONG = -1.0
SHORT = 1.0


def trailing_band(state: Region, ctx, factor: Value, width_length: Optional[int]) -> list:
    """``supertrend(factor, atrLen)``: a trailing band from the average true range.

    On the first bar the width is available on, both bands are the raw bands,
    **the line starts on the upper band**, and the bar reports absence: the carry
    forward and the flip test both read the previous bar's close and the previous
    bar's bands, and on that bar there is neither. The band it leaves the state
    on is the one the bar after it inherits.

    Starting on the lower band is a different study. Measured over four hundred
    bars at three parameter sets, a line seeded there differed on between fifteen
    and forty of the bars it reported, by as much as sixteen price units, with the
    direction inverted on exactly those bars.
    """
    width = ranges.average_range(region(state, "width"), ctx, width_length)
    midpoint = prices.midpoint(ctx)
    close = number(ctx.bar("close"))
    multiple = number(factor)
    if not isinstance(width, float) or not isinstance(midpoint, float) or close is None:
        return [ABSENT, ABSENT]
    if multiple is None:
        return [ABSENT, ABSENT]
    held = region(state, "band")
    before = held.get("close")
    raw_upper = midpoint + multiple * width
    raw_lower = midpoint - multiple * width
    upper = held.get("upper")
    lower = held.get("lower")
    if upper is None or lower is None or before is None:
        upper, lower = raw_upper, raw_lower
        held["upper"] = upper
        held["lower"] = lower
        held["upside"] = not close > upper
        held["close"] = close
        return [ABSENT, ABSENT]
    if raw_upper < upper or before > upper:
        upper = raw_upper
    if raw_lower > lower or before < lower:
        lower = raw_lower
    upside = held.get("upside", True)
    upside = close <= upper if upside else not close >= lower
    held["upper"] = upper
    held["lower"] = lower
    held["upside"] = upside
    held["close"] = close
    return [result(upper if upside else lower), SHORT if upside else LONG]


def accelerating_stop(
    state: Region, ctx, start: Value, step: Value, most: Value
) -> list:
    """``psar(start, step, max)``: a stop that accelerates toward price.

    The stop moves first, then the flip test, then the extreme test, in that
    order. **The second test is reached on a flip bar as well**, where it cannot
    fire, because the extreme has just been set to this bar's own low or high and
    both comparisons are strict, so an engine that writes them as one chain and
    an engine that writes them as two agree on every bar.

    **The stop is reported as the recurrence produced it, and there is no clamp.**
    Holding it out of the previous two bars' range swallows flips this recurrence
    fires, because the next bar's flip test reads the stop this bar left behind.
    The two are different functions rather than two arrangements of one.
    """
    high = number(ctx.bar("high"))
    low = number(ctx.bar("low"))
    close = number(ctx.bar("close"))
    first = number(start)
    rise = number(step)
    ceiling = number(most)
    held = region(state, "stop")
    highs = contributed(state, "high", high, 2)
    lows = contributed(state, "low", low, 2)
    closes = contributed(state, "close", close, 2)
    if high is None or low is None or close is None:
        return [ABSENT, ABSENT]
    if first is None or rise is None or ceiling is None:
        return [ABSENT, ABSENT]
    stop = held.get("stop")
    if stop is None:
        return _seed_stop(held, highs, lows, closes, first)
    long = held.get("long", True)
    speed = held.get("speed", first)
    extreme = held.get("extreme", high)
    stop = stop + speed * (extreme - stop)
    if long and stop > low:
        long = False
        stop = extreme
        extreme = low
        speed = first
    elif not long and stop < high:
        long = True
        stop = extreme
        extreme = high
        speed = first
    if long and high > extreme:
        extreme = high
        speed = min(speed + rise, ceiling)
    elif not long and low < extreme:
        extreme = low
        speed = min(speed + rise, ceiling)
    held["stop"] = stop
    held["long"] = long
    held["speed"] = speed
    held["extreme"] = extreme
    return [result(stop), LONG if long else SHORT]


def _seed_stop(held: Region, highs, lows, closes, first: float) -> list:
    """The seed of section 20.3: the first pair of complete bars, and that bar reports it."""
    if len(closes) < 2:
        return [ABSENT, ABSENT]
    if not (isinstance(highs[-2], float) and isinstance(lows[-2], float)
            and isinstance(closes[-2], float)):
        return [ABSENT, ABSENT]
    before = closes[len(closes) - 2]
    now = closes[len(closes) - 1]
    high = highs[len(highs) - 1]
    low = lows[len(lows) - 1]
    long = now > before
    stop = lows[len(lows) - 2] if long else highs[len(highs) - 2]
    if not isinstance(stop, float):
        return [ABSENT, ABSENT]
    held["stop"] = stop
    held["long"] = long
    held["speed"] = first
    held["extreme"] = high if long else low
    return [result(stop), LONG if long else SHORT]


def directional(state: Region, ctx, di_length: Optional[int], adx_length: Optional[int]) -> list:
    """``adx(diLen, adxLen)``: directional movement against the gap aware true range.

    All three smoothed quantities cover the same bars, which is what the gap
    aware form is for: the plain reading's exception on the oldest bar would put
    the range one bar ahead of the two movements and the strength reading would
    be built from three windows that do not line up.

    **The division comes before the multiplication by 100 on all three lines.**
    The other association is the one the readings of section 20.4 use and it is a
    different number here.
    """
    high = number(ctx.bar("high"))
    low = number(ctx.bar("low"))
    highs = contributed(state, "high", high, 2)
    lows = contributed(state, "low", low, 2)
    before_high = highs[len(highs) - 2] if len(highs) > 1 else ABSENT
    before_low = lows[len(lows) - 2] if len(lows) > 1 else ABSENT
    up_move = ABSENT
    down_move = ABSENT
    if high is not None and low is not None:
        if isinstance(before_high, float) and isinstance(before_low, float):
            up = high - before_high
            down = before_low - low
            up_move = result(up) if up > down and up > 0 else 0.0
            down_move = result(down) if down > up and down > 0 else 0.0
    smoothed_up = averages.smoothed(region(state, "up"), up_move, di_length)
    smoothed_down = averages.smoothed(region(state, "down"), down_move, di_length)
    smoothed_range = averages.smoothed(region(state, "range"), gap_range(ctx), di_length)
    plus = _reading(smoothed_up, smoothed_range)
    minus = _reading(smoothed_down, smoothed_range)
    spread = ABSENT
    if isinstance(plus, float) and isinstance(minus, float):
        divisor = plus + minus
        spread = 0.0 if divisor == 0 else (abs(plus - minus) / divisor) * 100
    strength = averages.smoothed(region(state, "adx"), spread, adx_length)
    return [strength, plus, minus]


def _reading(side: Value, width: Value) -> Value:
    """One directional reading: the division, then the multiplication by 100."""
    if not isinstance(side, float) or not isinstance(width, float) or width == 0:
        return ABSENT
    return result((side / width) * 100)


def ages(state: Region, ctx, length: Optional[int]) -> list:
    """``aroon(len)``: how recently the window's high and low were set, as a percentage.

    The window is ``len + 1`` bars wide, so an extreme set ``len`` bars ago is
    still inside it and a reading of 0 is reachable. The two ages are counted
    under the tie rule of section 20.10: the most recent bar that set the extreme.
    """
    span = None if length is None else length + 1
    highs = window(contributed(state, "high", number(ctx.bar("high")), span), span)
    lows = window(contributed(state, "low", number(ctx.bar("low")), span), span)
    if length is None:
        return [ABSENT, ABSENT]
    up = ABSENT if highs is None else result((100 * (length - high_at(highs))) / length)
    down = ABSENT if lows is None else result((100 * (length - low_at(lows))) / length)
    return [up, down]


def cloud(
    state: Region, ctx, conversion_length: Optional[int], base_length: Optional[int],
    span_length: Optional[int],
) -> list:
    """``ichimoku(convLen, baseLen, spanLen)``: the five line frame, undisplaced.

    Each of the first four lines is the midpoint of a window's outright extremes.
    The third is the mean of the two midpoints already computed at the shorter two
    lengths, and not a midpoint recomputed over a window of its own. The fifth is
    this bar's close, reported at the bar it belongs to: a study draws the spans
    and the lagging line forward or back with the plot's own offset, because a
    shifted series cannot be compared with anything else in the script without
    shifting it back.
    """
    high, low = number(ctx.bar("high")), number(ctx.bar("low"))
    def pair(key, length):
        own = region(state, key)
        return contributed(own, "high", high, length), contributed(own, "low", low, length)
    conversion_highs, conversion_lows = pair("conversion", conversion_length)
    base_highs, base_lows = pair("base", base_length)
    span_highs, span_lows = pair("span", span_length)
    conversion = _midpoint(conversion_highs, conversion_lows, conversion_length)
    base = _midpoint(base_highs, base_lows, base_length)
    leading = ABSENT
    if isinstance(conversion, float) and isinstance(base, float):
        leading = result((conversion + base) / 2)
    second = _midpoint(span_highs, span_lows, span_length)
    lagging = ABSENT
    if raw_window(base_highs, base_length) is not None:
        lagging = number(ctx.bar("close"))
        lagging = ABSENT if lagging is None else result(lagging)
    return [conversion, base, leading, second, lagging]


def _midpoint(highs, lows, length: Optional[int]) -> Value:
    """The midpoint of a window's outright extremes, which four of the five lines are."""
    top = window(highs, length)
    bottom = window(lows, length)
    if top is None or bottom is None:
        return ABSENT
    return result((top[high_at(top)] + bottom[low_at(bottom)]) / 2)
