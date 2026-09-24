# math/mod

`mod(a, b)` over the same operands as `expr/remainder`.

## What it pins

`stdlib.md` 8.1 and `language.md` 9.2: `mod(a, b) = a - b * floor(a / b)`, whose
sign follows the right operand, so `mod(-7, 3)` is `2` and `mod(7, -3)` is `-2`,
and `mod(a, 0)` is absent. Read beside `expr/remainder`, the two columns agree
where the operands share a sign and differ where they do not.

## Reference

The formula above in Python, by the author of this case, under this
repository's licence.
