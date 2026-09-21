# order/ended-unfilled

Harvested from `examples/10-strategy-ema-cross.oscript` by
`scripts/harvest-cases.mjs`, which is the only thing that writes here.
`conformance.md` section 1 says a strategy case is harvested from a run rather
than written by hand, and section 10 says a case is never edited to make an
engine pass: the files beside this one are what a run produced, and a change to
any of them is a change to what the run produced.

## Why this case exists

`stdlib.md` 17.7 gives an order four terminal words and three of them end it
carrying less than it asked for. No case in the suite carried one: every order
in it filled, so an engine that never learned what to do with a quantity still
working passed. This is the run of `order/buy` against a destination that
refuses the first entry with its own text, lets the second expire and cancels
the third, each after acknowledging it and each with nothing filled. Because
nothing filled, no position opens on any of the three, the crossing back finds
the strategy flat and sends nothing, and the run reaches half the trades the
plain run does from the same bars. The refused row is the only row in the suite
carrying a `rejection`.

## What it defends against

A second engine that folds a terminal word as an ending of the whole order opens
a position of 1084 units that nothing filled, and every trade and every money
figure after it is a fold of that position. One that drops the text a refusal
carried writes null where this case records the text the destination sent. One
that keeps the row live after a terminal word lets the next crossing be refused
by the pyramiding limit rather than entering. One that leaves `updatedAt` where
the placement put it disagrees on the three rows the destination ended and on
nothing else. What it does not defend: an engine raising a code for a refused
order, which is OS7014 and deferred, so this case records the refusal in the
ledger and no diagnostic beside it.

## What the run produced

400 bars, 10 ledger rows, 3 trades and the summary of the run, all in
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
