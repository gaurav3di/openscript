# absent/or-else

`orElse(close[2], -1)`.

## What it pins

`language.md` 6.1 and `stdlib.md` 8.1: `orElse(x, fallback)` is `x` when `x` is
present and `fallback` when it is not. The fallback is chosen here to be a value
no close can be, so a column that confused the two could not pass.

## What a wrong engine does differently

- Absent on bars 0 and 1: the fallback was ignored.
- `-1` after bar 1: the fallback was taken whether or not the value was present.

## Reference

By the rule above, from `bars.csv`.
