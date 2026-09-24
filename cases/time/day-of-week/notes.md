# time/day-of-week

`date.dayOfWeek(time)` over bars from a Monday evening to a Friday.

## What it pins

`stdlib.md` 12.2: 1 for Monday through 7 for Sunday, so a trading week is a
contiguous range. Numbering Sunday as 1 shifts every value by one.

## Reference

Each field computed from the bar's time with Python's own `datetime` in UTC,
which neither engine uses, by the author of this case, under this repository's
licence.
