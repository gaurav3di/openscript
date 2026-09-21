# perf/report-window

Harvested from `examples/10-strategy-ema-cross.oscript` by
`scripts/harvest-cases.mjs`, which is the only thing that writes here.
`conformance.md` section 1 says a strategy case is harvested from a run rather
than written by hand, and section 10 says a case is never edited to make an
engine pass: the files beside this one are what a run produced, and a change to
any of them is a change to what the run produced.

## Why this case exists

`feature-matrix.md` row `perf/report-window` says which of the bars supplied a
run is reported over, and `conformance.md` section 3 carries the window in
`backtest.json` because the host chooses it and the script never states it. This
is the run of `order/buy`, the same script over the same bars, reported over
bars 150 to 300 by their own times. The ledger, the trades and the realised
profit are that case's to the last bit and the report is not: 151 bars are
reported rather than 400, 90 of them holding a position rather than 187, and the
deepest drawdown is the deepest one inside the window. The window opens during
the third trade and closes during the fifth, so a position opened before the
first reported bar is carried into the window rather than appearing from
nowhere, and one still open at the last reported bar is carried out of it.

## What it defends against

A second engine that executes only the bars inside the window warms its averages
from bar 150 and crosses on other bars, and the frames this case holds then
arrive after bars it never ran, which is where it stops. One that reports every
bar supplied reports 400 where the summary says 151, and measures the drawdown
over bars the window excludes. One that counts only the trades that opened and
closed inside the window counts fewer than the six `expected.json` lists, two of
which are over before the window opens, and works another expectancy out from
them. What it does not defend: both bounds are the times of bars this fixture
holds, so a bound falling between two bars or outside them is not a shape this
case has, and neither is the refusal of a window holding no bar at all (OS6020),
which no harvested case can carry because a case is a run that happened.

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
