# math/flow-span-overflow

`ad()` and `cmf(2)` over five bars of volume 2. Bar 1 has a high of 1e308, a
low of -1e308 and a close of 5e307.

## What it pins

`stdlib.md` 20.6 forms the span `high - low` before it divides by it, and
`compiled-program.md` 3.1 makes that span absent when it overflows. The true
term on bar 1 is finite, half of the volume, but the term the arithmetic reaches
is absent, so the bar is absent and the total of 1 carries on: 3, then 2, then
3. `cmf(2)` is absent on bars 1 and 2, whose windows hold the absent term, and
then reads 1 / 4 = 0.25 and 0 / 4 = 0.

## What a wrong engine does differently

- Dividing the finite numerator by the raw infinite span gives an exact zero
  term, so `ad` reads 1 on bar 1 and `cmf(2)` reads 0.25 on bar 1 and 0.5 on
  bar 2, readings for a bar whose term was never computed.
- Treating the overflowed span as a span that is not above zero gives the same
  zero term.

## Reference

Worked by hand from the text of `stdlib.md` 20.6, and checked against an
independent implementation in Python that rounds each stated operation from
exact rational operands, written for this case and not taken from either
engine, under this repository's licence.
