# math/min-max-clamp

`max`, `min` and `clamp` against fixed bounds.

## What it pins

`stdlib.md` 8.1: `min(a, b)` and `max(a, b)` of two numbers, and
`clamp(x, lo, hi)` is `x` held between the two bounds.

## Reference

Computed by an independent implementation in Python of the definition the case
cites, written by the author of this case from the text of `stdlib.md` and not
from either engine, under this repository's licence. It accumulates in the order
the section fixes, in binary64, so it is held to the same bits.
