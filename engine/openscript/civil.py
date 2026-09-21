"""Calendar arithmetic on civil dates: no zone, no instant, no clock.

A civil date is a year, a month and a day as a person writes them. Turning one
into an instant needs a zone and lives in ``zones.py``; everything here is
counting days, and the two are separated for that reason: the day number of the
fifteenth of March is the same fact in every zone on earth, and mixing the two
questions is how a calendar ends up right in one half of the year.

The day number is days since 1970-01-01, positive after it and negative before.
The conversion both ways is the standard proleptic Gregorian one, shifted so the
leap day falls at the end of an internal year that starts in March: that is what
removes the special case for February and makes the inverse exact rather than
iterative.

**Nothing here is read out of a library that answers dates.** The interpreter
ships one, and it holds a year to the range 1 to 9999 and raises outside it,
while a timestamp a script may hand ``date.year`` is any binary64 number of
milliseconds. An engine that raised there would stop a bar over a number the
language says is a number, and an engine that clamped would answer a year nobody
asked for, so the arithmetic is the formula and the range is the whole of it.
The interpreter's own calendar is used in the tests instead, as the independent
reference `conformance.md` section 4 asks the expected values of a numeric
function to agree with.

**Two instants are not a calendar field, and the boundary is stated here once.**
A timestamp is truncated towards zero before it is read, because that is what the
first engine's own date reader does with a fractional millisecond, and a
magnitude past the largest instant that reader holds has no fields at all rather
than fields read off an overflow.
"""

import math
from typing import NamedTuple, Optional

#: Milliseconds in the units a reading is split into.
SECOND_MS = 1_000
MINUTE_MS = 60_000
HOUR_MS = 3_600_000
DAY_MS = 86_400_000

#: Minutes in a day, so that a wrap past midnight is named rather than written.
DAY_MINUTES = 1_440

#: The largest instant either engine reads.
#:
#: The first engine reads an instant through the runtime's own date object, whose
#: range is fixed at a hundred million days either side of the epoch; past it
#: there is no reading at all, and the calls of `stdlib.md` section 12.2 answer
#: absence. The number is here so that this engine's absence begins on the same
#: millisecond rather than a few days later, which is a difference no tolerance
#: would forgive: section 6 compares a time exactly and compares absence for
#: presence.
MAX_INSTANT = 8.64e15


class Civil(NamedTuple):
    """A date and a time of day as a person writes them, with no zone attached."""

    year: int
    #: 1 to 12.
    month: int
    #: 1 to 31.
    day: int
    hour: int
    minute: int
    second: int


def day_number(year: int, month: int, day: int) -> int:
    """Days from 1970-01-01 to this civil date.

    The era is the four hundred year block the date falls in, and it is a floor
    division with nothing added to it. The published form of this algorithm is
    written in a language whose division truncates towards zero, so it subtracts
    399 from a negative year to make truncation behave like a floor; the
    interpreter's own division already floors, and doing both is doing it twice.
    The doubled adjustment is invisible for two thousand years either side of the
    epoch and moves every date before the common era by one day, which is the
    shape of mistake a test written over modern dates cannot see.
    """
    shifted = year - 1 if month <= 2 else year
    era = shifted // 400
    year_of_era = shifted - era * 400
    day_of_year = (153 * (month + (-3 if month > 2 else 9)) + 2) // 5 + day - 1
    day_of_era = (
        year_of_era * 365 + year_of_era // 4 - year_of_era // 100 + day_of_year
    )
    return era * 146097 + day_of_era - 719468


def date_of_day(days: int) -> tuple[int, int, int]:
    """The civil date a day number names, the exact inverse of ``day_number``."""
    shifted = days + 719468
    era = shifted // 146097
    day_of_era = shifted - era * 146097
    year_of_era = (
        day_of_era - day_of_era // 1460 + day_of_era // 36524 - day_of_era // 146096
    ) // 365
    year = year_of_era + era * 400
    day_of_year = day_of_era - (365 * year_of_era + year_of_era // 4 - year_of_era // 100)
    month_part = (5 * day_of_year + 2) // 153
    day = day_of_year - (153 * month_part + 2) // 5 + 1
    month = month_part + (3 if month_part < 10 else -9)
    return (year + 1 if month <= 2 else year, month, day)


def weekday_of_day(days: int) -> int:
    """The day of the week, 1 for Monday through 7 for Sunday.

    Monday is 1 so that a weekday test reads ``date.dayOfWeek(time) <= 5`` and a
    trading week is a contiguous range, which `stdlib.md` section 12.2 states and
    gives the reason for. 1970-01-01 was a Thursday, which is 4 on this
    numbering, and the interpreter's own remainder is never negative, so a day
    before the epoch needs no second rule.
    """
    return (days + 3) % 7 + 1


def day_of_year_of(year: int, month: int, day: int) -> int:
    """The day of the year, 1 to 366."""
    return day_number(year, month, day) - day_number(year, 1, 1) + 1


def week_of_year_of(year: int, month: int, day: int) -> int:
    """The week number, weeks starting Monday.

    Read as the ISO 8601 week: week 1 is the week holding the year's first
    Thursday, so a week that straddles the new year belongs to the year holding
    most of it and no year ever has a week 0. Section 12.2 fixes the Monday start
    and settles the rest of it for the same reason it fixes the numbering: the
    other common reading differs by a whole week at the turn of most years, and a
    reader has no way to tell from a chart which of the two drew it.
    """
    days = day_number(year, month, day)
    thursday = days + (4 - weekday_of_day(days))
    owner = date_of_day(thursday)[0]
    return (thursday - day_number(owner, 1, 1)) // 7 + 1


def whole_instant(instant: float) -> Optional[int]:
    """A timestamp as the whole millisecond a calendar reads, or nothing.

    Truncated towards zero rather than floored, which is what the first engine's
    date reader does with a fraction, and absent past ``MAX_INSTANT``, which is
    where that reader stops having fields to give.
    """
    if not math.isfinite(instant) or abs(instant) > MAX_INSTANT:
        return None
    return int(instant)


def fields_at(instant: int) -> Civil:
    """The civil reading of a whole millisecond count, with no zone applied.

    The floor division is the calendar's own: a day begins at midnight and an
    instant before the epoch belongs to the day that holds it, not to the one
    after it, which is what truncation towards zero would answer.
    """
    days, inside = divmod(instant, DAY_MS)
    year, month, day = date_of_day(days)
    hour, inside = divmod(inside, HOUR_MS)
    minute, inside = divmod(inside, MINUTE_MS)
    return Civil(year, month, day, hour, minute, inside // SECOND_MS)


def instant_at(fields: Civil) -> int:
    """The millisecond count a civil reading names, with no zone applied.

    **Every field carries**, so a month of 13 is January of the next year, an
    hour of 25 is one in the morning of the next day, and a day of 0 is the last
    of the month before. That is not this engine's licence: ``date.from`` is
    written on the first engine over a date object whose setters carry the same
    way, and a second engine that refused an out of range field would answer
    absence where the first answers an instant. The carrying is linear, so it is
    one expression rather than a normalising step.
    """
    months = fields.year * 12 + (fields.month - 1)
    year, month = divmod(months, 12)
    days = day_number(year, month + 1, 1) + (fields.day - 1)
    return (
        days * DAY_MS
        + fields.hour * HOUR_MS
        + fields.minute * MINUTE_MS
        + fields.second * SECOND_MS
    )


def minutes_of(fields: Civil) -> float:
    """Minutes from midnight of a reading, which is what a wall clock range holds.

    The seconds are in it and the milliseconds are not, because a reading is a
    civil one: the first engine's ranges are tested against a reading with no
    milliseconds in it, and a bound is a whole minute in both spellings of a
    window, so the two readings fall on the same side of every bound either way.
    """
    return fields.hour * 60 + fields.minute + fields.second / 60
