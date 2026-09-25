"""The two shapes of `stdlib.md` section 20.2, and the region they are kept in.

Almost every length taking function of the stateful half is one of these two or
is built out of them, so they are written once here and read from everywhere
else. Getting them right is most of the work, and getting them wrong is a whole
library that is plausible and never bit identical.

**A region is plain data and nothing else.** `compiled-program.md` section 2.11
requires a state region to be snapshottable by a mechanical copy, by an engine
that does not know which function owns it, so what a function keeps here is
dictionaries, bounded mutable lists, numbers and immutable contribution history.
History versions share only frozen chunks, so a checkpoint retains the old
version and an append creates a new one without changing any checkpoint.

**A buffer holds what the bars contributed, not what the bars were.** A call
inside a branch does not run on every bar, and the window of section 20.1 is the
values this call site contributed, oldest still reachable at the end. The depth
requested is independent of the retained history: a later length can ask for
contributions older than any previous request. Section 2.5 measures readiness
against the largest requested length, while the read selects today's length.

**Absence is not arithmetic.** A window with a hole in it is absent, which is
section 2.4's rule for every windowed function, and the three that pass over a
hole say so in their names and ask for the raw window instead.
"""

from typing import Any, Callable, Dict, List, Optional, Sequence

from .history import ContributionHistory, ContributionView
from .values import ABSENT, Value, result

#: One call site's state region: what the engine created, copies and rolls back.
Region = Dict[str, Any]

#: The step of a seeded recurrence: what this bar's value does to the running one.
Step = Callable[[float, float], float]


def region(state: Region, key: str) -> Region:
    """A named region inside a region, for a function built out of others.

    ``dema`` is two exponential means and ``macd`` is three, and each of them
    has to keep its own running value. Nesting rather than prefixing every key
    means a function composes without its parts having to know they were
    composed.
    """
    held = state.get(key)
    if held is None:
        held = {}
        state[key] = held
    return held


def contributed(state: Region, key: str, value: Value, keep: Optional[int]) -> Sequence[Value]:
    """This bar's contribution pushed into a named buffer, and the buffer back.

    ``keep`` is how many of the most recent contributions this bar's call needs.
    Every contribution is retained in shared immutable chunks, including a call
    whose length is absent. The transient view indexes only today's requested
    depth, with one current value available even without a length.
    """
    held = state.get(key)
    if not isinstance(held, ContributionHistory):
        held = ContributionHistory()
    held = held.append(value, keep)
    state[key] = held
    return held.view(max(keep or 1, 1))


def raw_window(values: Sequence[Value], length: Optional[int]) -> Optional[List[Value]]:
    """The last ``length`` contributions, newest first, holes and all.

    Newest first is section 20.1's indexing: ``w[0]`` is what this bar
    contributed and ``w[len - 1]`` is the oldest value still in the window. The
    answer is absent only where the window is not full yet, which is the warmup
    every entry in sections 4 to 9 declares.
    """
    if length is None or length < 1 or len(values) < length:
        return None
    if isinstance(values, ContributionView) and values.history.count < values.history.maximum:
        return None
    held = list(values[len(values) - length :])
    held.reverse()
    return held


def window(values: Sequence[Value], length: Optional[int]) -> Optional[List[float]]:
    """The same window, absent where any bar in it is absent.

    Section 2.4: every windowed function propagates absence. A window that
    dropped its holes would be a mean of however many bars happened to have a
    value, which is a different quantity and one whose divisor nobody could
    state.
    """
    held = raw_window(values, length)
    if held is None:
        return None
    for value in held:
        if not isinstance(value, float):
            return None
    return held  # type: ignore[return-value]


def back(values: Sequence[Value], offset: Optional[int]) -> Value:
    """What the buffer held ``offset`` contributions ago, or absence.

    Offset 0 is this bar. Absence here is "the run is not that old yet", which
    is why it is the same answer as a hole: neither is a value the caller can
    compute with.
    """
    if offset is None or offset < 0 or len(values) <= offset:
        return ABSENT
    return values[len(values) - 1 - offset]


def total(held: Sequence[float]) -> float:
    """Section 20.2.1: the window sum, taken fresh, oldest first.

    The window arrives newest first, so the index runs from ``len - 1`` down to
    0 and the oldest value is added to zero first. Carrying a total forward and
    subtracting the value that leaves the window is the same quantity in exact
    arithmetic, a different number in binary64, and refused outright by
    `compiled-program.md` section 8.3.
    """
    running = 0.0
    for at in range(len(held) - 1, -1, -1):
        running = running + held[at]
    return running


def mean(held: Sequence[float], length: int) -> float:
    """The window mean: one division applied to the finished sum.

    Never a running mean, and never a sum divided term by term as it is built.
    Section 20.2.1 states it in one sentence and it is the sentence most easily
    lost, because a running mean is the cheaper thing to write.
    """
    return total(held) / length


def seeded(
    state: Region,
    key: str,
    value: Value,
    length: Optional[int],
    step: Step,
) -> Value:
    """Section 20.2.2: the seeded recurrence every seeded average in the library has.

    Absent before the seed bar, the window mean on it, and ``step`` after it. The
    seed bar is the first bar whose window holds ``length`` present values, which
    is what makes the warmups of `stdlib.md` compose rather than having to be
    asserted one call at a time.

    Every invocation counts, even with absent source or length. A seed also
    waits for the largest observed length's readiness. After seeding, readiness
    can hide a reading without skipping its valid step. Seed history is then
    released; only the count, maximum and running value remain.

    **A hole after the seed freezes the recurrence.** The bar is absent and the
    running value is left where it was, so the next present bar continues from
    the last present one. Consuming absence as zero drags the average toward
    nothing and re-seeding lets one missing bar restart a two hundred bar
    average. An absent length freezes the step in the same way.

    Seeding from bar 0 with the first value is the common and cheaper
    alternative. It is not this one: it draws a line where there should be a gap
    and stays materially wrong until the seed decays away.
    """
    held = region(state, key)
    count = held.get("count", 0) + 1
    maximum = max(held.get("maximum", 0), length or 0)
    held["count"] = count
    held["maximum"] = maximum
    running = held.get("running")
    if running is None:
        before = held.get("history", ContributionHistory())
        history = before.append(value, length)
        held["history"] = history
        if length is None or length < 1 or count < maximum:
            return ABSENT
        full = window(history.view(length), length)
        if full is None:
            return ABSENT
        running = mean(full, length)
        held["running"] = running
        # Old checkpoints keep their version; the live recurrence needs no seed history.
        del held["history"]
        return _reported(running)
    if length is None or length < 1 or not isinstance(value, float):
        return ABSENT
    running = step(running, value)
    held["running"] = running
    return _reported(running) if count >= maximum else ABSENT


def running_total(state: Region, key: str, term: Value) -> Value:
    """Section 20.6's anchored accumulation: one term per bar, from zero.

    Every total here starts at zero before any bar has contributed to it, and an
    absent bar produces an absent bar out and leaves the total where it was. It
    is neither reset nor fed a zero in place of the missing term, so a gap costs
    the reading the bars it covers and nothing after them.

    This is not the carried total section 20.2.1 refuses. There is no window to
    sum here, so it is a different quantity rather than a cheaper way to compute
    the same one.
    """
    held = region(state, key)
    if not isinstance(term, float):
        return ABSENT
    running = held.get("running", 0.0) + term
    held["running"] = running
    return _reported(running)


def _reported(running: float) -> Value:
    """A running value as it is reported, under `compiled-program.md` 3.1.

    The state keeps what the arithmetic produced and the caller is handed what
    the language can hold, so an overflow is absent on the chart without the
    recurrence quietly re-seeding itself on the bar after it.
    """
    return result(running)
