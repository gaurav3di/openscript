# time/clock-fields

`date.hour`, and `date.minute` and `date.second` of a time ninety seconds on.

## What it pins

`stdlib.md` 12.2: the clock fields of `t` in the chart's zone, 0 to 23 and 0 to
59. The bars open on the hour, so the minute and the second are read from a
time ninety seconds later, which is one minute and thirty seconds.

## Reference

Each field computed from the bar's time with Python's own `datetime` in UTC,
which neither engine uses, by the author of this case, under this repository's
licence.
