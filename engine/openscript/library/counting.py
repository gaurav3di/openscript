"""The totals, the ranks and the two pair statistics of `stdlib.md` section 20.8.

Every window here is the fresh oldest first sum of section 20.2.1 or a scan over
the same window, and the three that pass over an absent bar say so in their
names, which is section 2.4's rule and the reason they are three functions rather
than a flag on the others.

**The two pair statistics are two passes and are population forms.** The means
are finished before any deviation is taken. The single pass arrangement, summing
squares and cross products and subtracting at the end, is mathematically equal,
loses most of its significant digits on a price series where the values are large
and their spread is small, and can return a negative variance that then has to be
floored at zero. An implementation that needs a floor to stay real is computing a
different quantity.
"""

from typing import Optional, Sequence

from . import elementary
from .series import Region, back, contributed, raw_window, running_total, total, window
from .values import ABSENT, Value, floor_of, number, result


def windowed_sum(state: Region, value: Value, length: Optional[int]) -> Value:
    """``sum(src, len)``: the window sum of 20.2.1."""
    held = window(contributed(state, "src", number(value), length), length)
    return ABSENT if held is None else result(total(held))


def counted(state: Region, condition: Value, length: Optional[int]) -> Value:
    """``count(cond, len)``: the same sum over a window of ones and zeros.

    A count is an addition of whole numbers and is therefore exact, which is why
    it can be the same sum rather than a scan of its own.

    **An absent condition is a bar the condition did not hold**, and not a hole
    that makes the count absent. The window still has to be full of bars, so the
    warmup is the window's, but a bar nobody could evaluate is counted as false:
    the reading is how many of the last ``len`` bars the condition held on, and
    an unknown bar is not one of them.
    """
    term = 1.0 if condition is True else 0.0
    held = window(contributed(state, "cond", term, length), length)
    return ABSENT if held is None else result(total(held))


def accumulated(state: Region, value: Value) -> Value:
    """``cum(src)``: the running total from the first bar, on section 20.6's terms."""
    return running_total(state, "run", number(value))


def skipping_sum(state: Region, value: Value, length: Optional[int]) -> Value:
    """``sumSkip(src, len)``: the same oldest first sum with the absent bars passed over.

    A window with nothing present in it is the empty accumulation: the sum is the
    0 it started at and is reported as 0. The window still has to be full of
    bars, which is why the warmup is the same as the window sum's.
    """
    held = raw_window(contributed(state, "src", number(value), length), length)
    if held is None:
        return ABSENT
    return result(total(_present(held)))


def skipping_mean(state: Region, value: Value, length: Optional[int]) -> Value:
    """``avgSkip(src, len)``: that sum over the number of bars that had a value.

    Dividing by ``len`` would be a different quantity. A window with nothing
    present in it has a divisor of zero and is absent, which is the one place
    this and ``sumSkip`` part company.
    """
    held = raw_window(contributed(state, "src", number(value), length), length)
    if held is None:
        return ABSENT
    present = _present(held)
    if not present:
        return ABSENT
    return result(total(present) / len(present))


def present_count(state: Region, value: Value, length: Optional[int]) -> Value:
    """``countPresent(src, len)``: how many bars of the window had a value."""
    held = raw_window(contributed(state, "src", number(value), length), length)
    return ABSENT if held is None else float(len(_present(held)))


def ranked(state: Region, value: Value, length: Optional[int], percent: Value) -> Value:
    """``percentile(src, len, p)``: linear interpolation between the two ranks either side.

    The nearest rank method, which returns an actual member of the window, is the
    other common choice and is not this one: an even length window is the mean of
    its two middles rather than one of them chosen by a rule nobody remembers.
    """
    held = window(contributed(state, "src", number(value), length), length)
    return _interpolated(held, length, number(percent))


def middle(state: Region, value: Value, length: Optional[int]) -> Value:
    """``median(src, len)``: the same at ``p`` of 50 and nothing else."""
    held = window(contributed(state, "src", number(value), length), length)
    return _interpolated(held, length, 50.0)


def rank_of(state: Region, value: Value, length: Optional[int]) -> Value:
    """``percentRank(src, len)``: this bar's value counted among the window.

    The bar counts itself, so the reading runs from ``100 / len`` to 100 rather
    than from 0.
    """
    held = window(contributed(state, "src", number(value), length), length)
    if held is None or length is None:
        return ABSENT
    counted_below = 0
    for other in held:
        if other <= held[0]:
            counted_below = counted_below + 1
    return result((float(counted_below) * 100) / length)


def covariance(
    state: Region, first: Value, second: Value, length: Optional[int]
) -> Value:
    """``covariance(a, b, len)``: the population form, two passes over both windows."""
    pair = _pair(state, first, second, length)
    if pair is None or length is None:
        return ABSENT
    left, right = pair
    cross, _squares_left, _squares_right = _deviations(left, right, length)
    return result(cross / length)


def correlation(
    state: Region, first: Value, second: Value, length: Optional[int]
) -> Value:
    """``correlation(a, b, len)``: that covariance over a product of two square roots.

    **It is not the square root of a product**: the two are mathematically equal,
    differ in the last bit, and this is the one the page states.
    """
    pair = _pair(state, first, second, length)
    if pair is None or length is None:
        return ABSENT
    left, right = pair
    cross, squares_left, squares_right = _deviations(left, right, length)
    spread_left = elementary.sqrt(squares_left / length)
    spread_right = elementary.sqrt(squares_right / length)
    if not isinstance(spread_left, float) or not isinstance(spread_right, float):
        return ABSENT
    divisor = spread_left * spread_right
    if divisor == 0:
        return ABSENT
    return result((cross / length) / divisor)


def _pair(state: Region, first: Value, second: Value, length: Optional[int]):
    """Both windows, or absence where either is short or holed.

    Both series are contributed on every bar whatever the other one did, because
    a bar one of them was absent on is still a bar the pair covered.
    """
    left = window(contributed(state, "a", number(first), length), length)
    right = window(contributed(state, "b", number(second), length), length)
    if left is None or right is None:
        return None
    return left, right


def _deviations(left: Sequence[float], right: Sequence[float], length: int):
    """The three second pass accumulations, each oldest first over its own terms.

    None of the three reads another, so neither the order they are written in nor
    whether an engine runs them in one pass or in three is fixed: section 20.1's
    fourth rule. What the two passes do fix is that both means are finished
    before any deviation is taken.
    """
    mean_left = total(left) / length
    mean_right = total(right) / length
    cross = 0.0
    squares_left = 0.0
    squares_right = 0.0
    for at in range(length - 1, -1, -1):
        cross = cross + (left[at] - mean_left) * (right[at] - mean_right)
        squares_left = squares_left + (left[at] - mean_left) * (left[at] - mean_left)
        squares_right = squares_right + (right[at] - mean_right) * (right[at] - mean_right)
    return cross, squares_left, squares_right


def _present(held: Sequence[Value]) -> list:
    """The values of a raw window that are there, newest first as they arrived."""
    return [value for value in held if isinstance(value, float)]


def _interpolated(
    held: Optional[Sequence[float]], length: Optional[int], percent: Optional[float]
) -> Value:
    """The rank read off the sorted window, interpolated between the two either side."""
    if held is None or length is None or percent is None:
        return ABSENT
    ascending = sorted(held)
    rank = (percent / 100) * (length - 1)
    below = floor_of(rank)
    if below < 0 or below >= length:
        return ABSENT
    at = int(below)
    if at >= length - 1:
        return result(ascending[at])
    return result(ascending[at] + (rank - below) * (ascending[at + 1] - ascending[at]))


def history_at(state: Region, value: Value, offset: Optional[int]) -> Value:
    """``history(src, n)``: ``src`` as it stood ``n`` bars ago, the explicit ``src[n]``.

    One operation and no accumulation, section 20.10. It is here rather than
    beside the bookkeeping because what it reads is the same buffer every window
    in this file is read from.
    """
    keep = None if offset is None else offset + 1
    return back(contributed(state, "src", value, keep), offset)
