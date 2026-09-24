# series/extremes

`highest(high, 3)` and `lowest(low, 3)`.

## What it pins

`stdlib.md` 9: the largest and the smallest value in the last `len` bars, the bar
itself included, absent through bar `len - 2`.

## What a wrong engine does differently

- A window that excludes the current bar: every value one bar late.

## Reference

Computed by an independent implementation in Python of the definition the case
cites, written by the author of this case from the text of `stdlib.md` and not
from either engine, under this repository's licence. It accumulates in the order
the section fixes, in binary64, so it is held to the same bits.
