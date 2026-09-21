# input/host-values

Harvested from `examples/10-strategy-ema-cross.oscript` by
`scripts/harvest-cases.mjs`, which is the only thing that writes here.
`conformance.md` section 1 says a strategy case is harvested from a run rather
than written by hand, and section 10 says a case is never edited to make an
engine pass: the files beside this one are what a run produced, and a change to
any of them is a change to what the run produced.

## Why this case exists

`host-interface.md` 8.1 keys a stored value by the input's own name and never by
its position, and `conformance.md` section 2 is where those values reach a case:
`settings.json`, keyed the same way. This is the crossing strategy of
`order/buy` over the same bars with three inputs set, a faster fast average, a
slower slow one and half the amount risked on a trade, and it is the only case
in the suite carrying that file. The run it produces has ten ledger rows and
five trades where the declared defaults produce thirteen and six, and every
quantity in it is sized from the stored amount.

## What it defends against

A second engine that never opens `settings.json` runs the script under its own
defaults, crosses on other bars, and ends with a ledger that is not the one
`expected.json` holds, which is a failure no other case in the suite can
produce. One that keys a stored value by position rather than by name sets the
wrong three inputs, and the value that lands outside its input's bounds is
refused before the first bar, where this case records no diagnostic at all. One
that applies the values to the averages and sizes from the declaration rather
than from the stored amount agrees on every bar and disagrees on every quantity.
What it does not defend: the other half of 8.1, a row keyed by its title where
the input is assigned to no name, and the refusal of a stored value outside an
input's bounds (OS6019), because every value here is inside them and a case is a
run that happened.

## What the run produced

400 bars, 10 ledger rows, 5 trades and the summary of the run, all in
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
