# 0005 Bars arrive as one object per bar, and a long range cannot afford it

Status: closed 2026-09-24
Opened: 2026-09-20
Against: `src/core/engine/`, the `HostBar` record and `Engine.run`, `Engine.append`
and `Engine.update`
Also touches: `docs/integrating/running-the-engine.md`, which described the
surface that does not exist, and `spec/host-interface.md` section 3, which
describes the fields and is silent on the representation
Severity: no document contradicts the engine today; the shape decides whether a
browser backtest over a long range is possible at all, and it gets more expensive
to change with every consumer that builds on it

## What is wrong

Nothing is wrong with the engine today. What is open is a decision that was never
taken deliberately.

The engine takes one object per bar. `Engine.run` takes an array of records,
`Engine.append` and `Engine.update` take one record, and the record is the
`HostBar` of `spec/host-interface.md` section 3: `time`, `open`, `high`, `low`,
`close`, and optionally `volume` and `openInterest`.

`docs/integrating/running-the-engine.md` told an integrator the opposite. It said
to hand the engine columnar arrays, one per field, and argued the memory case over
two paragraphs. A consumer following that page wrote code that does not compile
against the library. The page has been corrected to describe the surface as it is,
which is why this issue exists: the argument the page made is sound, and correcting
the page must not lose it.

## The measurement the page carried

For nine hundred thousand bars, which is about ten years of one minute data:

| Representation | Memory |
|---|---|
| Columnar typed arrays | about 50 MB |
| One object per bar | about 144 MB, plus 900,000 objects of collector pressure |

Roughly three times the memory is the smaller half of it. The rest is one
allocation per bar, a cache miss on every field access because the fields of one
bar are adjacent and the same field of successive bars is not, and a garbage
collector doing major work partway through a run.

A columnar surface also changes what has to happen before the run. Most analytical
stores hold bars as columns at rest, so columns can travel as binary and become
typed array views with no parsing at all. The parse is where peak memory doubles,
because the text and the result are both held for as long as it takes. That cost
is paid before the engine is called and does not appear in the table above.

## Why this matters where it matters

A server is not affected at these sizes. 144 MB in a process that already holds a
history is a number nobody notices, and a long run there is a job in a subprocess
already.

A browser tab is the case. A decade of minute bars plus the chart's own copy plus
whatever the page holds is where a tab either runs the backtest or stops. The
claim in the corrected page is deliberately narrow: read this issue before
building a browser backtest over years of minute bars.

What is not measured yet, and should be before this closes:

- Peak memory of a real browser run, rather than the resident size of the bars.
  The table is arithmetic over field counts and object headers, not a reading.
- Whether the engine's own per-bar allocation dominates the host's bar records
  anyway, which would make the representation the smaller half of the problem.
- The cost of the conversion a host would do today: a host whose store is columnar
  builds nine hundred thousand records to call `run`, and that allocation is the
  one this issue is about, moved one layer out.

## The two resolutions, and they are not equal

**Change the documents.** Describe the surface as it is and record the memory case
here. Cheap, honest, and taken: the page is corrected and this issue holds the
numbers.

**Change the engine.** Add a columnar entry point beside the record one: a bar
source that reads `open[i]`, `high[i]` and the rest out of arrays the host owns,
with the record form kept for the live path where one bar arrives at a time and an
array of one is absurd. The bar cycle does not care where a field comes from, so
the change is at the door rather than through the engine, and `BarState` stays a
record because it is per bar and sparse.

The second is the one this issue exists to keep open. Deferring it is defensible
while nothing depends on the shape. It stops being defensible the moment a
backtest is built on the record form, because at that point the change is not an
added entry point, it is a migration of every consumer that reached for the one
that existed.

## How it closes

Either a columnar entry point lands beside the record one and the page describes
both, or the browser measurement above comes back saying the record form is not
what stops a long run, and this issue closes with that reading written down.

It does not close by the decision being made quietly in either direction.

## How it closed

The engine changed: a columnar entry point landed beside the record one, and the
page describes both.

`src/core/engine/bar-source.ts` is the door. `engine.run` takes either an array
of records or `{ time, open, high, low, close, volume?, oi? }`, each any
array-like of numbers, typed arrays included, and the bar cycle and the fold both
read through one small interface, `BarSource`, so nothing past the door knows
which form arrived. In a column `NaN` is absence as well as `null`, because a
typed array cannot hold `null`, and a `NaN` time is a bar with no time, refused
with OS6025 like a record with none. The number of bars is the length of `time`,
and a shorter column reads as absent past its end. A request's answer may arrive
as columns too. `append` and `update` keep the record form, for the reason this
file gave: a live bar arrives one at a time.

## The measurement this file asked for

Taken on this engine under the runtime the build uses, 900,000 one minute bars,
six fields each:

| | Records | Columns of doubles |
|---|---|---|
| Held at rest, heap and buffers after a collection | 104 MB | 43 MB |
| Peak during a run of `plot(sma(close, 20))` over all of them | 877 MB | 346 MB |
| Time for that run | 9.7 s | 5.0 s |

The resting figure is close to the table above: about two and a half times, not
three. The run is the half this file could not measure and it is the larger:
most of the peak in either form is the run's own per-bar results, and the
difference between the two is the collector walking nine hundred thousand
objects it can never free while the run holds them. So the record form was not
the smaller half of the problem, and the second question this file left open is
answered: the engine's own per-bar allocation is large, and it is the same in
both forms. That is not closed by this change and is not claimed to be.

Tests: `tests/engine/columns.test.ts` holds a study over records, plain columns
and typed columns giving the same columns bar for bar, `NaN` read as absence, a
short column, a `NaN` time refused, a live bar after a columnar run, and a
request answered in columns folding as its records do.
