# Profiling

By the end of this page you will be able to tell which part of a slow script is
actually costing the time, measure it rather than guess at it, and fix it with
the three changes that account for nearly all of the difference.

## The cost model in one paragraph

The file is the body of a per-bar loop. Every top-level statement runs once per
bar, on every bar of the dataset, so the total cost of a script is its per-bar
cost multiplied by the bar count. A study that takes a hundred microseconds per
bar takes five seconds over fifty thousand bars. That multiplication is the
whole subject: there is nothing in a script that runs once and is free, and
there is nothing you can put "outside the loop", because there is no outside.

Two consequences follow immediately, and most optimisation is one of them.

- **A line whose cost grows with the bar index turns a linear script into a
  quadratic one.** Fifty thousand bars each scanning fifty thousand bars is one
  and a quarter billion operations.
- **A line that recomputes from scratch what it could have carried forward pays
  the whole cost again on every bar**, when the honest cost of the update was
  one addition.

## What costs what

This is a model, not a benchmark. Engines differ in absolute speed and must not
differ in results, so treat the ordering as reliable and the ratios as rough.

| Work | Relative cost per bar | Notes |
|---|---|---|
| Reading a bar field (`close`, `high`, `time`) | Lowest | The engine fills these before the bar's code runs |
| Arithmetic, comparison, a ternary | Very low | Plain operations on binary64 |
| Reading history, `close[5]` | Very low | A register read, not a search |
| A stateful library call (`ema`, `rma`, `atr`) | Low, and constant | These carry their state forward: the length does not change their per-bar cost |
| A windowed library call (`sma`, `highest`, `stdev`) | Low, and specified | Already written as an incremental update where the definition allows it |
| A user function call | Low | One frame, one set of state slots per call site |
| A `for` loop of length `n` | `n` times the body | The body's cost is what matters, the loop itself is cheap |
| Building a string | Moderate | Concatenation allocates; doing it per bar for output shown once is waste |
| Creating or mutating a drawing object | Moderate, and it persists | The object lives until you delete it |
| A higher timeframe or other instrument read | Paid once per distinct request | The host fetches and aligns a whole second series |
| A loop whose length grows with `bar.index` | Ruinous | This is the quadratic case, and it is the bug this page exists for |

## Measuring, when the script cannot hold a stopwatch

**You cannot time yourself from inside a script, and this is deliberate.**
`chart.now()` is the chart's wall clock as the host supplies it, it is the only
clock reading available during a bar, and the conformance suite fixes its value
so that a script using it stays reproducible. A value that is fixed for
reproducibility is not a stopwatch. There is no other clock, and there is no
random source either, for the same reason.

So profiling in OpenScript measures **work**, not time, from the inside, and
measures time from the outside. Both are useful and they answer different
questions.

| Measurement | How | Tells you |
|---|---|---|
| Iterations per bar | Count them into a `var`, print on the last bar | Whether a loop is the problem, and by how much |
| Worst bar | Keep a running maximum of the per-bar count | Whether the cost is spread or concentrated |
| Call count | Count entries to a helper the same way | Whether a function runs more often than you thought |
| Live object count | `draw.count()` in a debug panel | Whether drawings are accumulating rather than being deleted |
| Distinct data requests | Count the `req.` lines by eye | Whether you are near the host's request ceiling (OS5006) |
| Wall clock for the whole run | The host reports it; OS5007 reports a bar that exceeded the host's per-bar budget | Whether the total is acceptable at all |

### Counting iterations

This is the measurement that settles most arguments. It costs five lines and
turns "the loop is probably fine" into a number.

```
version 1

study("Iteration count", precision = 0)

length = input(20, "Window", min = 2, max = 500)

var totalIterations = 0
var worstBar        = 0

perBar = 0
total  = 0.0

for i = 0 to length - 1
    perBar += 1
    total  += close[i]

totalIterations += perBar
if perBar > worstBar
    worstBar = perBar

if bar.isLast
    print("iterations in total " + text(totalIterations, 0) +
          ", worst single bar " + text(worstBar, 0) +
          ", bars " + text(bar.count, 0))

plot(total / length, "Mean", aqua)
```

Run it, read the log, then compare the worst bar against the per-bar loop budget
of 2,000,000 iterations. A script whose worst bar is in the thousands is fine. A
script whose worst bar is in the hundreds of thousands is doing something
structurally wrong even though it has not hit any limit, and the section below
is probably the reason.

Note what the budget does and does not protect you from. It stops a runaway loop
from freezing a tab. It does not stop a script from being slow: a loop that runs
fifty thousand times on the last bar is well inside the budget and is still
fifty thousand times more work than the one addition it should have been.

## The quadratic trap

This is the single most common cause of a slow script, and it always looks
reasonable on the day it is written.

```
// Before: the sum of every close since the start of the chart. On bar 40,000
// this loop runs 40,001 times, and it ran 39,999 times on the bar before.
total = 0.0
for i = 0 to bar.index
    total += close[i]

plot(total / bar.count, "Mean since the start", aqua)
```

Over fifty thousand bars that is more than a billion iterations, and on a server
it is what the per-bar time budget (OS5007) exists to catch. The fix is to carry
the answer forward instead of rebuilding it:

```
// After: one addition per bar, and the same number.
var total = 0.0
total += close

plot(total / bar.count, "Mean since the start", aqua)
```

The library has this shape ready made as `cum(src)`, which is a running total
from the first bar, and reaching for it is better still: a specified function
has a stated warmup and is covered by the conformance suite, and your
accumulator is not.

The general rule: **if a loop's length depends on `bar.index`, the value it
computes is almost certainly expressible as an update.** Ask what changed since
the previous bar. Usually exactly one value arrived and at most one left.

## Rolling windows: add one, drop one

The same idea applies to a fixed window, and here the saving is smaller but the
shape is worth knowing because it generalises to statistics the library does not
carry.

```
// Before: len additions per bar.
total = 0.0
for i = 0 to len - 1
    total += close[i]
mean = total / len
```

```
// After: two operations per bar, whatever len is. The value leaving the window
// is close[len], which is the bar just before the window's oldest bar.
var running = 0.0
running += close
if bar.index >= len
    running -= close[len]

// Absent until the window is full, so that the warmup matches what sma would
// produce rather than reporting a mean of however many bars have arrived.
mean = bar.index >= len - 1 ? running / len : none
```

Before you write that, check whether the library already has it. `sma`, `sum`,
`highest`, `lowest`, `stdev`, `median`, `percentile`, `correlation` and the rest
are specified with exact warmups and exact arithmetic, they are written once by
people who had the conformance suite in front of them, and a hand-rolled copy is
a second thing to test. Write the window by hand when the statistic is genuinely
not in `stdlib.md`, not to save a call.

There is one accuracy caution with a running total that a fresh sum does not
have: subtracting a value that was added thousands of bars ago accumulates
floating point drift, and two engines must agree to the last decimal. For a
window of a few hundred bars over a normal dataset this is not a practical
problem, but it is the reason the library's own windowed functions are specified
as an exact arithmetic recipe rather than as "the usual incremental trick".

## Loops inside loops

Nesting multiplies, and the multiplication is easy to underestimate.

| Shape | Iterations per bar | Over 50,000 bars |
|---|---|---|
| `for i = 0 to 19` | 20 | 1,000,000 |
| `for i = 0 to 19` inside `for j = 0 to 19` | 400 | 20,000,000 |
| `for i = 0 to 99` inside `for j = 0 to 99` | 10,000 | 500,000,000 |
| `for i = 0 to bar.index` | up to 50,000 | more than 1,000,000,000 |

Three things fix nearly every nested loop.

**Hoist what does not change.** Anything computed from an input, from a
`chart.` fact, or from this bar's values is the same on every iteration.

```
// Before: size(levels) is evaluated on every iteration of both loops, and the
// tick size is read every time as well.
for i = 0 to size(levels) - 1
    for j = 0 to size(levels) - 1
        gap = abs(element(levels, i) - element(levels, j)) / chart.tickSize

// After: both are read once per bar.
levelCount = size(levels)
tick       = chart.tickSize
for i = 0 to levelCount - 1
    for j = 0 to levelCount - 1
        gap = abs(element(levels, i) - element(levels, j)) / tick
```

**Leave early.** `break` exits the innermost loop and `continue` skips to the
next iteration. A scan that is looking for the first match should stop at it.

```
found = none
for i = 0 to size(prices) - 1
    if element(prices, i) > close
        found = i
        break
```

**Halve the work when the relationship is symmetric.** Comparing every pair once
rather than twice turns 400 iterations into 190.

```
for i = 0 to levelCount - 1
    for j = i + 1 to levelCount - 1
        // each pair visited once
```

## Do not compute the same thing twice

**Every call site is its own state.** Two identical calls in two places are two
independent state regions, computed independently, on every bar. This is the
rule that makes a stateful helper reusable, and it is also the rule that makes a
copy-pasted line cost double.

```
// Before: three call sites, three smoothing chains, three times the work.
plot(macd(close, 12, 26, 9)[0], "MACD", aqua)
plot(macd(close, 12, 26, 9)[1], "Signal", orange)
plot(macd(close, 12, 26, 9)[2], "Histogram", gray, style = "histogram")

// After: one call site, one chain, three reads of the array it returns.
m = macd(close, 12, 26, 9)
plot(m[0], "MACD", aqua)
plot(m[1], "Signal", orange)
plot(m[2], "Histogram", gray, style = "histogram")
```

This is exactly why a multi-output function returns an array rather than being
split into three named functions: three names would be three call sites and the
shared smoothing would be computed three times per bar.

The same applies with more force to data reads, where the cost is a whole second
series the host has to fetch and keep aligned with the chart:

```
// Before: three requests, one of them a duplicate, all counted against the
// host's ceiling (OS5006).
dayHigh  = req.timeframe("1D", high)
prevHigh = req.timeframe("1D", high)[1]
weekHigh = req.timeframe("1W", high)

// After: two requests, and the previous day comes from history.
dayHigh  = req.timeframe("1D", high)
prevHigh = dayHigh[1]
weekHigh = req.timeframe("1W", high)
```

## Only do newest-bar work on the newest bar

A panel shows one state, the current one. A summary drawing marks one place.
Writing either on all fifty thousand bars costs fifty thousand writes to display
the last one.

```
if bar.isLast
    cell(panel, 0, 1, text(close, 2))
    cell(panel, 1, 1, text(atrValue, 2))
```

The rollback rule makes this safe on a live chart: the newest bar re-executes on
every update and rewrites the same cells, and persistent values are restored
before each re-execution, so nothing accumulates.

Be careful about what you put behind that guard. Cells, labels and boxes that
only describe the present are fine. A **calculation** is not: a stateful call
inside a branch advances only on the bars the branch runs, which on
`bar.isLast` means one bar, and the result is absent everywhere else (OS8001).
Calculate unconditionally, display conditionally.

## Short-circuiting, and one trap in it

`and` and `or` evaluate their right operand only when it can change the answer,
so ordering a condition cheapest test first is free speed:

```
// The cheap flag is tested first, so the window scan only runs on the bars
// where it could matter.
if session.isOpen and highest(high, 200) > threshold
    signal("HIGH")
```

The trap: if the right operand holds a stateful call and it is not evaluated on
some bar, that call's state does not advance and its series is absent for that
bar. That is specified behaviour, not a hazard the engine will warn you out of
in every case, and it means **short-circuiting is a speed technique for pure
tests only**. Anything whose value you also plot, or whose state has to track
every bar, is computed at the top level first:

```
extreme = highest(high, 200)            // advances on every bar
if session.isOpen and extreme > threshold
    signal("HIGH")
plot(extreme, "200 bar high", aqua)
```

## Memory, briefly

Speed is usually the complaint, but memory is what ends a session badly, and
three things drive it.

**Retained history.** The engine retains a series register for a top-level name
only when the program actually reads that name's history, so most names cost one
slot rather than one value per bar. By default the retained depth is the whole
dataset. A host that sets a depth turns a too-deep read into OS4002 rather than
a plausible gap, and `limits(history = n)` is how a script asks for more.

**Arrays.** An array that is appended to on every bar and never trimmed grows
with the dataset until it hits the one million element ceiling (OS5002). Trim as
you push:

```
var window: array<number> = []
push(window, close)
if size(window) > 500
    shift(window)
```

**Drawing objects.** There is no cap on how many a script may create; the only
budget is memory, which is a deliberate difference from the platforms this
language exists to replace. That freedom is worth using carefully: delete a zone
when it is broken or stale, and keep `draw.count()` in a debug panel while you
develop.

**Strings.** Text appended to a persistent string on every bar is the one shape
that grows without bound by accident, and it ends at OS5008. Keep the pieces in
an array, trim it to the rows you display, and join only those.

## The order to work in

1. **Get it right first.** A faster script that computes a different number is
   not an optimisation, it is a regression with a good excuse. Have a value you
   trust before you change anything.
2. **Measure.** Count iterations, count calls, count objects. Two minutes of
   counting beats an hour of rewriting the wrong line.
3. **Fix the structure, not the details.** Almost every real improvement is one
   of three changes: delete a loop whose length grows with the bar index, carry
   a value forward instead of rebuilding it, or stop computing the same thing
   twice. Micro-editing an expression is rarely worth the diff.
4. **Re-measure, and check the numbers did not move.** Re-run whatever
   comparison told you the script was right, on the same fixed bars.
5. **Stop when it is fast enough.** A study that redraws in under a second on
   the dataset you actually use is finished, whatever the counters say.

## See also

- [limits.md](./limits.md) for the budgets, the errors they raise and how to raise them
- [debugging.md](./debugging.md) for the counting and printing techniques used here
- [testing.md](./testing.md) for proving an optimisation changed no numbers
- [style-guide.md](./style-guide.md) for the shapes that are slow and unreadable at once
- [publishing.md](./publishing.md) for what to say about a script's cost
- [../../spec/stdlib.md](../../spec/stdlib.md) for the functions that are already incremental
- [../../spec/compiled-program.md](../../spec/compiled-program.md) for what an engine actually executes
