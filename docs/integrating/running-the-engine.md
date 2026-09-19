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

## Bars: the decision that decides whether long ranges work

Hand the engine **columnar arrays**, one per field, not one object per bar.

For nine hundred thousand bars, which is about ten years of one minute data:

| Representation | Memory |
|---|---|
| Columnar typed arrays | about 50 MB |
| One object per bar | about 144 MB, plus 900,000 objects of collector pressure |

Three times the memory is the smaller half. The real cost is the allocation and
the cache misses on every access, and a garbage collector doing major work in the
middle of a run.

If your historical store is columnar, and most analytical stores are, the data is
already in the right shape at rest and can travel as binary columns that become
typed array views with no parsing at all. **The parse is the part that hurts**: it
is where peak memory doubles, because you hold the text and the result at once.
A JSON endpoint is the right shape for drawing a chart and the wrong shape for
feeding an engine, and those want to be two endpoints rather than one with a flag.

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
