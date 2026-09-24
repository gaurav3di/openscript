# ta/stdev-population

`stdev(close, 4)` over twelve bars.

## What it pins

`stdlib.md` 20.5: the variance is two passes, the window mean first and the sum
of squared deviations from it second, both oldest first, divided by the length
because the population form is the default; the deviation is its square root,
taken once.

## What a wrong engine does differently

- The sample form, divided by `len - 1`: every value larger.
- The one pass form, the mean of squares less the square of the mean: a
  different last bit on most bars.

## Reference

Computed by an independent implementation in Python of the definition the case
cites, written by the author of this case from the text of `stdlib.md` and not
from either engine, under this repository's licence. It accumulates in the order
the section fixes, in binary64, so it is held to the same bits.
