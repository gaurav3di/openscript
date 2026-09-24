# flow/for-to

Two loops: one to the bar's own index, and one with a step.

## What it pins

`language.md` 10.3: `for i = a to b` runs from `a` to `b` inclusive, and
`step` changes the increment. On bar 0 the first loop is `1 to 0`, which is an
empty range and not a reversed one, so the total is zero; on bar `n` it is the
sum of one to `n`. The second loop visits 0, 3, 6 and 9 and stops before 12.

## What a wrong engine does differently

- An exclusive upper end: every total one term short.
- A range that reverses itself when it is empty: bar 0 reads one.
- A stepped loop that stops at the last step not past the end: 18 either way,
  and a step that overshoots the end and still runs: 30.

## Reference

The sums computed in Python, by the author of this case, under this repository's
licence.
