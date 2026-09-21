# order/buy

Harvested from `examples/10-strategy-ema-cross.oscript` by
`scripts/harvest-cases.mjs`, which is the only thing that writes here.
`conformance.md` section 1 says a strategy case is harvested from a run rather
than written by hand, and section 10 says a case is never edited to make an
engine pass: the files beside this one are what a run produced, and a change to
any of them is a change to what the run produced.

## Why this case exists

`feature-matrix.md` row `order/buy` says `buy(...)` enters or adds to a long
position, and this run is the entry half proved end to end: the script decides
the bar, the tag and the quantity, the ledger records what was sent and what
filled, and the trades and the summary are folded from those fills. Pyramiding
is one in this script, so the adding half of the row is not exercised here and
no case claims it.

## What it defends against

A second engine that enters on another bar, sizes the entry differently from the
same average and range readings, folds the frames in `frames.csv` to another
ledger, or works the trades and the summary out from the fills differently
disagrees with `expected.json` at the first row that differs. Two things it does
not defend, said here rather than discovered: the bracket the script attaches
with `exit(...)` reaches the destination as a protective instruction that no
destination in this repository fills yet, so every exit in the ledger is one
`close()` sent; and the fill prices are the destination's, delivered as input
through `frames.csv`, so their timing and slippage are facts of this case rather
than claims about the engine under test.

## What the run produced

400 bars, 13 ledger rows, 6 trades and the summary of the run, all in
`expected.json`, with the frames the destination answered in `frames.csv`.

## Where the bars came from

A fixed formula and not a market: a wave with a trend under it and a range
around each close, hourly from one instant, which is the fixture the Phase 5
gate drives every shipped strategy over (`scripts/lib/strategy-drive.mjs`).
Nobody holds rights over them, so section 3's rule for bars that come from a
market has nothing to record here.

## The instrument

`instrument.json` is the record the engine was handed, as section 2 requires.
The contract in it is the gate's placeholder, priced in a currency nobody
issues, and the facts beside the contract are the defaults section 3 gives a
case that states none, read from that page when the case was harvested rather
than chosen here. They are boring on purpose, so this case is about the strategy
and not about a session rule.

## When it fails

Section 10 has the procedure. Running the harvest again reproduces these bytes
from this engine or refuses to overwrite them, and a refusal is a disagreement
to settle by reading the specification against both engines, never by editing
the case. Nothing here asserts a value that reaches a gap of `stdlib.md` section
20.11: the harvest refuses a script that does, by name.
