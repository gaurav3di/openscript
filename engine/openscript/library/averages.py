"""The six means of `stdlib.md` section 20.3 that are not built from another mean.

Each is one of the two shapes of section 20.2 and nothing more: a fresh window
sum, or a window mean that seeds a recurrence. What makes them six functions
rather than one is the step and the weighting, and what makes each of them one
function rather than a family is the arrangement, which is why every entry here
names the arrangement it is not.

A value arrives already read off this bar's arguments, and every one of these
pushes it into a buffer of its own before it looks at the window, because a call
that skipped a bar's contribution would have a window a bar out of step with the
bars it is supposed to cover.
"""

from .series import Region, contributed, mean, seeded, total, window
from .values import ABSENT, Value, number, result


def simple(state: Region, value: Value, length: int | None) -> Value:
    """``sma(src, len)``: the window sum of 20.2.1 divided by ``len``."""
    values = contributed(state, "src", number(value), length)
    held = window(values, length)
    if held is None or length is None:
        return ABSENT
    return result(mean(held, length))


def exponential(state: Region, value: Value, length: int | None) -> Value:
    """``ema(src, len)``: the seeded recurrence with the weight of section 4.

    **The step is the two products added**, and it is not
    ``running + (value - running) * weight``. That third arrangement of the same
    algebra is the one an engine reaches for, because it is one multiplication
    rather than two, and over the fixture the release gate compares bit for bit
    it differs on most of the values at every length.
    """
    values = contributed(state, "src", number(value), length)
    if length is None:
        return ABSENT
    weight = 2 / (length + 1)
    rest = 1 - weight

    def step(running: float, value: float) -> float:
        return value * weight + running * rest

    return seeded(state, "run", values, length, step)


def smoothed(state: Region, value: Value, length: int | None) -> Value:
    """``rma(src, len)``: the recurrence the classic oscillators are built on.

    **This is not the shape of ``ema`` with a weight of ``1 / len``.** The two
    are one function in exact arithmetic and two numbers in binary64, and the
    difference propagates into the strength reading, the average true range, the
    trailing band and the directional index, which are the readings a chart is
    most often asked to reproduce. Neither is
    ``running + (value - running) / len``, which is a third arrangement again.
    """
    values = contributed(state, "src", number(value), length)
    if length is None:
        return ABSENT
    span = float(length)

    def step(running: float, value: float) -> float:
        return (running * (span - 1) + value) / span

    return seeded(state, "run", values, length, step)


def linear(state: Region, value: Value, length: int | None) -> Value:
    """``wma(src, len)``: weight 1 added first, weight ``len`` last, one division.

    The weight on ``w[k]`` is ``len - k``, formed as a multiplication of the
    value by the whole number weight and not by a precomputed fraction. Dividing
    each term by the divisor as it is added is a different number.

    Nothing is fixed about how the divisor itself is formed: its factors are a
    whole number product scaled by a power of two, which is exact however it is
    grouped.
    """
    values = contributed(state, "src", number(value), length)
    held = window(values, length)
    if held is None or length is None:
        return ABSENT
    span = float(length)
    divisor = (span * (span + 1)) / 2
    running = 0.0
    for position in range(length):
        running = running + held[length - 1 - position] * float(position + 1)
    return result(running / divisor)


def symmetric(state: Region, value: Value) -> Value:
    """``swma(src)``: the fixed four bar mean, added left to right, divided once.

    Over twenty thousand four bar windows of ordinary prices, regrouping the four
    terms in the middle differs on 5281 of them, adding them right to left on
    7230, and dividing each term by 6 as it is added on 9564. How the two middle
    terms are doubled is not fixed, because an exact scaling by two is one value
    however it is written.
    """
    values = contributed(state, "src", number(value), 4)
    held = window(values, 4)
    if held is None:
        return ABSENT
    running = held[3]
    running = running + 2 * held[2]
    running = running + 2 * held[1]
    running = running + held[0]
    return result(running / 6)


def volume_weighted(state: Region, value: Value, size: Value, length: int | None) -> Value:
    """``vwma(src, len)``: this bar's product formed first, then two window sums.

    Dividing each sum by ``len`` first and then dividing one by the other is the
    same quantity with two extra roundings in it, and it is not this
    arrangement. The result is absent where the denominator is zero, which is a
    window nothing traded in rather than an error.
    """
    price = number(value)
    traded = number(size)
    product = ABSENT if price is None or traded is None else price * traded
    products = contributed(state, "flow", product, length)
    volumes = contributed(state, "size", traded, length)
    top = window(products, length)
    bottom = window(volumes, length)
    if top is None or bottom is None:
        return ABSENT
    divisor = total(bottom)
    if divisor == 0:
        return ABSENT
    return result(total(top) / divisor)
