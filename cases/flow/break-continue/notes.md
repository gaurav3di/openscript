# flow/break-continue

A loop that skips the even numbers and stops past a bound that grows each bar.

## What it pins

`language.md` 10.3 and 10.5: `continue` goes to the next iteration and `break`
leaves the loop. Each bar sums the odd numbers from one to its own index plus
one.

## What a wrong engine does differently

- `continue` as `break`: every bar reads one.
- `break` that only skips: every bar reads 25, the sum of every odd number to 10.

## Reference

The sums computed in Python, by the author of this case, under this repository's
licence.
