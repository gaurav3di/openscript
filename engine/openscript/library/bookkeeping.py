"""The comparisons and counters of `stdlib.md` section 9, named in 20.10.

None of these accumulates. They compare this bar's value with an older one, or
count bars, so there is one arrangement and no choice to record. What there is
instead is a set of edge rules, and each of them is a decision somebody has to
make the same way twice for two engines to agree:

- **A crossing keeps the two series apart rather than subtracting them.** The
  test turns on whether one was at or below the other, and a rounded zero would
  change the answer on exactly the bars a crossing matters.
- **A crossing is "at or below, then above"**, not "strictly below, then above",
  so two series that touch and separate report one cross rather than none. The
  alternative loses the case where the values are briefly equal, which is common
  on instruments with a coarse tick.
- **A run test needs its own changes to be present.** ``rising(src, len)`` reads
  ``len`` changes and therefore ``len + 1`` values, which is where its warmup of
  bar ``len`` comes from and why it is a bar later than a window of ``len``.
- **The two that wait for a condition are absent, not zero, before it has ever
  been true.** Zero would read as "it happened on this bar".
"""

from typing import Optional

from .history import ContributionHistory
from .series import Region, back, contributed, raw_window, region
from .values import ABSENT, Value, number, result


def change(state: Region, value: Value, length: Optional[int]) -> Value:
    """``change(src)`` and ``change(src, len)``: ``src - src[len]``, one subtraction."""
    keep = None if length is None else length + 1
    values = contributed(state, "src", number(value), keep)
    older = back(values, length)
    newer = values[len(values) - 1]
    if not isinstance(newer, float) or not isinstance(older, float):
        return ABSENT
    return result(newer - older)


def rising(state: Region, value: Value, length: Optional[int]) -> Value:
    """``rising(src, len)``: true when each of the last ``len`` changes was positive."""
    return _run(state, value, length, True)


def falling(state: Region, value: Value, length: Optional[int]) -> Value:
    """``falling(src, len)``: true when each of the last ``len`` changes was negative."""
    return _run(state, value, length, False)


def _run(state: Region, value: Value, length: Optional[int], up: bool) -> Value:
    """The run test over the ``len + 1`` values the ``len`` changes are taken from.

    **The changes are read oldest first and the answer is the first one that
    settles it.** A change that is not in the direction asked for makes the run
    false there and then, and a change that cannot be taken because one of its
    two bars is absent makes the answer absent there and then. So a window with a
    hole in it is false rather than absent whenever an older change had already
    failed, which is not the blanket propagation of section 2.4 and is the order
    this reading is taken in.
    """
    keep = None if length is None else length + 1
    held = raw_window(contributed(state, "src", number(value), keep), keep)
    if held is None or length is None:
        return ABSENT
    for age in range(length - 1, -1, -1):
        newer = held[age]
        older = held[age + 1]
        if not isinstance(newer, float) or not isinstance(older, float):
            return ABSENT
        if up and not newer > older:
            return False
        if not up and not newer < older:
            return False
    return True


def crossed_up(state: Region, first: Value, second: Value) -> Value:
    """``crossUp(a, b)``: ``a`` was at or below ``b`` and is now above."""
    pair = _pair(state, first, second)
    if pair is None:
        return ABSENT
    (now_first, before_first), (now_second, before_second) = pair
    return before_first <= before_second and now_first > now_second


def crossed_down(state: Region, first: Value, second: Value) -> Value:
    """``crossDown(a, b)``: ``a`` was at or above ``b`` and is now below."""
    pair = _pair(state, first, second)
    if pair is None:
        return ABSENT
    (now_first, before_first), (now_second, before_second) = pair
    return before_first >= before_second and now_first < now_second


def crossed(state: Region, first: Value, second: Value) -> Value:
    """``cross(a, b)``: either direction, read from the one pair of readings."""
    pair = _pair(state, first, second)
    if pair is None:
        return ABSENT
    (now_first, before_first), (now_second, before_second) = pair
    if before_first <= before_second and now_first > now_second:
        return True
    return before_first >= before_second and now_first < now_second


def _pair(state: Region, first: Value, second: Value):
    """This bar's and the previous bar's readings of both series, or absence.

    Both are contributed on every bar whatever the other one did, so a hole in
    one does not shift the other's idea of which bar was previous.
    """
    left = contributed(state, "a", number(first), 2)
    right = contributed(state, "b", number(second), 2)
    now_left, before_left = left[len(left) - 1], back(left, 1)
    now_right, before_right = right[len(right) - 1], back(right, 1)
    for reading in (now_left, before_left, now_right, before_right):
        if not isinstance(reading, float):
            return None
    return (now_left, before_left), (now_right, before_right)


def bars_since(state: Region, condition: Value) -> Value:
    """``barsSince(cond)``: bars since the condition last held, 0 on the bar itself.

    Absent until the condition has been true once. A bar the condition is absent
    on is a bar it did not hold: the count goes on rather than stopping, because
    the question is how long ago the last true bar was and an unknown bar in
    between does not change the answer.
    """
    held = region(state, "since")
    if condition is True:
        held["bars"] = 0.0
        return 0.0
    since = held.get("bars")
    if since is None:
        return ABSENT
    since = since + 1
    held["bars"] = since
    return since


def value_when(
    state: Region, condition: Value, value: Value, occurrence: Optional[int]
) -> Value:
    """``valueWhen(cond, src, occurrence)``: ``src`` as it stood on a true bar.

    Occurrence 0 is the most recent true bar, 1 the one before it, and the answer
    is absent until that many true bars have happened. The value recorded is
    whatever ``src`` was on that bar, absence included: the condition decides
    which bar is read and the source decides what was there.
    """
    wanted = 0 if occurrence is None else occurrence
    held = region(state, "seen")
    history = held.get("history")
    if not isinstance(history, ContributionHistory):
        history = ContributionHistory()
    if condition is True:
        history = history.append(value, None)
        held["history"] = history
    if wanted < 0 or history.count <= wanted:
        return ABSENT
    return history.view(wanted + 1)[0]
