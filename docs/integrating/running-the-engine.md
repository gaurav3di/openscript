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
  "oi": null
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

- **The engine cannot build code out of text.** Scoped precisely below, because
  the sentence is usually said too widely and then it is not true.
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

## The first guarantee, at its real size

The first one is what the other four lean on, so here is exactly what it says
and exactly what enforces it.

**The code we ship cannot reach a code generator.** Every door to one is a
module: the runtime's virtual machine, a worker, a child process, a debugger
channel. Nothing in the package imports a module from the runtime's own
namespace, so none of those doors is in the graph at all. This is not a pattern
that might be spelled around. The module is not there, and a check refuses to
let one in: `scripts/check-layering.mjs` reads every source file, refuses any
import of that namespace at either spelling, and refuses any load whose
specifier is not written down. It runs on every build, it has enforced this
since before the first source file existed, and it is attacked with a corpus of
forms before it reads a file.

**The two names that remain are refused by a switch you turn on.** With the
modules out of reach, what is left is the string evaluator and the function
builder, which need no import. Server-side runtimes have a switch that refuses
both for a whole process:

```
--disallow-code-generation-from-strings
```

Start the process that runs the engine with it. Both then throw wherever they
are called, whoever wrote the code and however the name was spelled, because the
switch turns off the runtime's own permission to compile text rather than
looking for a name. We run our entire test suite under it.

**This is worth more than any promise in this document.** A sentence here
describes what we intended. The check and the switch are the thing refusing, and
they keep refusing after an upgrade you did not read the changelog for, and
after a dependency you did not choose to add.

## What that switch does not do, measured

Said plainly, because it is usually claimed wider than it is. In a process
started with the switch, every one of these still ran when we measured it:

- text run in a new context, a function compiled from source, a script object
  built and run, all from the runtime's virtual machine module
- a module imported from a data URL, whose body is source text
- a module assembled out of bytes
- a child process, handed source text on its command line

So the switch is not "code generation is off". It is two names, in one process.
That is enough for our engine, because our engine cannot import any of the
modules in that list. It is not enough for code that can.

## What is yours to do

Five things, and none of them are difficult. The first three are the guarantee
above holding in your process rather than in ours.

1. **Set the switch on the process that runs the engine**, and on the ones it
   starts. A child process gets its own settings. The environment variable your
   runtime reads its options from is inherited by every descendant and a flag on
   a command line is not, so set both if you fork. Set it as a whole option, not
   inside a longer value: a runtime reads that variable as a list of options,
   and a value that merely contains the switch's spelling sets nothing.
2. **Keep the modules in that list away from anything that evaluates a user's
   text.** That is your code, not ours, and the switch will not do it for you.
3. **Serve a worker as a file, not as a blob.** A content security policy that
   allows scripts from your own origin refuses a worker built from a blob URL.
   Our engine needs nothing added to your policy, and `unsafe-eval` is not
   required for any part of it.
4. **Do not hand the compiler or the engine anything but bars and a program.**
   Both are pure data. Neither reads your filesystem, your network or your
   clock.
5. **Treat a compiled program as data you may cache**, keyed by a hash, and
   recompile only when the script changes.

In a browser the first two are already answered: a content security policy
without `unsafe-eval` refuses the same two names, and a tab has no virtual
machine module, no child process and no worker that evaluates text. The engine
is built to run under such a policy as it stands.

## When to stop reading this page

If you cannot or will not run our engine in your hot path, go to
[your-own-engine.md](./your-own-engine.md). It is more work and it is a fully
specified amount of work, which is the difference that matters.
