# absent/arithmetic

`close - close[3]`, absent for three bars and then a difference.

## What it pins

`language.md` 6.2: an arithmetic operation with an absent operand is absent. The
right operand is absent on bars 0 to 2, so the difference is too, and it is an
exact binary64 difference from bar 3.

## What a wrong engine does differently

- Absence read as zero: bars 0 to 2 hold the close itself.
- Absence skipped: bars 0 to 2 hold something plausible rather than `none`.

## Reference

Each difference computed in Python as the binary64 subtraction of the two closes
in `bars.csv`, by the author of this case, under this repository's licence.
