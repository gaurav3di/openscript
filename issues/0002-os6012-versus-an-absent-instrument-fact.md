# 0002 OS6012 and an absent instrument fact cannot both describe one read

Status: closed 2026-09-24
Opened: 2026-09-20
Against: `spec/errors.md` OS6012 with `spec/errors.json` entry OS6012, and
`spec/stdlib.md` sections 3.4 and 8.1
Also touches: `spec/feature-matrix.md`, the row `chart/tick-and-lot` in section 16
and the row `math/round-to-tick` in section 17
Severity: one read has two documented behaviours, an error and an absent value,
and no rule says which happens

## What is wrong

`spec/stdlib.md` section 3.4 lists `chart.tickSize` as `number`, "the
instrument's smallest price increment, `none` when the host has not said", and
says in the paragraph under the table that it is `none` rather than a guessed
value when the host has not said. Section 8.1 builds on that: `roundToTick(price)`
returns `none` when `chart.tickSize` is absent, which is only a rule if the
absent read happened rather than stopped the bar.

`spec/errors.md` OS6012, "An instrument fact is not known", says the opposite of
the same read. Its message is "The host did not supply {fact} for {symbol}",
its `{fact}` placeholder is documented as tick size, lot size, session or
timezone, and its **Before** example is the bare read `qty = lots * chart.lotSize`.

Both cannot be true of one read. Either `chart.tickSize` on an instrument whose
tick size the host never stated is the absent value, and a script may test it
with `isNone` and carry on, or it is OS6012 and the bar stops, in which case
`roundToTick`'s absence rule can never be observed and section 3.4's "`none` when
the host has not said" describes a value no script can ever hold.

## Two of the twelve examples are already on opposite sides

`examples/10-strategy-ema-cross.oscript` line 36 states the absent reading in a
comment, "chart.lotSize is absent, not 1, when the host has not said what a lot
is", and line 40 depends on it: `max(orElse(chart.lotSize, 1), 1)` only means
anything if the read returns a value the script can test.

`examples/06-combined-premium.oscript` line 32 writes the bare read
`money = premium * lots * chart.lotSize`, which is the shape of OS6012's
**Before** block almost word for word, and the entry's **Fix** says to replace it
with an input. Neither example has been changed for this issue, because changing
one is choosing the answer.

## Why it matters

The two readings differ in what a correct script looks like. Under the first, a
script that sizes in lots guards the read and degrades; under the second, the
guard is dead code and the study simply does not run on that instrument. A host
deciding which to implement has no way to choose, and two engines that choose
differently both conform.

It also decides whether the feature matrix row `chart/tick-and-lot` in section 16
is one behaviour or two. That row currently states both halves, and the row
`math/round-to-tick` in section 17 rests on the absent reading alone, which is
why the disagreement is recorded in the matrix preamble and named here.

## What is already settled, and what this leaves

`spec/decisions.md` entry 6 settles where these facts come from: the host's
instrument record supplies ten facts, tick size and lot size among them, and each
supplied fact is absent when the host does not state it, except the volume flag.
That entry says explicitly that it makes no change to OS6012, because a fact a
call needs and cannot default is a different question from what a bare read
returns, and it records this tension rather than deciding it in passing. So the
source of the facts is decided and the behaviour of the read is not.

## Options

1. **OS6012 belongs to a call that cannot default the fact, never to a bare
   read.** A bare `chart.tickSize` is absent, as section 3.4 says, and OS6012 is
   raised by a call that has no way to proceed without the fact, such as a
   session or calendar call with no timezone. The entry's placeholder list and
   its **Before** example both change, because the example is a bare read.
   This is the reading that leaves every existing sentence of `stdlib.md`
   standing, and it is the one the decision record expects to be taken.
2. **A bare read of an unsupplied fact is OS6012.** Then section 3.4's "`none`
   when the host has not said" is wrong for tick size and lot size, and
   `roundToTick`'s absence rule loses one of its two causes. This buys an earlier
   and louder failure at the cost of a script that cannot degrade.
3. **Leave both and let a host choose.** Not proposed. It is the definition of a
   rule that is wrong: two conforming engines would run the same script to
   different ends on the same instrument.

Option 1 is recommended, and it is one edit to one catalogue entry in two files
plus the matrix row. It is written here rather than applied because the entry and
the row belong to different owners and the decision record reserved it.

## How it closed

Option 1, recorded as decision 66 in `spec/decisions.md`. A bare read of an
instrument fact the host did not state is absent and never OS6012; OS6012 is
raised only by something that cannot default the fact, which in version 1 is the
instrument record refused at load. The engine needed no change, because that is
what it already did: the catalogue entry, the page around it and the matrix row
were the only things on the other side.

The entry in both catalogue files now names what the record lacks, says in its
cause that a bare read is absent, and shows the host input that fails and the one
that passes, since the refusal is about a record rather than a script. The
matrix preamble paragraph that named this issue and the row `chart/tick-and-lot`
state one behaviour. `examples/06-combined-premium.oscript` keeps its bare read
and says, in a comment, that on a host with no lot size its money line is a gap.
`tests/engine/instrument-facts.test.ts` holds a bare read of both facts with
neither stated, answering `none` and stopping nothing.
