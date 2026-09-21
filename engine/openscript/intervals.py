"""Timeframe strings, and the one thing the session facts need from them.

`stdlib.md` section 15.2 fixes the spelling: a count and a unit, with the unit
letters case sensitive so ``"1M"`` is one month and ``"1m"`` one minute, and a
bare number read as minutes because that is the form an interval input supplies.
`host-interface.md` 4.1 states the instrument's own interval in that spelling and
calls two facts derived from it, which is why an engine reads the string rather
than being told the number: two sources for one fact can disagree and no rule
would say which of them wins.

**What is here is the length of one bar and nothing else.** Folding a coarser
timeframe onto a chart's bars is section 15's work and another stage's; the
session facts need one number, the minutes a bar covers, and they need it for one
reason, which is the fact `host-interface.md` 4.3 says earns the session its
place: ``session.isLastBar`` is true on the last bar of the schedule even when
trading stopped early, and the bar that reaches the scheduled close is a bar slot
measured against it. Without the interval there is no slot, and an engine that
answered from the next bar's time would be making a reading no live engine can
make: on the bar in front of you there is no next bar.

**A month is counted at its nominal length**, thirty days, and that is not a
claim about a calendar. Any bar of a day or more spans a whole session whatever
the exact figure, so every number past the length of a session gives the session
facts the same answer. Where a calendar bucket actually begins is a different
question, and a stage that folds one answers it from the calendar rather than
from this.

**A string this grammar does not hold leaves the answer absent.** A host that
states an interval in a spelling 15.2 does not have has stated nothing this
engine can read, and the session facts that depend on it are absent rather than
answered from a guess at what the string meant.
"""

import re
from typing import Optional

#: 15.2's grammar. A bare number is minutes, which is the interval form a host
#: supplies, and the letters are case sensitive.
_WRITTEN = re.compile(r"^([0-9]+)(m|h|D|W|M)?$")

#: The nominal length of one unit in minutes, which is what orders two
#: timeframes and what sizes a bar slot.
_NOMINAL = {"m": 1, "h": 60, "D": 1440, "W": 10080, "M": 43200}


def bar_minutes_of(interval: object) -> Optional[float]:
    """Minutes one bar of this interval covers, or nothing for a string 15.2 has not.

    A count of zero is not an interval: a bar of no length would make every bar
    the last of its session, which is the one reading worse than absence.
    """
    if not isinstance(interval, str):
        return None
    found = _WRITTEN.match(interval.strip())
    if found is None:
        return None
    count = int(found.group(1))
    if count < 1:
        return None
    return float(count * _NOMINAL[found.group(2) or "m"])
