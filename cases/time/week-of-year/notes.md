# time/week-of-year

`date.weekOfYear(time)` from 30 December 2024 into January 2025.

## What it pins

`stdlib.md` 12.2: the ISO 8601 week, whose week 1 holds the year's first
Thursday. 30 and 31 December 2024 are in week 1 of 2025, so the column reads 1
on both sides of the new year; counting from the first of January would read 53
and then 1.

## Reference

Each field computed from the bar's time with Python's own `datetime` in UTC,
which neither engine uses, by the author of this case, under this repository's
licence.
