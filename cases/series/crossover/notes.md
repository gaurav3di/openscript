# series/crossover

`crossUp(close, sma(close, 3))`, written out as minus one where it is absent, one
where it is true and zero where it is false.

## What it pins

`stdlib.md` 9: `crossUp(a, b)` is true on the bar where `a` was at or below `b` on
the bar before and is above it now, and absent while either side or either side's
previous value is absent, which here is through bar 2 of the average and one bar
more for the previous value.

## What a wrong engine does differently

- "Strictly below, then above": a touch followed by a rise is missed.
- Absence read as false: zero where this case has minus one.

## Reference

Computed by an independent implementation in Python of the definition the case
cites, written by the author of this case from the text of `stdlib.md` and not
from either engine, under this repository's licence. It accumulates in the order
the section fixes, in binary64, so it is held to the same bits.
