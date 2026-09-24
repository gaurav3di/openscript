# ta/average-simple

`sma(close, 3)` and `sma(close, 5)` over twelve bars.

## What it pins

`stdlib.md` 20.2.1 and 20.3: the window sum is taken fresh on every bar, oldest
value first, and divided once by the length. The warmup is exact: absent through
bar `len - 2`, present from bar `len - 1`.

## What a wrong engine does differently

- A running total that subtracts the value leaving the window: a different last
  bit on some bars, which the exact comparison reports.
- Newest first: a different last bit wherever the sum's rounding depends on the
  order.
- A warmup one bar out: a value where this case has `none`, or the reverse.

## Reference

Computed by an independent implementation in Python of the definition the case
cites, written by the author of this case from the text of `stdlib.md` and not
from either engine, under this repository's licence. It accumulates in the order
the section fixes, in binary64, so it is held to the same bits.
