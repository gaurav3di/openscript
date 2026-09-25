# math/anchor-product-overflow

`vwapAnchor(close, bar.index == 0)` over four bars. Bar 1 closes at 1e308 on a
volume of 1e10.

## What it pins

`stdlib.md` 20.6 forms `src * volume` before adding it to the flow total, and
`compiled-program.md` 3.1 makes that product absent when it overflows. An
absent term leaves both totals where they were. Bar 0 gives 20 / 2 = 10, bar 1
is absent, bar 2 gives (20 + 120) / (2 + 6) = 17.5 and bar 3 gives
(140 + 60) / (8 + 2) = 20.

## What a wrong engine does differently

- Adding the infinite product stores an infinite flow total, and every bar
  until the next anchor is absent.
- Adding the bar's volume to the volume total while skipping its product gives
  140 divided by a volume total above 1e10 on bar 2 instead of 17.5.

## Reference

Worked by hand from the text of `stdlib.md` 20.6, and checked against an
independent implementation in Python that rounds each stated operation from
exact rational operands, written for this case and not taken from either
engine, under this repository's licence.
