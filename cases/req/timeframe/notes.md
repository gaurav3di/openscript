# req/timeframe

An expression computed on a coarser interval and folded onto the chart's bars,
at the three calendar units: the previous day's range, the week's open so far,
and the previous month's close, over eleven trading days from Monday 30 December
2024 to Tuesday 14 January 2025, four bars a day at 00:30, 08:00, 15:00 and
23:30.

## What it pins

`stdlib.md` 15.1, 15.2 and 15.4, and `compiled-program.md` 2.16.2's keys: a day,
week or month is a civil date in the instrument's timezone, which
`instrument.json` states as UTC. So the 23:30 bar is the last of its day and the
00:30 bar the first of the next; `high - low` is computed on the day's bucket
bar, the extremes of its four bars, and not on any chart bar; the week begins on
a Monday, so the week open steps on 30 December and 6 and 13 January and not on
a Thursday; and the month read steps on 2 January, the first bar of January,
with December's last close.

UTC because the second engine reads a calendar in that zone only and declines
any other (`engine/openscript/zones.py`); a case in another zone would be
`unsupported` there and could not be compared.

## What a wrong engine does

One that counted a week as 10,080 minutes from the epoch starts it on a
Thursday. One that folded a day in another zone moves the 23:30 or the 00:30 bar
into the wrong day. One that took the range of a chart bar rather than of the
day reads a quarter of it.

## Reference

Computed by the author of this case, with Python's own `datetime` in UTC for the
dates and weekdays, which neither engine uses for this.
