"""The volume readings of `stdlib.md` section 20.6.

**The running totals here are anchored accumulations rather than windows**, so
each carries its total forward and adds one term per bar. That is what the
quantity is, not a cheaper way to compute a window sum, and the refusal of a
carried total in section 20.2.1 does not reach them: there is no window to sum.

**Every total starts at zero** before any bar has contributed to it, and an
absent bar produces an absent bar out and leaves the total where it was. It is
neither reset nor fed a zero in place of the missing term, so a gap costs the
reading the bars it covers and nothing after them.

Every function here is absent on every bar when the host supplies no volume for
the instrument, which is one case of the same rule: an absent volume is not a
zero volume, and a study that wants to branch on it tests the chart fact rather
than inspecting the result.
"""

from typing import Optional

from . import averages, prices, strength
from .series import Region, back, contributed, region, running_total, total, window
from .values import ABSENT, Value, number, result


def session_average(state: Region, ctx, value: Value) -> Value:
    """``vwap(src)``: the volume weighted average since the session opened."""
    return _anchored(state, ctx, value, ctx.bar("isSessionFirst"))


def anchored_average(state: Region, ctx, value: Value, anchor: Value) -> Value:
    """``vwapAnchor(src, resetWhen)``: the same average, restarted on a condition.

    One calculation and two entries. The session reading resets where the host
    says a session began, this one where the script says so, and the reset
    happens **before** the bar's own term is added, so an anchor bar is the first
    bar of the new average rather than the last bar of the old one.
    """
    return _anchored(state, ctx, value, anchor)


def _anchored(state: Region, ctx, value: Value, anchor: Value) -> Value:
    """The two totals, the reset, and the one division both averages take."""
    held = region(state, "vwap")
    price = number(value)
    traded = number(ctx.bar("volume"))
    if anchor is True:
        held["flow"] = 0.0
        held["traded"] = 0.0
        held["anchored"] = True
    if held.get("anchored") is not True:
        return ABSENT
    if price is None or traded is None:
        return ABSENT
    # An overflowing product is an absent term under compiled-program.md 3.1:
    # the bar is absent and neither total moves.
    term = result(price * traded)
    if term is None:
        return ABSENT
    flow = held.get("flow", 0.0) + term
    volume = held.get("traded", 0.0) + traded
    held["flow"] = flow
    held["traded"] = volume
    # An overflowed total is kept and is absent, so the average divided by it is
    # too, rather than the exact zero a finite flow over an infinity would give.
    numerator = result(flow)
    divisor = result(volume)
    if numerator is None or divisor is None or divisor == 0:
        return ABSENT
    return result(numerator / divisor)


def balance(state: Region, ctx) -> Value:
    """``obv()``: the whole of the bar's volume, signed by the close's direction.

    The first bar has no close before it to compare against, so it contributes
    nothing and the reading there is the 0 the total started at. An unchanged
    close contributes nothing either.
    """
    close = number(ctx.bar("close"))
    traded = number(ctx.bar("volume"))
    before = back(contributed(state, "close", close, 2), 1)
    if close is None or traded is None:
        return ABSENT
    term = 0.0
    if isinstance(before, float):
        if close > before:
            term = traded
        elif close < before:
            term = -traded
    return running_total(state, "run", term)


def accumulation(state: Region, ctx) -> Value:
    """``ad()``: the running total of the term ``cmf`` sums over a window."""
    return running_total(state, "run", position_flow(ctx))


def position_flow(ctx) -> Value:
    """The per-bar term ``ad`` and ``cmf`` share, formed as section 20.6 writes it.

    The two bracketed differences are formed first and subtracted, then divided by
    the span, then multiplied by the volume. **A bar whose span is not above zero
    contributes an exact 0** rather than ending the total.
    """
    high = number(ctx.bar("high"))
    low = number(ctx.bar("low"))
    close = number(ctx.bar("close"))
    traded = number(ctx.bar("volume"))
    if high is None or low is None or close is None or traded is None:
        return ABSENT
    span = high - low
    if span <= 0:
        return 0.0
    return result((((close - low) - (high - close)) / span) * traded)


def flow_fraction(state: Region, ctx, length: Optional[int]) -> Value:
    """``cmf(len)``: the window sum of that term over the window sum of the volume."""
    terms = contributed(state, "term", position_flow(ctx), length)
    volumes = contributed(state, "size", number(ctx.bar("volume")), length)
    held = window(terms, length)
    traded = window(volumes, length)
    if held is None or traded is None:
        return ABSENT
    flow = result(total(held))
    divisor = result(total(traded))
    if flow is None or divisor is None or divisor == 0:
        return ABSENT
    return result(flow / divisor)


def accumulation_gap(
    state: Region, ctx, fast_length: Optional[int], slow_length: Optional[int]
) -> Value:
    """``adOsc(fast, slow)``: the fast exponential mean of the running total less the slow.

    The averages run over the running total, not over the per-bar term, which is
    what dates the turns of the total rather than the turns of one bar's flow.
    """
    running = accumulation(region(state, "total"), ctx)
    fast = averages.exponential(region(state, "fast"), running, fast_length)
    slow = averages.exponential(region(state, "slow"), running, slow_length)
    if not isinstance(fast, float) or not isinstance(slow, float):
        return ABSENT
    return result(fast - slow)


def price_trend(state: Region, ctx) -> Value:
    """``pvt()``: the running total of a proportion of the volume.

    The proportion is formed and rounded before it meets the volume. The first
    bar has no change behind it and is absent, and the second already carries its
    own term on top of the zero the total started at.
    """
    close = number(ctx.bar("close"))
    traded = number(ctx.bar("volume"))
    before = back(contributed(state, "close", close, 2), 1)
    if close is None or traded is None or not isinstance(before, float) or before == 0:
        return ABSENT
    return running_total(state, "run", _trend_term(close, before, traded))


def _trend_term(close: float, before: float, traded: float) -> Value:
    """The term ``pvt`` adds, checked after each operation as section 3.1 states.

    A change that overflows is absent although the true proportion may be
    finite, and an absent term leaves the running total where it was, so the
    bar costs its own reading and nothing after it. Adding the unchecked
    infinity instead would store it and end the reading for good.
    """
    change = result(close - before)
    if change is None:
        return ABSENT
    proportion = result(change / before)
    if proportion is None:
        return ABSENT
    return result(proportion * traded)


def money_flow(state: Region, ctx, length: Optional[int]) -> Value:
    """``mfi(len)``: the strength reading computed on money flow, with window sums.

    The arrangement of the last line is section 20.4's, and the result is 100
    where the falling side is zero, for the reason given there. A bar whose
    typical price is unchanged contributes an exact zero to both sides.
    """
    price = prices.typical(ctx)
    traded = number(ctx.bar("volume"))
    values = contributed(state, "typical", price, 2)
    before = back(values, 1)
    rise = ABSENT
    fall = ABSENT
    if isinstance(price, float) and traded is not None and isinstance(before, float):
        flow = result(price * traded)
        rise = flow if price > before else 0.0
        fall = flow if price < before else 0.0
    rises = window(contributed(state, "rise", rise, length), length)
    falls = window(contributed(state, "fall", fall, length), length)
    if rises is None or falls is None:
        return ABSENT
    return strength.line_of(result(total(rises)), result(total(falls)))


def movement(state: Region, ctx, length: Optional[int]) -> Value:
    """``eom(len)``: how far price moved per unit of volume, then a simple mean.

    The product is formed before the division. **There is no scaling constant**:
    implementations of this reading usually multiply by a large divisor whose only
    job is to bring the number into a readable range and they do not agree on it,
    section 7 declares no such argument, and this is gap 3 of section 20.11. That
    leaves the reading very small on a liquid instrument.
    """
    midpoint = prices.midpoint(ctx)
    values = contributed(state, "midpoint", midpoint, 2)
    before = back(values, 1)
    high = number(ctx.bar("high"))
    low = number(ctx.bar("low"))
    traded = number(ctx.bar("volume"))
    term = ABSENT
    if isinstance(midpoint, float) and isinstance(before, float):
        if high is not None and low is not None and traded is not None and traded != 0:
            term = result(((midpoint - before) * (high - low)) / traded)
    return averages.simple(region(state, "mean"), term, length)


def force(state: Region, ctx, length: Optional[int]) -> Value:
    """``forceIndex(len)``: the one bar close change times the volume, smoothed.

    The product is formed per bar and fed to the average, so a bar with no volume
    freezes the average rather than feeding it a change with nothing behind it.
    """
    close = number(ctx.bar("close"))
    traded = number(ctx.bar("volume"))
    before = back(contributed(state, "close", close, 2), 1)
    term = ABSENT
    if close is not None and traded is not None and isinstance(before, float):
        term = result((close - before) * traded)
    return averages.exponential(region(state, "mean"), term, length)


def relative_volume(state: Region, ctx, length: Optional[int]) -> Value:
    """``relativeVolume(len)``: the bar's volume over the simple mean of the volume."""
    traded = number(ctx.bar("volume"))
    average = averages.simple(region(state, "mean"), traded, length)
    if traded is None or not isinstance(average, float) or average == 0:
        return ABSENT
    return result(traded / average)
