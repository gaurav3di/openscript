# req/setting-in-expression

Two four hour averages whose lengths are settings: one read through a name,
`length`, the other written in place inside the read's expression.
`settings.json` swaps the two defaults, three for the named one and two for the
inline one.

## What it pins

`stdlib.md` 15.4 and `compiled-program.md` 2.16: an `input()` read inside a
read, either way it is written, is resolved in the enclosing program before the
body runs and filled into a register of the body's own table. So the named
average needs three buckets and first appears on bar 12, and the inline one
needs two and first appears on bar 8, each at the length the host supplied and
not at its declared default.

## What a wrong engine does

One that ran the body with the declared default draws the named average from
bar 8 and the inline one from bar 12. One that read the register from the
enclosing program's table reads another value altogether.

## Reference

Computed by the author of this case from the bars, by a direct reading of the
sections above that neither engine uses; the average adds oldest first.
