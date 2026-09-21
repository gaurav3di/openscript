# perf/money-digits

Harvested from `examples/11-strategy-opening-range.oscript` by
`scripts/harvest-cases.mjs`, which is the only thing that writes here.
`conformance.md` section 1 says a strategy case is harvested from a run rather
than written by hand, and section 10 says a case is never edited to make an
engine pass: the files beside this one are what a run produced, and a change to
any of them is a change to what the run produced.

## Why this case exists

`conformance.md` section 3 says the digit count is a fact of the run rather than
of the instrument, which is why `backtest.json` carries it and `instrument.json`
does not. This is the run of `order/sell` under a count of zero rather than two.
Every figure in `expected.json` is that case's figure unchanged, and that is the
assertion: the count reaches the total of one fill's charges, rounded half to
even, and no other figure of the report. Every charge in this run is twenty
currency units for a fill, a whole number under any count, so what this case
fixes is where the rounding does not reach rather than the rounding itself.

## What it defends against

A second engine that reads section 3 as every money figure being rounded to the
stated count writes a net profit of -654 where this case says -653.55, an
average loss of 38 where it says 38.44411764705882, and disagrees on most of the
summary. That is the reading the sentence invites, which is the whole reason
this case is here. What it does not defend, and the reason a stronger case
cannot be harvested from a shipped strategy: a charge that is not a whole
number, where the rounding itself decides a digit. That needs a schedule the
host supplies, and a supplied schedule beside a declared commission is refused
before the first bar (OS6023), so it needs a strategy that declares none.

## What the run produced

400 bars, 34 ledger rows, 17 trades and the summary of the run, all in
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
