# order/partial-fill

Harvested from `examples/10-strategy-ema-cross.oscript` by
`scripts/harvest-cases.mjs`, which is the only thing that writes here.
`conformance.md` section 1 says a strategy case is harvested from a run rather
than written by hand, and section 10 says a case is never edited to make an
engine pass: the files beside this one are what a run produced, and a change to
any of them is a change to what the run produced.

## Why this case exists

`stdlib.md` 17.8 folds a frame that is cumulative: a row takes the quantity
whole and the destination's average over it whole, and what is new in the frame
is the delta that settles as a fill. Every frame in the suite before this one
carried nothing filled or the whole order, so the difference between a quantity
and a delta could not be seen. This is the run of `order/buy` against a
destination told to report 400 of the first entry's 1084 units two boundaries
after it took the order and the rest five boundaries after, and 500 of the
closing order before the rest of it. Four things follow and are each in
`expected.json`: the first trade has two entries and two exits where every other
trade in the suite has one of each, its entry price is the average over two
pieces filled at two prices, the run is charged for fourteen fills where the
plain run is charged for twelve, and the two rows the destination answered late
carry an `updatedAt` that the placement did not put there.

## What it defends against

A second engine that reads `filledQty` as a delta and adds it to the row folds
1484 units onto a 1084 unit order and every figure after it is wrong. One that
works an average out from the pieces it saw, rather than taking the
destination's, writes another entry price on the first trade. One that charges a
commission per order rather than per fill reports 240 in charges where this case
says 280. One that leaves `updatedAt` where the placement put it disagrees on
two rows and on nothing else, and the suite before this case could not tell that
reading from the right one. What it does not defend: a frame whose quantity goes
backwards, which is a stale frame the fold swallows and `order/fold-repeat`
reserves, and a partial fill of a resting order, because this destination prices
a scheduled fill at the close of the bar the act falls on and answers a
scheduled order by the schedule alone.

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
