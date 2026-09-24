# absent/condition-false-branch

An `if` and a ternary over `close > close[1]`, which is absent on bar 0.

## What it pins

`language.md` 6.6: a condition that evaluates to `none` takes the false branch,
in an `if` and in a ternary alike. Bar 0 reads 2 in both columns, and from bar 1
each reads 1 on a rising close and 2 otherwise.

## What a wrong engine does differently

- Absence treated as true: bar 0 reads 1.
- A ternary that propagates its condition's absence: bar 0 of the second column
  is `none`.

## Reference

By the rule above, from the closes in `bars.csv`.
