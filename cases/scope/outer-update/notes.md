# scope/outer-update

A plain name declared at the top level and assigned inside an `if`.

## What it pins

`language.md` 12.2: the first assignment declares a name and a later one updates
it, including from an inner block. The name is recomputed every bar, so it reads
one on the bars whose close is above 102 and zero on the others.

## What a wrong engine does differently

- A second, block-local name: the column reads zero on every bar.

## Reference

By the rule above, from the closes in `bars.csv`.
