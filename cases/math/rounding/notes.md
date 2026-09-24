# math/rounding

`round(x)` over the halves and whole numbers from -3.5 to 2.

## What it pins

`stdlib.md` 8.1 and 20.7: `round(x)` rounds a half away from zero, so -2.5 is -3
and 1.5 is 2, where rounding halves to even would give -2 and 2, and rounding
halves up would give -2 and 2.

## What a wrong engine does differently

- Halves to even: -2.5 reads -2 and -0.5 reads 0 rather than -1.
- Halves up: every negative half reads one higher.

## Reference

Computed by an independent implementation in Python of the definition the case
cites, written by the author of this case from the text of `stdlib.md` and not
from either engine, under this repository's licence. It accumulates in the order
the section fixes, in binary64, so it is held to the same bits.
