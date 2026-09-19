# Testing

By the end of this page you will be able to prove that a script computes what
you think it computes, on the bars you think it computes it, and to decide
honestly whether a strategy is ready to be given money.

## Why a chart script needs this more than most code

A script is short, so it feels like it cannot hide much. It can. Four properties
of the per-bar model make a wrong script look right.

- **It runs fifty thousand times.** A bug that fires on one bar in a thousand
  fires fifty times, and every one of them is off the edge of the screen.
- **Warmup is invisible.** The bars where a value is absent are at the left of
  the chart, where nobody scrolls, and a fallback of zero looks like data.
- **The newest bar behaves differently from every other bar.** It re-executes on
  every update, and it is the only bar you ever watch.
- **The failure is money.** A study that is slightly wrong is a nuisance. A
  strategy that is slightly wrong is a position.

Testing here means four separate checks, each of which catches a different one
of those. Do all four before you trust a number, and the fifth section before
you trust an order.

## 1. Check a value against a hand calculation

Pick one bar, print the inputs to a line, do the arithmetic yourself, and
compare. This is the only check that establishes the value is right at all;
everything else establishes that it is right in the same way everywhere.

You can demand exactness when you do this, because the language does. All
arithmetic is binary64 with round-to-nearest-even, in the order the source
writes it; an engine may not reassociate, may not fuse a multiply and an add,
and may not use extended precision registers. `round` takes halves away from
zero. Iteration order over an array is index order. There is no randomness and
no clock reading during a bar. Two engines that disagree on a last decimal fail
the conformance suite, so a disagreement between your arithmetic and the
script's is a real disagreement.

```
version 1

// A probe, not a study. It exists to be run once against three bars you can
// read off the chart, and then deleted.

study("Hand check, simple mean of three", precision = 8)

checkAt = input(-1, "Check this bar index, -1 for none")

mean = sma(close, 3)

// Written out for exactly three terms on purpose. A probe with a loop in it is
// a second implementation of the thing under test, with its own bugs, and then
// two wrong answers can agree.
if bar.index == checkAt
    byHand = (close + close[1] + close[2]) / 3
    print("bar " + text(bar.index, 0) +
          " at " + date.format(time, "yyyy-MM-dd HH:mm"))
    print("closes " + text(close[2], 8) + " " +
                      text(close[1], 8) + " " +
                      text(close, 8))
    print("library " + text(mean, 8))
    print("by hand " + text(byHand, 8))
    print("difference " + text(mean - byHand, 12))

plot(mean, "Mean of three", aqua)
```

Check three bars, not one: one early bar just after warmup completes, one bar in
the middle, and one bar on a session boundary or a gap. Those are the three
places the arithmetic differs for different reasons.

When your arithmetic and the script disagree, work out which is wrong before
changing anything. The usual causes, in order of how often they are the answer:
an off-by-one in a lookback (`close[len]` against `close[len - 1]`), a window
that includes the current bar where you assumed it did not, a population against
a sample divisor in a deviation, and the difference between the remainder
operator `%`, whose sign follows the left operand, and `mod`, which always
carries the right operand's sign.

## 2. Check the warmup

**Warmup is a promise, not a hint.** A warmup of "bar `n - 1`" means the call
returns `none` on bars `0` to `n - 2` and a value from bar `n - 1` onward, on
every conforming engine, with no bar of slack. That makes it testable, and a
warmup that is one bar out is a genuine defect rather than a rounding of the
truth.

The probe is five lines and works for any value.

```
version 1

study("Warmup probe", precision = 4)

length = input(14, "Length", min = 2, max = 200)

value = rsi(close, length)

// The first bar the value exists on. isNone(firstBar) keeps it at the first
// one: without that guard this records the most recent bar with a value, which
// is a different and much less useful number.
var firstBar = none
if isNone(firstBar) and not isNone(value)
    firstBar = bar.index

panel = table("Warmup", 3, 2, position = "topLeft", textColor = silver)

if bar.isLast
    cell(panel, 0, 0, "first bar with a value")
    cell(panel, 0, 1, isNone(firstBar) ? "never" : text(firstBar, 0))
    cell(panel, 1, 0, "documented warmup")
    cell(panel, 1, 1, text(length, 0))          // rsi is bar len
    cell(panel, 2, 0, "bars in the dataset")
    cell(panel, 2, 1, text(bar.count, 0))

plot(value, "RSI", purple)
```

Compare the first cell against the warmup column in
[`../../spec/stdlib.md`](../../spec/stdlib.md). The ones worth memorising:

| Call | First bar with a value | Why it is not what you guessed |
|---|---|---|
| `sma(src, len)`, `ema(src, len)`, `highest(src, len)`, `stdev(src, len)` | `len - 1` | `len` values exist once bar `len - 1` has arrived |
| `rsi(src, len)` | `len` | It consumes `len` changes, and a change needs two bars |
| `change(src)`, `crossUp(a, b)` | bar 1 | Both read the previous bar |
| `mom(src, len)`, `roc(src, len)` | `len` | The same extra bar, for the same reason |
| `macd(src, fast, slow, signal)` | element 0 at `slow - 1`, elements 1 and 2 at `slow + signal - 2` | The signal line is a mean of a mean |
| `atr(len)` | `len - 1` | `trueRange()` on bar 0 is `high - low`, the one deliberate exception to absence propagation |
| `barsSince(cond)`, `valueWhen(cond, src)` | The first bar the condition is true | Absent, not zero, before that: zero would read as "it happened on this bar" |
| `sma(ema(close, 10), 10)` | bar 18 | Warmups compose, because an absent source makes an absent result |

Two mistakes this probe catches that nothing else does. A value that is absent
for ever, because a stateful call sits inside a branch that never runs (OS8001).
And a value that starts one bar too early, which is the signature of a lookahead
in a hand-written calculation.

## 3. Check the behaviour on the forming bar

The newest bar of a live chart is executed again on every update. Before each
re-execution the engine restores every persistent value, including the contents
of arrays, to what it held at the end of the previous bar. **The effect is that
executing the moving bar twice gives the same answer as executing it once.** A
script is idempotent in the bar unless it deliberately says otherwise.

Test that your script actually is. The probe counts both things at once.

```
version 1

study("Forming bar probe", precision = 0)

// An ordinary var rolls back, so it counts bars.
var barsSeen = 0
barsSeen += 1

// A live var does not roll back, so it counts executions. The compiler emits
// OS8011 on this line, saying that live and backtest now differ. That is the
// warning working: here the difference is the measurement.
live var executions = 0
executions += 1

panel = table("Moving bar", 4, 2, position = "bottomRight", textColor = silver)

if bar.isLast
    cell(panel, 0, 0, "bars counted, var")
    cell(panel, 0, 1, text(barsSeen, 0))
    cell(panel, 1, 0, "executions counted, live var")
    cell(panel, 1, 1, text(executions, 0))
    cell(panel, 2, 0, "bar.updates")
    cell(panel, 2, 1, text(bar.updates, 0))
    cell(panel, 3, 0, "this bar is confirmed")
    cell(panel, 3, 1, bar.isConfirmed ? "yes" : "no")

plot(barsSeen, "Bars", aqua)
```

On history the two counters agree. On a live chart, `barsSeen` keeps counting
bars while `executions` climbs with the ticks. If a counter in your own script
behaves like `executions` when you meant it to behave like `barsSeen`, you have
either used `live var`, or accumulated into something that is not persistent at
all, and the chart and the backtest of the same data will disagree.

The other half of the forming bar is what a script is allowed to do on it.
Signals, alerts and orders do not fire on a bar that is still moving unless the
declaration sets `onUnconfirmed = true`; they are deferred until the bar is
confirmed, and if the condition is no longer true by then they never happen at
all. Test this deliberately before you rely on it: a strategy that fires on the
close of a bar in a backtest and on a mid-bar touch in production is not the
same strategy.

## 4. Fix the bars, so a result is reproducible

Everything above assumes the data holds still. Make it hold still: a test on a
live feed is an anecdote.

The project's own conformance suite is the model to copy, and its shape is
worth stealing for your own scripts. One case is one directory, and **every byte
of input lives in the directory**: a case never names a symbol and expects a
runner to fetch it, never reads a date range from anywhere, never opens a
network connection and never reads the wall clock.

```
cases/
  my-bands/
    warmup/
      case.json
      script.os
      bars.csv
      expected.csv
      settings.json
      notes.md
```

| File | Holds |
|---|---|
| `case.json` | What the case asserts, the language version it pins, any tolerance |
| `script.os` | The source text |
| `bars.csv` | The bars, oldest first, with a header row |
| `expected.csv` | One column per asserted output, one row per bar |
| `settings.json` | Values for the script's inputs; absent means every input takes its default |
| `ticks.csv` | Intrabar updates, for a case that tests the moving bar |
| `notes.md` | Why the case exists and what it is defending against |

```json
{
  "id": "my-bands/warmup",
  "category": "semantics",
  "languageVersion": 1,
  "description": "The upper band is absent until bar 19 and present from bar 19.",
  "asserts": ["values"],
  "tolerance": { "abs": 0, "rel": 0 }
}
```

Three things in that file do real work. **`languageVersion` is pinned**, so the
case is compiled the same way for ever rather than by whichever front end is
newest. **`asserts` names only the channels this case checks**, so a change to
drawings cannot break a case about warmup, and the failure that does appear
points at the thing that actually changed. **`tolerance` defaults to exact**,
because engines that disagree on a decimal have a defect rather than a rounding
difference.

If the script reads a clock, the case fixes it: `now` is a field in `case.json`
and is required whenever `chart.now()` is called.

Two identifiers make a result reproducible months later, and a host records
both: the hash of the source text, and the hash of the compiled program. A
chart, a backtest run and a live process each pin the revision they started
with, which is why editing a script never silently changes a study already on a
chart.

Your own habit can be much lighter than the suite and still get most of the
value: keep a folder per script holding the bars you tested against, the
settings you used, and the output you hand-checked. Re-run it after every edit.
The first time it catches a change you did not intend, it has paid for itself.

## 5. Compare two implementations

When you replace a calculation, whether for speed or for clarity, the test is
not that the new one looks right. It is that the two produce the same numbers on
every bar, and that when they do not, you know the first bar where they part
company. That is the first-offender pattern in
[debugging.md](./debugging.md#narrowing-a-wrong-number-to-the-bar-it-first-goes-wrong-on),
and it is the standard way to check any optimisation.

Keep the old calculation in the file, plot the difference, run it, and only then
delete the old one.

```
mine      = myFasterVersion(close, 20)
reference = sma(close, 20)

comparable = not isNone(mine) and not isNone(reference)
plot(comparable ? mine - reference : none, "Difference", fuchsia, scale = "left")
```

A difference plot that is a flat line at zero across the whole dataset is a
stronger statement than any number of spot checks, and it takes one bar of
looking.

## Before you trust a strategy with money

Studies mislead. Strategies cost. Work down this list, and treat any row you
cannot answer as a no.

### The numbers

| Check | How |
|---|---|
| The calculation matches a hand calculation on three bars | Section 1 |
| Every warmup matches the documented one | Section 2 |
| The script is idempotent in the bar | Section 3 |
| The result is reproducible from fixed bars and fixed settings | Section 4 |
| No warning is outstanding | Compile it and read them: OS8001, OS8004, OS8009, OS8011, OS8014 and OS8015 each describe a shape that is nearly always a bug |

### The honesty

| Check | Why it matters |
|---|---|
| No higher timeframe read is in `"lookahead"` mode | That mode reads a higher timeframe bar's final value from its first lower timeframe bar. It repaints on history, permanently and by design |
| A `"developing"` read is guarded, or accepted knowingly | It includes the higher timeframe bar currently forming, so a signal taken from it can be withdrawn |
| `onUnconfirmed` is not set, or every use is guarded by `bar.isConfirmed` | An unconfirmed bar reading a coarse bar is where repainting comes from |
| `fillOn` is `"nextOpen"` | A decision made from a bar's close cannot be filled at that same close in the real market, and a backtest whose default is optimistic is a backtest that lies |
| Every pivot's lag is accounted for | `pivotHigh` and `pivotLow` report `right` bars after the pivot formed, because that is the first bar on which the pivot is knowable |
| No persistent value holds a bar index | Loading more history renumbers every bar (OS8014) |

### The cost model

| Check | Why |
|---|---|
| `slippage` is set to something you would actually pay | It defaults to zero, which is nobody's market |
| `commission` and `commissionType` match your broker | A strategy with many small trades lives or dies here |
| `qtyType` and `qty` mean what you think | `"units"`, `"lots"`, `"cash"` and `"equityPercent"` are four different position sizes |
| The result survives doubling the costs | If it does not, the edge was the cost model |

### The robustness

| Check | Why |
|---|---|
| It still works on neighbouring input values | A result that exists only at length 14 and vanishes at 13 and 15 is a coincidence you have fitted |
| It works on bars you did not look at while building it | Hold some out from the start, and do not peek at them twice |
| It works on more than one instrument, or you know why it does not | A rule that only works on one symbol is a claim about that symbol |
| The trade count is large enough to mean anything | Three good trades is a story, not a result |
| The worst losing run is one you could sit through | The number that ends most strategies is the drawdown, not the expectancy |

### The operations

| Check | Why |
|---|---|
| It is flat when you expect it to be | Test `closeOnSessionEnd` and any clock exit on a real session end |
| It behaves on a day with a gap, a halt, or a missing bar | Absence propagates to the plot as a gap; make sure it propagates to your decisions as "do nothing" |
| It has run on paper, on live bars, for long enough to see every branch | Paper first is the default for a reason |
| You know what it does when a data read fails | `req.isReady` and `req.error` exist so a script can say "not yet" instead of guessing |

## What testing does not cover

The conformance suite tests the compiler's diagnostics and the engines' output.
It deliberately does not test speed, memory, the look of a chart, or the wording
of a diagnostic message. Those matter, and they are not what a test fixes: for
the first two see [profiling.md](./profiling.md) and
[limits.md](./limits.md).

And no test says whether a strategy is a good idea. It says whether the script
does what you told it to. Keeping those two apart is most of the discipline.

## See also

- [debugging.md](./debugging.md) for finding the bar a failing test is about
- [profiling.md](./profiling.md) for checking that a faster version is still correct
- [limits.md](./limits.md) for the budgets a test run has to stay inside
- [style-guide.md](./style-guide.md) for writing scripts that are easy to test
- [publishing.md](./publishing.md) for what to state about testing when you share a script
- [../../spec/conformance.md](../../spec/conformance.md) for the case format copied here
- [../../spec/stdlib.md](../../spec/stdlib.md) for every documented warmup
