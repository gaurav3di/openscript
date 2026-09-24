# ta/average-exponential

`ema(close, 4)` over twelve bars.

## What it pins

`stdlib.md` 20.2.2 and 20.3: absent before the seed bar, the window mean of
20.2.1 on the seed bar, and `value * weight + running * rest` after it, with
`weight = 2 / (len + 1)` and `rest = 1 - weight`, each a binary64 value.

## What a wrong engine does differently

- Seeding from bar 0 with the first close: values from bar 0 where this case has
  `none`, and different values for many bars after.
- `running + weight * (value - running)`: the same quantity in exact arithmetic
  and a different last bit in binary64.

## Reference

Computed by an independent implementation in Python of the definition the case
cites, written by the author of this case from the text of `stdlib.md` and not
from either engine, under this repository's licence. It accumulates in the order
the section fixes, in binary64, so it is held to the same bits.
