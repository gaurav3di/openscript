"""Rounding, and the one rule that decides every case.

**Halves go away from zero, never to even.** `stdlib.md` section 8.1 fixes it
and gives the reason: a price rounded for display should agree with what a
trader would write down, and round half to even surprises people at exactly the
values that matter. Fixing it also means two engines cannot differ by one tick.

**Adding a half and taking the floor is not this function.** It is the usual
shortcut and it is wrong for the value just below a half, where adding 0.5 rounds
up to the next representable number before the floor ever runs and the answer
comes out one too high. `stdlib.md` section 20.7 writes the comparison of the
fractional part out instead, which has no such case, and that is what is below.

**The scale of a fixed decimal rounding is not a floating point power.** 20.7
again: it is the binary64 nearest to ten to that count, the value the literal
``1e23`` reads as. On one host the two differ by an ulp at a count of 23 out of
the 309 a binary64 can hold, and over a price walk that one count moved 814
results. The table here is built once from exact whole number arithmetic, which
is the "exact integer power converted once" 20.7 names, and it is the one table:
the display conversion of ``text(x, decimals)`` scales by it as well.
"""

import math

from .values import ABSENT, Value, floor_of, number, result, whole


def round_half_away(x: float) -> float:
    """The nearest whole number, halves away from zero.

    A value with no whole number near it, an infinity produced by a scaling that
    overflowed, is returned unchanged for ``result`` to turn into absence.
    """
    if not math.isfinite(x):
        return x
    below = floor_of(x)
    fraction = x - below
    if fraction > 0.5:
        return below + 1.0
    if fraction < 0.5:
        return below
    # Exactly a half. Away from zero: upward above zero, and `below` already is
    # the downward answer for a negative, since the floor of -2.5 is -3.
    return below + 1.0 if x > 0 else below


# Ten to each whole power a binary64 can hold, as the binary64 nearest to it.
# Built from exact whole number arithmetic rather than from a floating point
# power, for the reason at the top of this file.
_POWERS_OF_TEN: tuple[float, ...] = tuple(float(10**count) for count in range(309))


def scale_of(decimals: int) -> float:
    """The scale for a digit count: the nearest binary64 to ten to that power.

    Past the last finite power it is the infinity the power would have been, so
    that a count a script computed scales to absence rather than to a wrong
    number.
    """
    if 0 <= decimals < len(_POWERS_OF_TEN):
        return _POWERS_OF_TEN[decimals]
    return math.inf


def floor(x: Value) -> Value:
    """``floor(x)``: toward negative infinity."""
    value = number(x)
    return ABSENT if value is None else result(floor_of(value))


def ceil(x: Value) -> Value:
    """``ceil(x)``: toward positive infinity."""
    value = number(x)
    if value is None:
        return ABSENT
    return result(value if not math.isfinite(value) else float(math.ceil(value)))


def trunc(x: Value) -> Value:
    """``trunc(x)``: toward zero."""
    value = number(x)
    if value is None:
        return ABSENT
    return result(value if not math.isfinite(value) else float(math.trunc(value)))


def round_to_whole(x: Value) -> Value:
    """``round(x)``: to the nearest whole number, halves away from zero."""
    value = number(x)
    return ABSENT if value is None else result(round_half_away(value))


def round_to(x: Value, decimals: Value) -> Value:
    """``round(x, decimals)``: scale, round once, scale back."""
    value = number(x)
    count = whole(decimals)
    if value is None or count is None:
        return ABSENT
    scale = scale_of(count)
    return result(round_half_away(value * scale) / scale)


def round_to_step(x: Value, step: Value) -> Value:
    """``roundToStep(x, step)``: to the nearest multiple of ``step``."""
    value = number(x)
    size = number(step)
    if value is None or size is None or size <= 0:
        return ABSENT
    return result(round_half_away(value / size) * size)


def round_to_tick(price: Value, tick_size: Value) -> Value:
    """``roundToTick(price)``: to the instrument's tick.

    Absent when the host has stated no tick size, rather than the price
    unrounded. Returning the input would produce an order price that looks
    rounded and is not, and a venue refuses an order off the tick, so a script
    that cannot round has to be able to see that it cannot.
    """
    tick = number(tick_size)
    if tick is None or tick <= 0:
        return ABSENT
    return round_to_step(price, tick)
