# math/pvt-overflow

`pvt()` over five bars of unit volume, closing at 1, 1e308, -1e308, 2 and 3.

## What it pins

`compiled-program.md` 3.1 makes a non-finite result absent after each
operation, and `stdlib.md` 20.6 says an absent term leaves the total where it
was. Bar 1 adds a change of 1e308 and the total is 1e308. On bar 2 the change,
-1e308 less 1e308, overflows, so that bar's term is absent: the bar is absent
and the total stays at 1e308. Bar 3 adds ((2 + 1e308) / -1e308) * 1, which is
-1, and 1e308 - 1 rounds back to 1e308; bar 4 adds 0.5 with the same result.

## What a wrong engine does differently

- Adding the unchecked term stores an infinite total on bar 2, and bars 3 and
  4 are absent with every bar after them.
- Resetting the total after the overflow, instead of keeping it, reports -1 on
  bar 3 and -0.5 on bar 4.

## Reference

Worked by hand from the text of `stdlib.md` 20.6, and checked against an
independent implementation in Python that rounds each stated operation from
exact rational operands, written for this case and not taken from either
engine, under this repository's licence.
