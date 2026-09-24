# expr/remainder

`%` over both signs of both operands, and a zero divisor.

## What it pins

`language.md` 9.2: `%` is the remainder of truncated division, so its sign
follows the left operand, `-7 % 3` is `-1` and `7 % -3` is `1`; and `a % 0` is
absent by 6.3. The divisor passes through zero on bar 3.

## What a wrong engine does differently

- The floored remainder, which is `mod` and not `%`: the sign follows the right
  operand on the bars where the two disagree.
- A zero divisor answered with a number or an error rather than `none`.

## Reference

`math.fmod` in Python, which is the truncated remainder of IEEE-754, applied to
each pair, by the author of this case, under this repository's licence.
