# math/cmf-negative-volume

`cmf(2)` over seven bars whose volumes are 5, -8, -4, 3, -6, 6 and -2.

## What it pins

`stdlib.md` 20.6 makes `cmf` the window sum of the flow term divided by the
window sum of the volume, and a ratio is absent where its divisor is zero. A
negative window volume is a divisor like any other, so bar 1 reads
-2.6666666666666665 / -3, bar 3 reads -2.333333333333333 / -1, and only bar 5,
whose window volumes -6 and 6 sum to zero, is absent. Bar 0 is the warmup.

## What a wrong engine does differently

- Requiring the window volume to be above zero reads `none` on every window
  whose volume sums below zero: bars 1, 2, 3 and 4 here.

## Reference

Worked by hand from the text of `stdlib.md` 20.6 and checked with plain double
arithmetic in the stated order, written for this case and not taken from either
engine, under this repository's licence.
