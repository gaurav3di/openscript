# series/change

`change(close)` and `change(close, 3)`.

## What it pins

`stdlib.md` 9: `change(src, len)` is `src - src[len]`, one binary64 subtraction,
absent until the bar `len` back exists.

## Reference

Computed by an independent implementation in Python of the definition the case
cites, written by the author of this case from the text of `stdlib.md` and not
from either engine, under this repository's licence. It accumulates in the order
the section fixes, in binary64, so it is held to the same bits.
