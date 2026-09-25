# math/anchor-traded-overflow

`vwapAnchor` anchored on bars 0 and 3, over closes of 1e-10 on two bars of
volume 1e308 and then ordinary bars.

## What it pins

Every product here is finite, so no term is absent. On bar 1 the volume total,
1e308 + 1e308, overflows. `stdlib.md` 20.6 keeps a total that overflows as the
arithmetic produced it, as every running total in that section does, and
`compiled-program.md` 3.1 makes the total absent, so the average divided by it
is absent too, on bar 1 and on bar 2. The anchor on bar 3 starts both totals
again: 8 / 2 = 4, then (8 + 12) / (2 + 2) = 5. Bar 0 is the rounded product
1e-10 * 1e308 divided by 1e308, which rounds back to 1e-10.

## What a wrong engine does differently

- Dividing a finite flow total by the raw infinite volume total gives an exact
  zero on bars 1 and 2, a price nobody traded at.
- Resetting the totals after the overflow, instead of at the anchor, gives a
  reading on bar 2.

## Reference

Worked by hand from the text of `stdlib.md` 20.6, and checked against an
independent implementation in Python that rounds each stated operation from
exact rational operands, written for this case and not taken from either
engine, under this repository's licence.
