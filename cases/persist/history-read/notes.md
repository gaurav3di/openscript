# persist/history-read

`close[1]` and `close[2]` over eight bars.

## What it pins

`language.md` 5.2 and 7.4: a history read past the start of the dataset is
absent, not zero and not the oldest bar. `close[1]` is absent on bar 0 and
`close[2]` on bars 0 and 1, and from then on each reads the close that many bars
back, exactly.

## What a wrong engine does differently

- Reading past the start as zero: a column of zeros where this has `none`.
- Clamping to the oldest bar: bar 0's close where this has `none`.
- An index off by one: every value one bar early or late.

## Reference

Computed in Python from `bars.csv` by indexing the close column, with no engine
involved, by the author of this case, under this repository's licence.
