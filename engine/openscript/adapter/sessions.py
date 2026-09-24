"""The session facts an engine derives, ``host-interface.md`` 4.3 and ``stdlib.md`` 12.4.

**A session is the instrument's, never a window a script invents.** The record
states a wall clock range, the days it runs on and the zone it is read in, and
the engine derives the per-bar facts from those and the bar's own time: "an
engine derives them and never asks a host for them: the facts a host states about
an execution are the four of ``language.md`` section 7.2 and no others".

**A record that states no session leaves every fact absent**, which is 4.1's own
rule and is exactly what an instrument with no schedule looks like. A record that
states one badly is refused instead (OS6012), because the difference between a
fact nobody stated and a fact stated wrongly is the one thing reading the record
can tell you.

**The window arithmetic is not here.** A range of wall clock hours is two things
in this engine, the record's session and the window a script writes for
``session.isIn``, and ``hours.py`` is the one arithmetic both of them reach: a
second copy would drift over midnight, or over which day a list of days is read
against, on the dataset nobody tests. What is here is the record: its three
refusals, and the two facts derived per bar.

**Both derived facts are computed here and both are in the manifest.**
``session.isFirstBar`` looks backwards, which an engine can answer on the bar it
is executing. ``session.isLastBar`` is "true on the last bar of the schedule even
if trading stopped early", so it is a bar slot measured against the scheduled
close and it needs the interval, which ``intervals.py`` reads; ``last_bars``
below is that reading. Each reaches the seam as a bar fact of its own name,
``SESSION_FIRST`` and ``SESSION_LAST``, so neither can be answered with the
other's value.

**The zone is read as the one this engine can read.** A calendar in any other
zone is a reader the host supplies, so a case whose record names another zone is
named ``unsupported`` by the caller rather than answered under the wrong
calendar. ``zones.py`` states which zone that is and why it is one.
"""

from typing import Any, Mapping, Optional, Sequence, Tuple

from ..hours import Hours, clock_minutes, days_numbered, standing_in
from ..intervals import bar_minutes_of
from ..values import ABSENT
from ..zones import READABLE as READABLE_ZONE, fields_in
from .spellings import Malformed

#: ``stdlib.md`` 12.4: the entries of the namespace this engine serves.
SESSION_FACTS: Tuple[str, ...] = ("session.isFirstBar", "session.isLastBar")

#: The bar fact both readers of a session boundary take it from: the namespace
#: entry above, and ``vwap``, which restarts where the session opened.
SESSION_FIRST = "isSessionFirst"

#: The bar fact ``session.isLastBar`` is answered from, beside the first.
SESSION_LAST = "isSessionLast"

#: Each session entry against the bar fact that answers it.
SESSION_FACT_OF = {"session.isFirstBar": SESSION_FIRST, "session.isLastBar": SESSION_LAST}

#: The record's session is a range of wall clock hours and nothing else, which is
#: what lets it and a script's own window be one arithmetic.
Session = Hours


def _minutes(text: Any, field: str) -> int:
    """``"HH:MM"``, in the one spelling 4.3 fixes, or the refusal it names.

    ``"9:00"`` is the spelling a host writes first and it is not a time here, so
    it is refused rather than read: a record stating a window in a spelling the
    page does not have is a record whose author believes they stated a session.
    """
    held = clock_minutes(text)
    if held is None:
        raise Malformed(
            f"instrument.json: the session's {field} is {text!r}, and host-interface.md 4.3 "
            'spells a wall clock time "HH:MM", where the latest time it has is "24:00", '
            "midnight at the end of the day"
        )
    return held


def session_from(instrument: Mapping[str, Any]) -> Optional[Session]:
    """The record's session, or nothing where it states none.

    The three refusals are 4.3's own table, in its order: a window with no zone
    to read it in, a bound that is not a wall clock time, and a day outside the
    numbering ``date.dayOfWeek`` uses.
    """
    held = instrument.get("session")
    if held is None:
        return None
    if not isinstance(held, dict):
        raise Malformed("instrument.json: the session is not a window of a start, an end and days")
    if not isinstance(instrument.get("timezone"), str):
        raise Malformed(
            "instrument.json states a session and no timezone, and host-interface.md 4.3 refuses "
            "that record at load: a window is wall clock and a wall clock is read in a zone"
        )
    days = held.get("days")
    if not isinstance(days, list) or not days_numbered(days):
        raise Malformed(
            f"instrument.json: the session states the days {days!r}, and 4.3 numbers Monday as 1 "
            "through Sunday as 7, with an empty list not one of them"
        )
    return Session(_minutes(held.get("start"), "start"), _minutes(held.get("end"), "end"), tuple(days))


def opening_day(time: int, session: Session) -> Optional[int]:
    """Which session a bar belongs to, as the day it opened on, or nothing.

    The day is an identity and not a date: two bars of one session share it, and
    the bar that does not share it with the bar before it is the bar that opened
    a session. A bar outside the window belongs to no session, which is a false
    reading of every fact here rather than an absent one.
    """
    standing = _standing(time, session)
    return None if standing is None or not standing.inside else standing.opening_day


def first_bars(times: Sequence[int], session: Optional[Session]) -> Tuple[Any, ...]:
    """Whether each bar opens its session, absent throughout where there is none.

    Read forwards and never backwards: a bar opens a session when it is in one
    and the last bar that was in one was in a different one. A bar outside the
    window opens nothing and leaves the answer for the next bar alone, so a
    session with a gap in the middle of it is one session and not two.
    """
    if session is None:
        return tuple(ABSENT for _ in times)
    found = []
    previous: Optional[int] = None
    for time in times:
        opened = opening_day(time, session)
        found.append(opened is not None and opened != previous)
        if opened is not None:
            previous = opened
    return tuple(found)


def last_bars(
    times: Sequence[int], session: Optional[Session], interval: Any
) -> Tuple[Any, ...]:
    """Whether each bar is the last of its session's schedule, or absent.

    The schedule and not the trading: a bar is the last one when the time left
    until the scheduled close is no more than one bar, so it is true on the bar
    that covers the close even if nothing traded in it and even if the feed
    stopped an hour earlier. That is the whole reason 4.3 says a strategy which
    must be flat by the close acts on this rather than on the appearance of a new
    bar, which arrives too late.

    Absent where there is no session, and absent where the host stated no
    interval this engine can read: without a bar's length there is no slot to
    measure against the close, and answering from the spacing of the bars would
    be an engine promising something the specification does not, which is that
    the bars are evenly spaced.
    """
    minutes = bar_minutes_of(interval)
    if session is None or minutes is None:
        return tuple(ABSENT for _ in times)
    found = []
    for time in times:
        standing = _standing(time, session)
        if standing is None:
            found.append(ABSENT)
        else:
            found.append(standing.inside and standing.remaining <= minutes)
    return tuple(found)


def _standing(time: Any, session: Session) -> Optional[Any]:
    """Where one bar's reading sits in the window, in the zone this engine reads."""
    at = fields_in(time, READABLE_ZONE)
    return None if at is None else standing_in(session, at)
