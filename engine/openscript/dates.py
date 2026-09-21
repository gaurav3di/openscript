"""The calendar of `stdlib.md` section 12.2, the pattern of 12.3, and the window of 12.5.

The arithmetic is next door and raises nothing: ``civil.py`` counts days,
``zones.py`` says which calendar this engine can read, and ``hours.py`` is the
one wall clock range shared by a script's window and the instrument's own
session. What is here is the call sites, which is where the library's rules about
absence are applied, and the manifest rows a program's own library table is
checked against at load.

**Every call reads a timestamp in the chart's timezone unless a ``zone``
argument names another**, which is 12.1, and the reason it gives is worth
keeping in front of whoever changes this: a session study that disagreed with the
labels on the chart's own axis would be wrong in the way that is hardest to see.
The compiled program fills the default before the call arrives
(`compiled-program.md` section 4.10), so the zone is an argument here; a script
that passes ``none`` or a value that is absent on this bar falls back to the
chart's zone, because the alternative reads the default two ways depending on
whether the script wrote it out.

**A zone this engine cannot read leaves the call absent, and that is not the
whole of the rule.** The first engine stops the bar with OS6005 on a name its
database does not hold, which is what 12.1 requires. This engine holds one zone
(``zones.py`` says which and why), it raises nothing from a library call because
no call site here carries a span to point at, and the two engines therefore part
company on a script that names a zone: one answers a diagnostic and the other
answers absence. That is not papered over with a guessed offset. The caller
reports such a case ``unsupported`` naming the feature, which `conformance.md`
section 8 counts separately from a pass, and the adapter is where a case meets
that rule.

**Two of these are not in the table above.** ``date.add`` is planned in 12.2 and
``session.isHoliday`` in 12.4, so neither is in the manifest and a program
calling one is refused at load naming it (OS6004) rather than answered from an
arithmetic nobody has written down.
"""

import math
from typing import Optional, Sequence

from .civil import (
    Civil,
    date_of_day,
    day_number,
    day_of_year_of,
    week_of_year_of,
    weekday_of_day,
)
from .hours import standing_in, window_of
from .library.stateless import Context, Entry
from .library.values import ABSENT, Value, number, result
from .zones import fields_in, instant_of

#: The bar fact ``session.isIn`` reads, which is the bar's own open time. It is
#: asked for by name like every other bar fact a stateless call reads, because
#: the context a call is given carries where in the run the bar is and what the
#: host said about the instrument, and the time of the bar being executed is
#: neither of those.
BAR_TIME = "time"

#: 12.3: the month and weekday abbreviations, English and invariant, for the same
#: determinism reason ``str.upper`` is: a name that followed the reader's locale
#: would make one chart's label depend on who opened it.
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
_WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")

#: 12.3's closed set, longest first, which is the order the scan tries them in:
#: ``MMM`` is the month name and the ``MM`` inside it is never read a second time.
_PLACEHOLDERS = ("yyyy", "MMM", "EEE", "MM", "dd", "HH", "mm", "ss")


def _at(arguments: Sequence[Value], index: int) -> Value:
    """An argument, or absence where the caller passed fewer than the arity.

    A call arrives with its defaults already filled (`compiled-program.md`
    section 4.10), so a short argument list is a program the load-time check
    should have refused. Absence rather than a raise, for the reason the
    library's own values module gives: nothing on this path stops a bar.
    """
    return arguments[index] if index < len(arguments) else ABSENT


def _civil_at(instant: Value, zone: Value) -> Optional[Civil]:
    """The civil reading of a timestamp in a zone, or nothing where there is none."""
    return None if instant is ABSENT else fields_in(instant, zone)


def field_of(instant: Value, zone: Value, which: str) -> Value:
    """One calendar field of an instant, read in a zone. The nine reads of 12.2."""
    at = _civil_at(instant, zone)
    if at is None:
        return ABSENT
    if which == "dayOfWeek":
        return result(weekday_of_day(day_number(at.year, at.month, at.day)))
    if which == "dayOfYear":
        return result(day_of_year_of(at.year, at.month, at.day))
    if which == "weekOfYear":
        return result(week_of_year_of(at.year, at.month, at.day))
    return result(getattr(at, which))


def start_of(instant: Value, zone: Value, boundary: str) -> Value:
    """Midnight at the start of the day, the Monday or the month that holds an instant.

    The answer is built as a wall clock reading and then turned back into an
    instant, rather than by subtracting a count of milliseconds. Subtracting is
    wrong across a clock change, where a local day is twenty three or twenty five
    hours long, and it is wrong in a way that shows up twice a year on one chart
    and never on another. In the one zone this engine reads the two agree, and
    the form that stays right is the one written, because the zone it would be
    wrong in is the zone a host supplies a reader for.
    """
    at = _civil_at(instant, zone)
    if at is None:
        return ABSENT
    if boundary == "month":
        midnight = Civil(at.year, at.month, 1, 0, 0, 0)
    elif boundary == "day":
        midnight = Civil(at.year, at.month, at.day, 0, 0, 0)
    else:
        days = day_number(at.year, at.month, at.day)
        year, month, day = date_of_day(days - (weekday_of_day(days) - 1))
        midnight = Civil(year, month, day, 0, 0, 0)
    found = instant_of(midnight, zone)
    return ABSENT if found is None else result(found)


def instant_from(arguments: Sequence[Value], zone: Value) -> Value:
    """``date.from``: an instant built from calendar fields in a zone.

    A date is three fields and a time of day is three more, so an absent hour,
    minute or second is midnight and an absent year, month or day is no date at
    all. A field that is not a whole number is absent rather than rounded, for
    the reason `stdlib.md` section 2.5 gives about a count: a day of 14.5 is a
    bug in the script, and rounding it on the script's behalf hides the bug.
    """
    if zone is ABSENT:
        return ABSENT
    held = []
    for at in range(6):
        given = number(arguments[at]) if at < len(arguments) else None
        if given is None:
            if at < 3:
                return ABSENT
            given = 0.0
        if not math.isfinite(given) or given != int(given):
            return ABSENT
        held.append(int(given))
    found = instant_of(Civil(*held), zone)
    return ABSENT if found is None else result(found)


def same_day(first: Value, second: Value, zone: Value) -> Value:
    """``date.isSameDay``: whether two timestamps fall on one calendar day."""
    left = _civil_at(first, zone)
    right = _civil_at(second, zone)
    if left is None or right is None:
        return ABSENT
    return (left.year, left.month, left.day) == (right.year, right.month, right.day)


def _padded(value: int, width: int) -> str:
    """A field as its digits, zero filled, with the sign in front of the filling."""
    digits = str(abs(int(value)))
    filled = digits if len(digits) >= width else "0" * (width - len(digits)) + digits
    return f"-{filled}" if value < 0 else filled


def _substitution(token: str, at: Civil) -> str:
    if token == "yyyy":
        return _padded(at.year, 4)
    if token == "MMM":
        return _MONTHS[at.month - 1] if 1 <= at.month <= 12 else ""
    if token == "EEE":
        return _WEEKDAYS[weekday_of_day(day_number(at.year, at.month, at.day)) - 1]
    if token == "MM":
        return _padded(at.month, 2)
    if token == "dd":
        return _padded(at.day, 2)
    if token == "HH":
        return _padded(at.hour, 2)
    if token == "mm":
        return _padded(at.minute, 2)
    return _padded(at.second, 2)


def rendered(instant: Value, pattern: Value, zone: Value) -> Value:
    """``date.format``: 12.3's closed placeholder set, and every other character copied.

    The set is small and closed so that two engines cannot differ about what a
    pattern means, and a character that looks like part of a placeholder is
    copied through as itself: the scan takes the longest placeholder starting at
    each position and moves past it.
    """
    at = _civil_at(instant, zone)
    if at is None or not isinstance(pattern, str):
        return ABSENT
    out = []
    position = 0
    while position < len(pattern):
        token = next(
            (one for one in _PLACEHOLDERS if pattern.startswith(one, position)), None
        )
        if token is None:
            out.append(pattern[position])
            position += 1
            continue
        out.append(_substitution(token, at))
        position += len(token)
    return "".join(out)


def holds(spec: Value, instant: Value, zone: Value) -> Value:
    """``session.isIn``: whether this bar's reading falls in the window a script wrote.

    The window is the script's own and the instrument's session is the host's, so
    this reads 12.5's spelling and the record reads 4.3's, and both reach the one
    range arithmetic in ``hours.py``.
    """
    hours = window_of(spec)
    at = _civil_at(instant, zone)
    if hours is None or at is None:
        return ABSENT
    return standing_in(hours, at).inside


def _zone_at(ctx: Context, arguments: Sequence[Value], index: int) -> Value:
    """The zone a call reads in: the one it was given, or the chart's.

    A host that states no timezone leaves every call here absent rather than
    answered in a zone nobody chose, which is 12.1 read the only way it can be:
    the default is the chart's axis, and a chart with no axis to read has none.
    """
    given = _at(arguments, index)
    if isinstance(given, str):
        return given
    return ctx.host("timezone")


def _read(name: str, which: str) -> Entry:
    """One of the nine field reads, which take a timestamp and a zone."""
    return Entry(
        f"date.{name}",
        2,
        lambda ctx, args: field_of(_at(args, 0), _zone_at(ctx, args, 1), which),
    )


def _boundary(name: str, which: str) -> Entry:
    """One of the three boundaries a timestamp rounds back to."""
    return Entry(
        f"date.{name}",
        2,
        lambda ctx, args: start_of(_at(args, 0), _zone_at(ctx, args, 1), which),
    )


#: Section 12.2's table and 12.5's one call, as the manifest rows section 2.5 of
#: `compiled-program.md` holds a program's own library table to. Every one of
#: them holds no state and has no effect: the answer is the arguments, the
#: chart's zone and, for the window, the bar the engine is executing.
ENTRIES: tuple[Entry, ...] = (
    _read("year", "year"),
    _read("month", "month"),
    _read("day", "day"),
    _read("dayOfWeek", "dayOfWeek"),
    _read("dayOfYear", "dayOfYear"),
    _read("hour", "hour"),
    _read("minute", "minute"),
    _read("second", "second"),
    _read("weekOfYear", "weekOfYear"),
    _boundary("startOfDay", "day"),
    _boundary("startOfWeek", "week"),
    _boundary("startOfMonth", "month"),
    Entry("date.from", 7, lambda ctx, args: instant_from(args, _zone_at(ctx, args, 6))),
    Entry(
        "date.isSameDay",
        3,
        lambda ctx, args: same_day(_at(args, 0), _at(args, 1), _zone_at(ctx, args, 2)),
    ),
    Entry(
        "date.format",
        3,
        lambda ctx, args: rendered(_at(args, 0), _at(args, 1), _zone_at(ctx, args, 2)),
    ),
    Entry(
        "session.isIn",
        2,
        lambda ctx, args: holds(_at(args, 0), ctx.bar(BAR_TIME), _zone_at(ctx, args, 1)),
    ),
)


#: Every name this module answers, which is what a caller asks when the question
#: is about the calendar rather than about one call: a case whose record names a
#: zone this engine cannot read, and whose program reaches any of these, is a
#: case answered under the wrong calendar unless the caller declines it.
NAMES: frozenset = frozenset(entry.name for entry in ENTRIES)


def table() -> dict[tuple[str, int], Entry]:
    """The entries by name and arity, which is how a manifest is looked up."""
    return {(entry.name, entry.arity): entry for entry in ENTRIES}
