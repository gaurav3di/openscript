"""The window scans of `stdlib.md` sections 9 and 20.10, and the pivots.

Section 20.10 names these as the functions with no accumulation order to fix:
they select a value and compute nothing, so an implementer can write the scan the
obvious way and be bit identical. **The one thing a scan can differ on is a
tie**, and the tie rules are section 9's, so they are what this file is careful
about.

- An extreme goes to **the most recent bar that set it**, so an equal value later
  in the window replaces the earlier one. That only shows in the two calls that
  report an age, and it shows there on every flat stretch of a series.
- A pivot is **strict on both sides**, so a run of equal values holds no pivot at
  all. A test written with "at or above" would report a pivot at each end of a
  flat top, which is two pivots where the chart shows none.

A window arrives newest first, so an index into it is an age in bars and
``held[0]`` is what this bar contributed.
"""

from typing import Optional, Sequence

from .series import Region, contributed, window
from .values import ABSENT, Value, number, result


def high_at(held: Sequence[float]) -> int:
    """The age in bars of the window's high, the most recent bar that set it.

    The scan runs oldest first and replaces on an equal value, which is how the
    tie reaches the newest of the bars that hold it rather than the oldest.
    """
    at = len(held) - 1
    for age in range(len(held) - 2, -1, -1):
        if held[age] >= held[at]:
            at = age
    return at


def low_at(held: Sequence[float]) -> int:
    """The age in bars of the window's low, on the same terms."""
    at = len(held) - 1
    for age in range(len(held) - 2, -1, -1):
        if held[age] <= held[at]:
            at = age
    return at


def window_high(values: Sequence[Value], length: Optional[int]) -> Value:
    """The outright high of the last ``length`` contributions, or absence."""
    held = window(values, length)
    return ABSENT if held is None else result(held[high_at(held)])


def window_low(values: Sequence[Value], length: Optional[int]) -> Value:
    """The outright low of the last ``length`` contributions, or absence."""
    held = window(values, length)
    return ABSENT if held is None else result(held[low_at(held)])


def highest(state: Region, value: Value, length: Optional[int]) -> Value:
    """``highest(src, len)``: the largest value in the last ``len`` bars."""
    return window_high(contributed(state, "src", number(value), length), length)


def lowest(state: Region, value: Value, length: Optional[int]) -> Value:
    """``lowest(src, len)``: the smallest."""
    return window_low(contributed(state, "src", number(value), length), length)


def highest_bars(state: Region, value: Value, length: Optional[int]) -> Value:
    """``highestBars(src, len)``: how many bars back the window's high was set."""
    held = window(contributed(state, "src", number(value), length), length)
    return ABSENT if held is None else float(high_at(held))


def lowest_bars(state: Region, value: Value, length: Optional[int]) -> Value:
    """``lowestBars(src, len)``: how many bars back the window's low was set."""
    held = window(contributed(state, "src", number(value), length), length)
    return ABSENT if held is None else float(low_at(held))


def pivot_high(state: Region, value: Value, left: Optional[int], right: Optional[int]) -> Value:
    """``pivotHigh(src, left, right)``: a local high, reported ``right`` bars after it.

    Reporting it at the pivot bar would be a lookahead: the value would appear on
    history at a bar where no script could have had it. So the window is
    ``left + right + 1`` wide, the candidate sits ``right`` bars back inside it,
    and the answer is absent on every bar that is not one.
    """
    values = contributed(state, "src", number(value), _span(left, right))
    return _pivot(values, left, right, True)


def pivot_low(state: Region, value: Value, left: Optional[int], right: Optional[int]) -> Value:
    """``pivotLow(src, left, right)``: a local low, on the same terms."""
    values = contributed(state, "src", number(value), _span(left, right))
    return _pivot(values, left, right, False)


def _span(left: Optional[int], right: Optional[int]) -> Optional[int]:
    """The window a pivot test needs: the bars either side and the candidate."""
    if left is None or right is None:
        return None
    return left + right + 1


def _pivot(
    values: Sequence[Value], left: Optional[int], right: Optional[int], above: bool
) -> Value:
    """The candidate's value where it beats both sides strictly, absence otherwise."""
    held = window(values, _span(left, right))
    if held is None or right is None:
        return ABSENT
    candidate = held[right]
    for age in range(len(held)):
        if age == right:
            continue
        if above and held[age] >= candidate:
            return ABSENT
        if not above and held[age] <= candidate:
            return ABSENT
    return result(candidate)
