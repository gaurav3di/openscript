# session/window-spec

Four windows over hourly bars from 07:00 to 14:00 on a Tuesday.

## What it pins

`stdlib.md` 12.5: a window written `HHMM-HHMM` holds a bar whose open time is at
or after the start and before the end, in the chart's zone. A window whose end
is before its start crosses midnight, so `1200-0800` holds 07:00 and the bars
from 12:00. A day list narrows the window to those days, 1 for Monday, so the
weekday list holds the Tuesday bars from 09:00 to 11:00 and the weekend list
holds none.

A malformed literal is OS3008 at compile time, which is a diagnostic rather than
a value: the catalogue's own example for that code raises it, and
`scripts/check-examples-compile.mjs` holds it there.

## Reference

By the rule above, by hand.
