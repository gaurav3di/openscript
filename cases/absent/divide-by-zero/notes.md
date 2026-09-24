# absent/divide-by-zero

`close / (bar.index - 3)`, whose divisor is zero on bar 3 only.

## What it pins

`language.md` 6.3: division by zero is absent, not an infinity and not an error.
The divisor is negative before bar 3 and positive after it, so the quotients on
either side are ordinary binary64 divisions and bar 3 is the one gap.

## What a wrong engine does differently

- An infinity on bar 3, which no case file can spell and which the comparison
  refuses.
- A stopped bar: a diagnostic where this case expects none.

## Reference

Each quotient computed in Python as the binary64 division of the close by
`index - 3`, by the author of this case, under this repository's licence.
