"""The readings taken from one bar and nothing before it.

`stdlib.md` section 20.5 fixes the one that is not a single operation:

```text
result = max(high - low, abs(high - previousClose), abs(low - previousClose))
```

**The oldest bar of the dataset is the library's one deliberate exception to
absence propagation**, and `stdlib.md` section 6 puts it there rather than
leaving it to an engine: ``trueRange()`` is ``high - low`` on that bar. The other
two terms need a close that does not exist there, and propagating absence would
start every average of this reading one bar later than the declared warmup while
adding nothing, because the bar's own range is a true statement about that bar.

The exception is granted to ``trueRange`` and therefore to the averages of it. It
is not granted to every function that happens to use a range: where a function's
declared warmup shows it counts changes rather than levels, section 20.5's gap
aware form is what it takes, and that one is absent on the oldest bar like any
other change. Two functions use it and both declare a warmup one bar later than
the plain reading would give, which is how the page says which of the two they
take. That form is not a call a script can make, and an engine reaches it through
the stateful half of this library rather than through here.

**Where the previous close comes from is a host fact, not an arithmetic one.** An
engine is handed it with the bar and that is the one it must use, because a call
inside a branch does not see every bar and the close of the bar it last ran on is
a different number. So it is an argument here, and this function holds nothing
across bars.
"""

from .values import ABSENT, Value, number, result


def true_range(high: Value, low: Value, previous_close: Value, first_bar: bool) -> Value:
    """``trueRange()``: the bar's range, including any gap from the last close.

    ``first_bar`` is the caller's answer to "is this the oldest bar of the
    dataset", which is the question section 6's exception turns on and not one
    the three numbers can answer. An absent previous close in the middle of a run
    is a hole, and a hole propagates.
    """
    top = number(high)
    bottom = number(low)
    if first_bar:
        if top is None or bottom is None:
            return ABSENT
        return result(top - bottom)
    close_before = number(previous_close)
    if top is None or bottom is None or close_before is None:
        return ABSENT
    within = top - bottom
    up_gap = abs(top - close_before)
    down_gap = abs(bottom - close_before)
    widest = within
    if up_gap > widest:
        widest = up_gap
    if down_gap > widest:
        widest = down_gap
    return result(widest)
