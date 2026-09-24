# flow/switch-value

A `switch` over the index modulo four, with a case of two values and a default.

## What it pins

`language.md` 10.6: the value form compares the subject with each case in order,
takes the first that matches, never falls through to the next, and takes
`default` when none matches. A case may list several values, and a name the arms
set is declared before the `switch`, as that section requires.

## What a wrong engine does differently

- Fall through: phase 0 reads 20 or 30.
- Only the first value of a case matched: phase 2 reads 30.

## Reference

By the rule above.
