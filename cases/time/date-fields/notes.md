# time/date-fields

Year, month, day and day of the year over eight bars that cross 31 December.

## What it pins

`stdlib.md` 12.2: each field of `t` read in the chart's zone, which the default
instrument states as UTC. The dataset crosses the turn of the year, so a field
read in the wrong year, a month numbered from zero or a day of the year counted
from zero all show.

## Reference

Each field computed from the bar's time with Python's own `datetime` in UTC,
which neither engine uses, by the author of this case, under this repository's
licence.
