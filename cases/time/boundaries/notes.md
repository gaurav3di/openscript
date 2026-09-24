# time/boundaries

`date.startOfDay`, `date.startOfWeek`, `date.startOfMonth` and `date.isSameDay`.

## What it pins

`stdlib.md` 12.2: midnight at the start of the day, of the Monday, and of the
first of the month that `t` falls in, in the chart's zone, as a timestamp. The
week of 30 December 2024 starts that Monday, in December, while the month of a
bar on 2 January starts on 1 January. `date.isSameDay` is true where five hours
later is still the same calendar day, so the bars at 20:00 and 21:00 read
false and the rest read true.

## Reference

Each field computed from the bar's time with Python's own `datetime` in UTC,
which neither engine uses, by the author of this case, under this repository's
licence.
