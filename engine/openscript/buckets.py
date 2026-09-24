"""Timeframe strings, and the bucket a read folds a bar into.

`stdlib.md` section 15.2 fixes the spelling: a count and a unit, with the unit
letters case sensitive so ``"1M"`` is one month and ``"1m"`` one minute, and a
bare number read as minutes because that is the form an interval input
supplies. This module is that grammar and the arithmetic that follows from it,
which is `compiled-program.md` section 2.16.2's table of keys, and nothing else.

**A bucket is named by a key rather than by a range**, because a key is one
integer per bar and a range is two comparisons and an edge case. Two bars
belong to the same requested bar exactly when their open instants give the same
key, and a bucket has begun on the first bar whose key is new. Every boundary
question in ``requests.py`` reduces to that one comparison.

**The two families are keyed differently, and the specification says why.** An
intraday request is folded by counting, so its key is the instant divided by the
period: buckets fall on the same boundaries for every engine and a session gap
moves nothing. A day, week or month request is folded by the calendar, so its
key is a civil date read in the instrument's zone. That is OS6015's distinction,
which exempts the calendar units from the whole multiple rule for this reason.

**A calendar bucket with no zone has no key**, and neither has one in a zone this
engine cannot read (``zones.py`` says which it can and why). The first is the
page's own rule and every engine gives it; the second is this engine's limit,
and a caller that meets it reports the case ``unsupported`` rather than
answering absence where the first engine folds.

**The count is a binary64, as the first engine's is.** A count is read as that
engine reads a number out of text, so a count too large for one is no count at
all, and every division below is the same floating point division on both
engines rather than an exact one on this side only.
"""

import math
import re
from typing import Any, NamedTuple, Optional, Tuple

from .canonical import canonical_number
from .civil import MINUTE_MS, day_number
from .zones import fields_in

#: 15.2's grammar. A bare number is minutes, which is the interval form a host
#: supplies, and the letters are case sensitive.
_WRITTEN = re.compile(r"([0-9]+)(m|h|D|W|M)?")

#: The nominal length of one unit in minutes. It orders two timeframes, which is
#: OS6002, and sizes a bar slot; where a calendar bucket begins is the calendar's.
NOMINAL = {"m": 1, "h": 60, "D": 1440, "W": 10080, "M": 43200}

#: What the first engine's reader trims from either end of a timeframe string:
#: that language's white space and line terminators, which are not this one's.
#: An interval written with a byte one of the two trims and the other keeps
#: would be a timeframe on one engine and OS6001 on the other.
_TRIMMED = (
    "\t\n\v\f\r           "
    "       　﻿"
)


class Timeframe(NamedTuple):
    """A count and a unit, and the string as the script wrote it."""

    count: float
    unit: str
    #: What a diagnostic and a request name it as, untrimmed.
    text: str


def parse_timeframe(text: Any) -> Optional[Timeframe]:
    """15.2's grammar, or nothing for a string it does not hold."""
    if not isinstance(text, str):
        return None
    found = _WRITTEN.fullmatch(text.strip(_TRIMMED))
    if found is None:
        return None
    try:
        count = float(int(found.group(1)))
    except OverflowError:
        # Past the largest binary64, which the first engine reads as infinity
        # and refuses as not a whole number: no timeframe either way.
        return None
    if count < 1:
        return None
    return Timeframe(count, found.group(2) or "m", text)


def is_intraday(timeframe: Timeframe) -> bool:
    """Whether this timeframe is folded by counting rather than by the calendar."""
    return timeframe.unit in ("m", "h")


def minutes_of(timeframe: Timeframe) -> Optional[float]:
    """Minutes one bar covers, for an intraday timeframe only."""
    return timeframe.count * NOMINAL[timeframe.unit] if is_intraday(timeframe) else None


def nominal_minutes(timeframe: Timeframe) -> float:
    """One timeframe's length in minutes, with a month treated as thirty days.

    Two uses and neither of them folds anything: ordering two timeframes, and
    the length of a bar slot the session facts measure against.
    """
    return timeframe.count * NOMINAL[timeframe.unit]


def bucket_key(instant: Any, timeframe: Timeframe, zone: Any) -> Optional[int]:
    """The bucket an instant falls in, or nothing when no key can be worked out.

    The four rows of section 2.16.2's table, in its order. A week is counted
    from a Monday: 1970-01-01 was a Thursday, so shifting the day number by
    three puts a Monday at the start of week zero, which is the week start
    `stdlib.md` 12.2 fixes.
    """
    if isinstance(instant, bool) or not isinstance(instant, (int, float)):
        return None
    if not math.isfinite(instant):
        return None
    minutes = minutes_of(timeframe)
    if minutes is not None:
        return math.floor(instant / (minutes * MINUTE_MS))
    if zone is None:
        return None
    civil = fields_in(instant, zone)
    if civil is None:
        return None
    if timeframe.unit == "M":
        return math.floor((civil.year * 12 + (civil.month - 1)) / timeframe.count)
    days = day_number(civil.year, civil.month, civil.day)
    if timeframe.unit == "D":
        return math.floor(days / timeframe.count)
    return math.floor(math.floor((days + 3) / 7) / timeframe.count)


def fold_refusal(requested: Timeframe, chart: Timeframe) -> Optional[Tuple[str, str]]:
    """Whether the chart's bars can be folded into the requested ones.

    Two refusals and no third, each as its code and, for OS6015, the multiple
    it suggests. A request finer than the chart is OS6002, because folding
    cannot invent bars that were never loaded; an intraday request that is not a
    whole multiple of the chart's is OS6015, because a bucket boundary inside a
    chart bar would put part of one bar in two requested bars. A dated request
    is exempt from the second.
    """
    if nominal_minutes(requested) < nominal_minutes(chart):
        return ("OS6002", "")
    wanted = minutes_of(requested)
    have = minutes_of(chart)
    if wanted is None or have is None:
        return None
    if math.fmod(wanted, have) == 0:
        return None
    return ("OS6015", canonical_number(math.ceil(wanted / have) * have))
