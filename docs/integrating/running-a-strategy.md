# Running a strategy on the second engine

For a platform engineer with a server that has to run a compiled program: load
it once, push bars at it one at a time, take the order calls out and fold the
destination's answers back in.

By the end of this page you will know what the engine is handed and what it will
never be handed, what one execution takes and what comes back, what a bar that is
still moving costs you if you get it wrong, how orders leave and how frames
return, and what this surface deliberately does not do for you.

The surface is `engine/openscript/run.py`. Everything below was read off it and
off the tests beside it rather than designed here.
[`the-python-engine.md`](./the-python-engine.md) is the engine itself: what is in
the directory, how it is tested, and what refuses a piece of Python that would
break it.

---

## What the engine is handed

**A compiled program, and never a script.** There is no compiler in `engine/`
and there is not meant to be one.

That is the reason this engine exists at all. A production container can be
Python only, the compiler is written in another language, and nothing that speaks
that language survives into the image. A sidecar in a second language is not a
worse option there, it is not an option. What makes the arrangement work is that
the compiled program is plain data: it can be produced anywhere and read
anywhere.

So for a host whose server cannot run the compiler, the whole of the consequence
is this: **the program is compiled where the compiler runs and stored as data.**
Compile in the editor, or in a build step, or in a request to whatever service
holds the compiler; take the canonical text it emits, store it keyed by its hash,
and hand that text to this engine. A compiled program is kilobytes and it is
cacheable, so this costs one compile per saved revision rather than one per run.

There is no fallback. A run whose program text is missing cannot start, because
there is nothing here that could produce one.

## Loading

```python
from openscript.run import load, load_text
```

`load_text(text, settings, library, limits, capabilities, read_time)` is the text
boundary: it reads the canonical encoding and then does everything `load` does.
`load(raw, ...)` takes a program object built in the same process, which was
never text and has nothing to be canonical about.

Both return a `LoadResult`, which carries `.run`, `.diagnostic` and the property
`.ok`. One of the two is always `None`. There is no partly loaded run.

The arguments, in order:

| Argument | What it is |
|---|---|
| `text` or `raw` | The canonical text, or the program object |
| `settings` | The stored input values, by input key. `{}` or `None` runs the defaults |
| `library` | The library seam, below. `None` is a library with nothing in it |
| `limits` | `budget.EngineLimits`. `budget.DEFAULT_LIMITS` unless you have a reason |
| `capabilities` | The feature tags this run serves, from `verify.capabilities(...)` |
| `read_time` | How a written date becomes an instant, for a `time` input |

**The text has to be the canonical encoding**, not text that merely parses to the
same program. The hash a host records a run against is taken over those bytes, so
another spelling is text that hash does not name, and the load refuses it
(`OS6018`). That check is the point of the text boundary, and it is why an engine
handed an object it built itself is making a weaker claim than one handed bytes.

**The library is a seam and not an import.** The machine asks a library for a
manifest at load and for a call during a bar, and `contracts.Library` is the whole
of what it asks. The functions themselves are in `engine/openscript/library/`, in
two tables, and the join between those tables and the protocol is `Serving`, in
`engine/openscript/adapter/serving.py`. That is worth saying plainly rather than
smoothing over: **the join a host needs today lives in the adapter package**,
beside the conformance adapter, so a host wiring a library imports it from there.
It is one import, and the module's own note says that the day something in the
package carries the join, one import changes and nothing else does.

**Capabilities are what this run serves**, and a program tagged with something
missing from the list is refused by name rather than run with a hole in it.
`capabilities()` is the machine's own tags; `capabilities("orders")` adds the tag
a program that places orders carries.

`read_time` matters only to a program with a `time` input. `inputs.utc_time`
reads a written date as if it were UTC, which is what a host that has not
supplied a reader for the chart's own timezone gets.

### What a failed load looks like

```python
loaded = load_text(text, settings, library, capabilities=capabilities("orders"))
if not loaded.ok:
    refused = loaded.diagnostic
    raise SystemExit(f"{refused.code} at {refused.line}:{refused.column}")
run = loaded.run
```

A `Diagnostic` carries `.code`, `.line`, `.column`, `.severity` and `.values`,
and no message text at all. The wording lives in
[`spec/errors.json`](../../spec/errors.json), which is the catalogue and the
authority, so a host that wants a sentence looks the code up there and a host
comparing two engines compares the code and the position. Three refusals worth
recognising, each observed rather than guessed at:

| What happened | Code |
|---|---|
| The program calls a function this engine's manifest does not hold | `OS6004` |
| The text is not the canonical encoding of what it parses to | `OS6018` |
| A stored setting the input will not take | `OS6019` |

**Four codes say "this engine does not have that" rather than "your program is
wrong"**, and each carries the refused thing by name: `OS6006` a capability tag,
`OS6004` a library function, `OS6016` a compiled format version, `OS6017` a
language version. A host deciding whether to fall back to another engine reads
those four differently from the rest, which is what the conformance adapter does
with them in `engine/openscript/adapter/running.py`.

## The bar cycle

```python
result = run.execute_bar(index, bar, state, supplied=None, instrument=None, now=ABSENT)
```

One call is one execution of one bar: the eleven steps of
[`spec/compiled-program.md`](../../spec/compiled-program.md) section 5.1, in
order, every time.

| Argument | What it means |
|---|---|
| `index` | Which bar, counting from zero. **The same index twice is a re-execution of that bar, not a new one** |
| `bar` | `contracts.Bar(time, open, high, low, close, volume, oi)`. `time` is milliseconds since the epoch, UTC. An absent price is absence, never a zero and never carried forward |
| `state` | `contracts.BarState(is_new, is_confirmed, is_realtime, updates)`: the four facts only the side that built the bar knows |
| `supplied` | How many bars the host has supplied. It decides `bar.isLast` and nothing else |
| `instrument` | The host's instrument record, as a mapping. The `chart` namespace and the tick rounding read it |
| `now` | The fixed value of the clock, which `chart.now` answers. Absent unless the host states one |

Three of those decide more than they look like they do.

**`is_confirmed` decides whether the bar's deferred effects happen at all.** Step
9 applies the order calls, the markers and the alerts only on a bar the engine
decided, which is a confirmed bar or a program that asked for unconfirmed ones. A
condition that was true halfway through a moving bar and false when it closed
places no order.

**`is_realtime` is what separates a bar of history from the bar in front of you**,
and no engine can derive it. Adding a study to a chart that already holds history
fires no alerts for those bars. An engine handed `False` throughout raises none,
which is the right answer for a backtest and the wrong one for a live runner that
never sets it.

**`supplied` left off means every bar is the last.** With no value the engine
takes it as `index + 1`, so `bar.isLast` is true on every execution, which is what
a live feed wants: its newest bar always is the last one it has. A run over a
dataset whose size is known passes the total instead, and then only the final bar
is last.

### What comes back

A `BarResult`:

| Field | What it holds |
|---|---|
| `.index` | The bar this was |
| `.columns` | One value per channel, by channel index. A channel nothing wrote is absent |
| `.applied_channels` | The deferred channel indexes step 9 applied, and empty where it discarded them |
| `.applied` | The order calls a decided bar left behind, in the order the bar made them |
| `.alerts` | `Alert(key, title, message, bar, time)`, raised only on a realtime bar |
| `.diagnostic` | What stopped the bar, or `None`. `.ok` is the property to read |

`.columns` and `.applied_channels` are two halves of one thing, and the
difference between them is what a moving bar may do. Step 8 publishes every
channel, so a drawing is in `.columns` either way. Step 9 decides the marker and
the alert, so on an undecided bar `.applied_channels` is empty and the host draws
the line without committing the marker.

`.applied` holds `PendingEffect`s, each with `.name`, `.arguments` and
`.position`. They are records and not calls: an order function leaves a record
and pushes absence, and applying it is the host's next step rather than something
that happened during the bar.

**A bar that failed stops there.** Steps 7 to 11 do not run, `.columns` is
whatever the previous execution published or empty, `.applied`,
`.applied_channels` and `.alerts` are empty, and `.diagnostic` says what happened
with a code and a position. The engine does not carry a half executed state into
the next bar, and it does not let the failure out as an exception: a host drawing
many studies in one loop gets a diagnostic about one script and nothing else. The
run is still loaded afterwards, so whether a failed bar ends the run is the
host's decision. The conformance adapter stops at the first one.

### One thing to do before every execution

If you wired `Serving` as the library, call `at_bar` first:

```python
library.at_bar(
    {"high": bar.high, "low": bar.low, "close": bar.close,
     "previousClose": previous_close, "volume": bar.volume,
     "isSessionFirst": index == 0},
    index == 0,
)
```

Those six facts are what a bar-reading library call needs and what the call
context does not carry. A fact the host does not state is absent rather than read
from somewhere else, which is honest and quiet: a study built on it would draw an
empty line and nothing would say why. This is the one place in the surface where
a forgotten line produces a study that runs and is wrong.

## The bar that is still moving

This is the part a live host gets wrong, so it is the part written out longest.

A bar that has not closed is executed again every time its price changes, and the
later execution has to produce what the first would have produced had the bar
arrived at that price once. The engine makes that true for you, on one condition:
**you pass the same index.**

Step 1 of the cycle records the state at the start of bar `i` on the first
execution of it and restores that record on every later execution of the same
index. Nothing is copied for a bar that is executed once, so the cost is paid
only where it buys something.

Give each tick a new index instead and the engine has no way to know: you have
not re-executed a bar, you have appended a history of bars that never existed.
Every stateful call sees each tick as another bar, the history operator shifts
under the script, warmup finishes early, and the study on a trader's chart stops
being the study a backtest of the same script computes. Nothing raises. That is
why it is written down here rather than left to be discovered.

`live var` is the one exception, by design: a live cell is written into the
checkpoint and is not rolled back, and a script using one is not reproducible.

### checkpoint and restore

The same machinery is exposed for a re-execution the engine cannot see coming: a
chart replay, a debugger stepping backwards, a bar run again after the feed
corrected it.

```python
mark = run.checkpoint()          # before executing bar k
...                              # bars k, k + 1, k + 2 executed
run.restore(mark)                # everything goes back
result = run.execute_bar(k, bar, state, supplied=total)
```

`checkpoint()` with no argument records a mark whose bar number matches no index
the engine will ever execute, so a mark a caller is holding for its own reasons
never collides with the engine's own rollback. `restore` puts back every cell,
every state region and the heap under both in one mechanical copy, so two cells
that held one array still hold one array afterwards; it truncates the series
registers to their recorded lengths, and it leaves live cells holding what they
have now.

`engine/tests/test_bar_cycle.py` states the invariant as a test rather than as a
sentence: restoring the mark from before bar `k` and executing bar `k` again
gives the same columns and the same state, on an engine that has already run
every bar after it.

## Orders, and the frames that come back

Nothing in this engine reaches a destination. It states what the strategy
decided; the host makes the order, and the engine learns nothing about where it
went.

The pieces are in `engine/openscript/strategy/`: `Ledger` is the run's own record
and the one way a frame gets in, `Intents` is every intent the run placed in
order, `OrderIntent` is what crosses to the host and `OrderFrame` is what comes
back. `engine/openscript/adapter/ordering.py` is the worked reference: its `Desk`
is one strategy's ledger, intents and fills driven over a run, and `Desk.fold`,
`Desk.deliver_after` and `Desk.apply` are the moments below.

**The order of the moments between two bars is the contract**, not a driver's
choice. `spec/host-interface.md` section 7.4:

1. Deliver what the destination sent after the last bar: `ledger.deliver(frame)`,
   once per frame.
2. Fold them: `ledger.settle()`.
3. Execute the bar.
4. Place what the bar decided, from `result.applied`.

A driver that folded after the bar would let a script react within the bar its own
order was sent in. One that folded during the bar would give two executions of a
moving bar two different positions to read. Both are the same failure seen from
different sides, and the boundary is where they stop being possible.

Step 4 is a loop over the records:

```python
appended = len(ledger.rows())
for effect in result.applied:
    placed = ledger.place(effect.name, effect.arguments,
                          IntentBar(index=index, time=bar.time), effect.position)
    if placed.refusal is not None:
        ledger.discard(appended)
        break
    intents.record(placed.intents)
    send(placed.intents)
```

`place` returns a `PlacedCall` carrying either `.intents` or `.refusal`. A
refusal is a diagnostic with a code and a position, and it takes back every row
the bar appended, which is what `discard` is for: every call of a bar is mapped
before any of it is routed, so a refusal partway through would otherwise leave a
row no destination was ever handed.

An `OrderIntent` carries `.intent_id`, `.kind`, `.side`, `.qty`, `.qty_type`,
`.order_type`, `.tag`, `.instrument`, `.product` and `.bar`. `spec/host-interface.md`
section 7.1 is the authority on what each of those may say, including the kinds an
intent asks a destination for. The quantity is stated in the unit its `qty_type`
names rather than converted: a lot is the venue's own fact and symbology is the
host's, so an engine multiplying by a lot size nobody stated would send a quantity
nobody asked for.

An `OrderFrame` carries `.intent_id`, `.status`, `.filled_qty`,
`.avg_fill_price`, `.order_ref`, `.time` and `.text`. **It is cumulative**: every
frame restates the whole life of one order rather than what changed since the
last one, which is what makes a repeat, a pair that crossed in flight and a
reconnecting session that resends its last frames all harmless.

Two more things a strategy run needs.

**The position a script reads is the fills**, so the library seam is built with
the ledger behind it: `Serving(ledger)`. Without a book it serves no `pos` entry
and no order call, and a program that places an order is then refused at load
naming the function rather than running as a study that quietly trades nothing.

**The ledger is sized from the declaration**, which has to be read through the
run rather than off the program, because a declaration may state its quantity or
its capital from an input and a ledger handed the reference rather than the value
would size every order from a shape:

```python
declared = {name: run.declaration(("meta", "strategy", name))
            for name in ("qty", "qtyType", "product", "pyramiding", "capital")}
```

`adapter/ordering.py`'s `options_for` turns that, plus the instrument record,
into the `LedgerOptions` the ledger is given before bar zero.

What a run made is not the ledger's. `engine/openscript/accounting/` folds the
charges, the trades and the summary from the fills after the fact, so a stored
record can be reported again with no engine present.

## A worked example

One program, four closed bars and one that is still moving. This is a complete
file, and it runs against any compiled program with the package on the import
path.

```python
"""Driving one compiled program over a few bars."""

import pathlib

from openscript.adapter.serving import Serving
from openscript.contracts import Bar, BarState
from openscript.run import load_text
from openscript.verify import capabilities

CLOSED = BarState(is_new=True, is_confirmed=True, is_realtime=False, updates=1.0)
MOVING = BarState(is_new=False, is_confirmed=False, is_realtime=True, updates=1.0)
INSTRUMENT = {"symbol": "AAA", "exchange": "XX", "timezone": "UTC", "tickSize": 0.05}

# The canonical text your compiler emitted, stored as data. Nothing here compiles.
text = pathlib.Path("program.json").read_text(encoding="utf-8")

library = Serving()
loaded = load_text(text, {"len": 2}, library, capabilities=capabilities())
if not loaded.ok:
    refused = loaded.diagnostic
    raise SystemExit(f"{refused.code} at {refused.line}:{refused.column}")
run = loaded.run

closes = [100.0, 102.0, 101.0, 105.0]
previous = None
for index, close in enumerate(closes):
    bar = Bar(time=float(index) * 60000.0, open=close, high=close, low=close, close=close)
    library.at_bar(
        {"high": bar.high, "low": bar.low, "close": bar.close,
         "previousClose": previous, "volume": bar.volume,
         "isSessionFirst": index == 0},
        index == 0,
    )
    result = run.execute_bar(index, bar, CLOSED, supplied=len(closes), instrument=INSTRUMENT)
    if not result.ok:
        raise SystemExit(f"bar {index}: {result.diagnostic.code}")
    print(index, result.columns, result.applied_channels)
    previous = close

# The newest bar, twice, at the same index. The engine rolls the state back
# between the two; the host does nothing but pass the same index again.
for close in (106.0, 104.0):
    bar = Bar(time=4.0 * 60000.0, open=close, high=close, low=close, close=close)
    library.at_bar(
        {"high": close, "low": close, "close": close, "previousClose": previous,
         "volume": bar.volume, "isSessionFirst": False},
        False,
    )
    result = run.execute_bar(4, bar, MOVING, supplied=5, instrument=INSTRUMENT)
    print("moving", close, result.columns, result.applied_channels)
```

Run it with the two bar mean of `spec/compiled-program.md` section 12 as
`program.json` and the moving bar prints `105.5` and then `104.5`. **Take that
program through `canonicalise` first.** Section 12 prints its program laid out
over several lines so a reader can follow it, and `load_text` is handed the
canonical encoding and nothing else, so the block copied as it is printed is
refused with OS6018 before the first bar. `openscript.canonical.canonicalise`
turns the parsed object back into the one text the loader accepts:

```python
import json
from openscript.canonical import canonicalise

canonical = canonicalise(json.load(open("program-as-printed.json")))
open("program.json", "w", encoding="utf-8").write(canonical)
```

That is not a quirk of the example. It is the rule a host lives under: the
program a host stores and sends is the canonical text, because the hash a run is
recorded against was taken over exactly those bytes. The second number
is the answer, and it is the mean of 105 and 104 rather than of 106 and 104,
which is the rollback doing its job. `applied_channels` is empty on both of those
executions and not on the four before them, because a bar nobody has confirmed
commits no marker.

## What this surface does not give a host

Said plainly, because a page that overstates its reach costs its first reader
more than one that states a small reach truthfully. All of the following are
yours.

**No scheduling.** Nothing here calls `execute_bar`. When a run starts, when it
stops, and what an exchange calendar says about today are none of them in the
engine, and the engine has no clock of its own. `now` is a value the host states,
which is part of what makes a run reproducible.

**No process isolation.** A `Run` is an object in your process. The engine will
not let a script's failure escape as an exception, it builds no code out of text,
and its budget stops a runaway loop. But a run occupies the worker it is on until
it returns, so one strategy per process, and what happens when one of them dies,
are decisions on your side.

**No persistence.** A `Run` holds its state in memory and writes nothing. A
checkpoint is an in-process object for re-executing a bar and not a saved run:
nothing here stores one and reads it back. A process that restarts loads the
program again and executes the bars again from the beginning.

**No data feed and no history.** Bars exist because you supply them, one at a
time, in order. The engine derives `bar.index`, `bar.count`, `bar.isFirst` and
`bar.isLast` from what it has been given and asks for nothing more.

**No destination.** An intent leaves through the host and a frame arrives through
`Ledger.deliver`, which is the only way in. Nothing here knows what a broker is,
and a symbol is carried and handed back unparsed.

**No compiler**, which is the whole of the first section.

**No chart.** The engine publishes channels; turning them into a drawing is the
host's, and a case asserting a surface this engine does not answer is reported
unsupported rather than answered emptily.
