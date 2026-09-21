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

**One of the two derived facts is here and the other is not.**
``session.isFirstBar`` looks backwards: a bar opens its session when the bar
before it was in another one, which an engine can answer on the bar it is
executing. ``session.isLastBar`` is "true on the last bar of the schedule even if
trading stopped early", which needs the bar's own length to know which bar
reaches the scheduled close, and this engine does not read the interval string
(the note in ``facts.py`` says why). So it is not in the manifest and a program
calling it is refused at load naming it, rather than answered from the next bar's
time, which is a reading no live engine could make.

**The zone is read as the one this engine can read.** A calendar in any other
zone is a reader the host supplies, so a case whose record names another zone is
named ``unsupported`` by the caller rather than answered under the wrong
calendar.
"""

from dataclasses import dataclass
from typing import Any, Mapping, Optional, Sequence, Tuple

from ..values import ABSENT
from .spellings import Malformed

#: ``stdlib.md`` 12.4: the entries of the namespace this engine derives.
SESSION_FACTS: Tuple[str, ...] = ("session.isFirstBar",)

#: The bar fact both readers of a session boundary take it from: the namespace
#: entry above, and ``vwap``, which restarts where the session opened.
SESSION_FIRST = "isSessionFirst"

#: The zone the engine's own calendar is right for.
READABLE_ZONE = "UTC"

_DAY_MS = 86_400_000
_MINUTE_MS = 60_000

#: 4.3: midnight at the end of the day, which is the one spelling past 23:59.
_END_OF_DAY = 24 * 60

#: 1970-01-01 was a Thursday, and 4.3 numbers Monday as 1 through Sunday as 7.
_EPOCH_DAY = 4


@dataclass(frozen=True)
class Session:
    """The window, in minutes from midnight, and the days it runs on."""

    start: int
    end: int
    days: Tuple[int, ...]

    @property
    def crosses_midnight(self) -> bool:
        """4.3: "an ``end`` earlier than its ``start`` crosses midnight"."""
        return self.end < self.start


def _minutes(text: Any, field: str) -> int:
    """``"HH:MM"``, in the one spelling 4.3 fixes, or the refusal it names.

    ``"9:00"`` is the spelling a host writes first and it is not a time here, so
    it is refused rather than read: a record stating a window in a spelling the
    page does not have is a record whose author believes they stated a session.
    """
    if not isinstance(text, str) or len(text) != 5 or text[2] != ":":
        raise Malformed(
            f"instrument.json: the session's {field} is {text!r}, and host-interface.md 4.3 "
            'spells a wall clock time "HH:MM"'
        )
    hours, minutes = text[:2], text[3:]
    if not hours.isdigit() or not minutes.isdigit():
        raise Malformed(f"instrument.json: the session's {field} is {text!r}, which is not HH:MM")
    held = int(hours) * 60 + int(minutes)
    if held > _END_OF_DAY or int(minutes) > 59:
        raise Malformed(
            f"instrument.json: the session's {field} is {text!r}, and the latest time 4.3 has is "
            '"24:00", which is midnight at the end of the day'
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
    if not isinstance(days, list) or days == []:
        raise Malformed("instrument.json: the session states no days, and an empty list is not one")
    for day in days:
        if not isinstance(day, int) or isinstance(day, bool) or not 1 <= day <= 7:
            raise Malformed(
                f"instrument.json: the session names the day {day!r}, and 4.3 numbers Monday as 1 "
                "through Sunday as 7"
            )
    return Session(_minutes(held.get("start"), "start"), _minutes(held.get("end"), "end"), tuple(days))


def _day_of_week(day: int) -> int:
    """The day of the week of a whole day since the epoch, Monday as 1."""
    return (day + _EPOCH_DAY - 1) % 7 + 1


def opening_day(time: int, session: Session) -> Optional[int]:
    """Which session a bar belongs to, as the day it opened on, or nothing.

    The day is an identity and not a date: two bars of one session share it, and
    the bar that does not share it with the bar before it is the bar that opened
    a session. A bar outside the window belongs to no session, which is a false
    reading of every fact here rather than an absent one.
    """
    day, milliseconds = divmod(int(time), _DAY_MS)
    minute = milliseconds / _MINUTE_MS
    if session.crosses_midnight:
        if minute >= session.start:
            opened = day
        elif minute < session.end:
            opened = day - 1
        else:
            return None
    elif session.start <= minute < session.end:
        opened = day
    else:
        return None
    return opened if _day_of_week(opened) in session.days else None


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
