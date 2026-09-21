# order/fold-after-terminal

Harvested from `examples/10-strategy-ema-cross.oscript` by
`scripts/harvest-cases.mjs`, which is the only thing that writes here.
`conformance.md` section 1 says a strategy case is harvested from a run rather
than written by hand, and section 10 says a case is never edited to make an
engine pass: the files beside this one are what a run produced, and a change to
any of them is a change to what the run produced.

## Why this case exists

`stdlib.md` 17.8 says a fill arriving after a terminal status is folded for its
quantity with the status left terminal, and gives the reason: a cancellation can
race a fill at any destination, and an engine that refuses the late frame leaves
the account holding a position the strategy cannot see. This is the run of
`order/buy` against a destination that acknowledges the first entry, cancels it
a boundary later and reports it filled whole the boundary after that. The row
ends `cancelled` carrying 1084 filled and an average price, which is the shape
that sentence describes and which no other case in the suite has, and the
position that fill opened is the one the first trade is folded from.

## What it defends against

A second engine that refuses a frame because the row it names has ended folds no
quantity: its first row reports nothing filled, the position never opens, and
the first trade of `expected.json` has nothing to be folded from. One that lets
the late fill move the status writes `filled` where this case says `cancelled`,
which is the other half of the same sentence and the half an engine is likelier
to get wrong. One that leaves `updatedAt` where the placement put it disagrees
on that row and on nothing else. What it does not defend: a cancellation the
strategy itself asked for, because no shipped example calls `cancel(...)` and a
case is a run that happened; the cancellation here is the destination behaving
as a destination does.

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
