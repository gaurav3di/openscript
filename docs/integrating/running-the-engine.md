# Running the engine we ship

The quickest route: install the package, implement the host interface, and your
traders have a language. By the end of this page you will know what to build,
what the engine will not do for you, and the three constraints that decide the
shape of the work.

---

## The shape of it

A script becomes a **compiled program**, which is plain data: a list of
instructions and a description of what it declares. The engine walks that list,
once per bar.

```
script text  ->  compiled program (data)  ->  engine  ->  values, and orders
```

Compiling and running are separate and can happen in different places. That is
worth knowing before you design anything, because it decides where your costs
land.

## Compile in the browser. It is free.

Studies on a chart run on the viewer's machine. A million people plotting
indicators costs your servers nothing beyond the page you already serve, because
the compile takes milliseconds in the tab and the engine runs there.

The same is true of a backtest over bars already loaded on a chart.

**Your servers only carry two things**: strategies running live while nobody is
watching, and backtests over ranges too long to ship to a browser. Both are a
small fraction of what your users do.

## Three constraints that shape the server side

Learned the expensive way, and they will apply to you too.

**A compiled program is small and cacheable.** Compile once, store the result
keyed by a hash, run it anywhere. Do not recompile per run.

**Computation must not share a thread with request handling.** An engine pass
over a long history is pure computation with no pause in it. In a cooperatively
scheduled worker it stops everything for everyone until it finishes. Run it in a
separate process. A thread pool may not help, depending on your runtime: check
whether your pool threads are real.

**A long run is a job, not a request.** Any proxy in front of you has a read
timeout, and a backtest over years of minute bars will exceed it. Start the run,
return an identifier, report progress on a channel you already keep open.

## Bars: one object per bar, and what that costs

The engine takes **one object per bar**, not columnar arrays. This is the whole
of the surface:

```text
load(program, options)      ->  { ok: true, engine } or { ok: false, diagnostic }
engine.run(bars, states)    ->  { bars: results, diagnostic }
engine.append(bar, state)   ->  one result, for a bar that has closed
engine.update(bar, state)   ->  one result, re-executing the newest bar
```

`bars` is an array of records, oldest first, and one record is:

```json
{
  "time": 1700000000000,
  "open": 101.5,
  "high": 102.25,
  "low": 101,
  "close": 102,
  "volume": 18400,
  "openInterest": null
}
```

`time` is the bar's open instant in whole milliseconds since the Unix epoch, UTC.
A price the feed does not have is `null`, never carried forward and never zero,
and a volume nobody stated is `null` rather than `0`, because a quiet bar and an
unknown one are different facts. The engine derives `hl2`, `hlc3`, `ohlc4` and
`hlcc4` itself, and a host must not supply them. Every field, what may be absent
and what the engine refuses, is in
[`spec/host-interface.md`](../../spec/host-interface.md) section 3.

`run` takes the whole history in one call. `append` adds a bar that has closed,
and `update` hands the newest bar back with new values, which the engine
re-executes from the checkpoint at the start of that bar, so a moving bar updated
ten times gives the same answer as one that arrived once.

**This representation costs memory at long ranges, and the cost is known.** One
object per bar is around three times the memory of columnar typed arrays over a
decade of one minute data, and it allocates one object per bar for the collector
to walk. Whether that decides against a long backtest inside a browser tab, and
what a columnar surface would have to look like instead, is measured and left
open in
[`issues/0005-bars-arrive-one-object-per-bar.md`](../../issues/0005-bars-arrive-one-object-per-bar.md).
Read it before you build a browser backtest over years of minute bars. On a
server, at the sizes that issue describes, it decides nothing.

Two things worth doing whichever way that goes:

- **Do not hold the parse and the result at once.** Peak memory doubles where a
  response is parsed into one shape and then copied into another. Build the bar
  records the engine takes directly from the response and keep one copy.
- **Keep the drawing endpoint and the engine endpoint apart.** A payload shaped
  for a chart is rarely the one shaped for a run, and a single endpoint with a
  flag on it becomes both badly.

## What the engine will not do for you

It is deliberately ignorant, and that is what lets it run anywhere:

- **It does not fetch anything.** No network, no filesystem, no clock beyond what
  you hand it.
- **It does not know your symbology.** See the note on opaque symbols in the
  [overview](./README.md).
- **It does not price your costs.** It defines the shape of a cost model; the
  numbers are yours, because a language that hardcoded one market's charges would
  be useless in another.
- **It does not render.** You get values and declared outputs; drawing is yours.

## What it does guarantee

- **No `eval`, no generated code.** It walks data, so it runs under a strict
  content security policy with nothing for a security team to approve.
- **A script cannot reach anything.** It can only do what the instruction set
  exposes. No network, no filesystem, no access to the object graph of the
  process it runs in. There is nothing to escape from, because nothing was ever
  handed over.
- **A runaway script stops.** Instruction, memory and wall clock budgets are
  counters in the loop the engine owns, not hopes about behaviour.
- **One script failing takes nothing else down.**
- **Determinism.** The same program on the same bars gives the same numbers,
  every run, everywhere. This is a contract, not an aspiration: see
  [`spec/compiled-program.md`](../../spec/compiled-program.md) section 8.

Those five are why a platform can run many customers' scripts in one process,
which is the thing an `eval` based design cannot offer at any price.

## When to stop reading this page

If you cannot or will not run our engine in your hot path, go to
[your-own-engine.md](./your-own-engine.md). It is more work and it is a fully
specified amount of work, which is the difference that matters.
