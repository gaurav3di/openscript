# array/element-limit

An array at the element ceiling, and the one element past it.

## What it pins

`language.md` 14.1 fixes the ceiling at 1,000,000 elements and says exceeding it
is OS5002. The ceiling is the language's own number and not a host's choice,
which is what makes it a conformance case rather than a local setting: an engine
that holds fewer refuses a script every conforming engine runs.

Four bars append a quarter of a million elements each, so the array holds
exactly the ceiling when bar 3 ends and nothing has been raised. The first
append of bar 4 is the element too many.

A quarter of a million iterations a bar is well inside the default loop budget,
so the bar that stops is stopped by the ceiling and not by the budget.

## What a wrong engine does differently

- A ceiling below a million: the diagnostic carries an earlier bar index.
- A ceiling above a million, or none: nothing is raised and the case fails on an
  empty diagnostics list.
- Refusing at the ceiling rather than past it: the last append of bar 3 is
  refused and the diagnostic carries bar index 3.

## Why the dataset stops at the bar that fails

Every later bar would append past the ceiling too, so an engine that stopped the
bar and carried on would report a diagnostic for each of them. The case asserts
one, and what a run does after a bar it stopped is fixed nowhere.
