# Warmup

By the end of this page you will be able to say exactly how many bars any study
of yours needs before it can honestly draw anything, see that number on a chart
rather than guessing at it, and predict what the absent values at the left edge
do to every line downstream of them.

## Contents

1. [Why the left edge is empty](#1-why-the-left-edge-is-empty)
2. [There is no warmup phase](#2-there-is-no-warmup-phase)
3. [Warmup is a promise, stated per function](#3-warmup-is-a-promise-stated-per-function)
4. [Why some lengths cost one bar more](#4-why-some-lengths-cost-one-bar-more)
5. [Warmups compose, and the arithmetic is simple](#5-warmups-compose-and-the-arithmetic-is-simple)
6. [What an absent value does downstream](#6-what-an-absent-value-does-downstream)
7. [The shape where warmup changes an answer](#7-the-shape-where-warmup-changes-an-answer)
8. [Seeing how many bars a study needs](#8-seeing-how-many-bars-a-study-needs)
9. [How much history to load](#9-how-much-history-to-load)
10. [Filling in a warmup value, and when not to](#10-filling-in-a-warmup-value-and-when-not-to)
11. [Warmup in a strategy](#11-warmup-in-a-strategy)
12. [Warmups that are not bar counts](#12-warmups-that-are-not-bar-counts)

---

## 1. Why the left edge is empty

Add a twenty period average to a chart and the line does not start at the oldest
bar. It starts at the twentieth. Add a study built from three stacked
calculations and the gap at the left can be a hundred bars wide.

Nothing has gone wrong. A twenty period average of the first bar would have to
average twenty numbers, and nineteen of them do not exist. The language has one
answer for "there is no value here", it is the absent value, and a study at the
left edge of a chart is the most common place you will meet it.

```
version 1

study("Warmup", overlay = true, precision = 2)

e = ema(close, 20)      // absent on bars 0 to 18, a number from bar 19

plot(e, "EMA 20", aqua) // the line simply starts at bar 19
```

The important word is *simply*. There is no start-up mode, no flag to check, no
callback that fires when the study becomes ready. Absence travels through every
expression it enters and reaches the plot, where it draws a gap.

---

## 2. There is no warmup phase

A script runs on bar 0 exactly as it runs on bar 40,000. Every statement
executes, every branch is evaluated, every assignment happens. There is no bar
at which the study "starts for real".

What differs is only that some calls have nothing to return yet:

> **A function that needs `k` bars returns the absent value until `k` bars
> exist.** That is the whole of warmup, and it is expressed entirely through the
> absent value.

This is worth stating because the alternative designs are all in use somewhere
and all of them cost you something. A language that skipped the first `k` bars
would have to decide `k` for a script it has not finished reading. A language
that returned zero would draw a line at zero and call it data. A language that
returned the first available value repeated backwards would draw a flat shelf
that looks like a quiet market. Absence draws nothing, which is the only honest
picture of a measurement that was never taken.

---

## 3. Warmup is a promise, stated per function

Every entry in the standard library states the first bar it can produce a value
for, counting the oldest bar as 0. A warmup of "bar `n - 1`" means the call
returns the absent value on bars 0 to `n - 2` and a value from bar `n - 1`
onward, and that a conforming engine returns absence on exactly those bars and
no others.

Two engines that disagree about a single warmup bar fail the conformance suite.
That is the point of writing the lengths down rather than saying "after a
while": a study that matches a reference implementation on one engine and not on
another is exactly the failure this language exists to prevent.

A working selection, with the exact first bar:

| Call | First bar with a value |
|---|---|
| `sma(src, len)`, `ema(src, len)`, `rma(src, len)`, `wma(src, len)` | `len - 1` |
| `stdev(src, len)`, `variance(src, len)` | `len - 1` |
| `highest(src, len)`, `lowest(src, len)`, `sum(src, len)`, `count(cond, len)` | `len - 1` |
| `median`, `percentile`, `percentRank`, `correlation`, `covariance` | `len - 1` |
| `bollinger(src, len, mult)` | `len - 1`, every element |
| `atr(len)`, `natr(len)`, `cci(len)`, `cmf(len)` | `len - 1` |
| `donchian(len)` | `len - 1`, every element |
| `keltner(len, mult, atrLen, ...)` | `max(len, atrLen) - 1` |
| `change(src)`, `crossUp(a, b)`, `crossDown(a, b)`, `cross(a, b)` | bar 1 |
| `change(src, len)`, `mom(src, len)`, `roc(src, len)` | `len` |
| `rsi(src, len)`, `mfi(len)`, `chop(len)`, `hv(src, len)`, `aroon(len)` | `len` |
| `rising(src, len)`, `falling(src, len)` | `len` |
| `history(src, n)` | `n` |
| `pivotHigh(src, left, right)`, `pivotLow(src, left, right)` | `left + right` |
| `hma(src, len)` | `len + round(sqrt(len)) - 2` |
| `dema(src, len)` | `2 * len - 2` |
| `tema(src, len)` | `3 * len - 3` |
| `trix(src, len)` | `3 * len - 2` |
| `dpo(src, len)` | `len + floor(len / 2)` |
| `macd(src, fast, slow, signal)` | element 0 at `max(fast, slow) - 1`, elements 1 and 2 `signal - 1` bars after it |
| `adx(diLen, adxLen)` | elements 1 and 2 at `diLen`, element 0 at `diLen + adxLen - 1` |
| `supertrend(factor, atrLen)` | `atrLen` |
| `psar(...)`, `obv()`, `cum(src)`, `trueRange()` | bar 1, bar 0, bar 0, bar 0 |
| `barsSince(cond)`, `valueWhen(cond, src)` | the first bar the condition holds |
| `vwap(src)` | the session's first bar |

`stdlib.md` carries the whole catalogue, one row per call. When a number matters
to your script, read it there rather than estimating it; that is what the column
is for.

Three entries in that table deserve a note each.

**A multi-output call returns an array whose elements warm up separately.** The
array itself is never absent and never changes length; each element is absent
until it is reached. So `macd(close, 12, 26, 9)` gives you `m[0]` from bar 25 and
`m[1]` from bar 33, and `m[2]` from bar 33 as well. An array that grew as warmup
completed would make `m[1]` an out-of-range error on early bars, which would
break a script only at the left edge of a chart, which is the worst place for a
script to break.

**A `max` in a warmup is not decoration.** A call that subtracts one mean from
another has nothing to report until both means exist, so its first bar is
governed by the longer of the two lengths and not by the one the argument is
named after. Nothing stops a script from setting `fast` above `slow`, and when
it does, the reading starts at `fast - 1`. The defaults hide this, which is
exactly why the row states the `max` rather than the usual length.

**`trueRange()` on bar 0 is `high - low`.** The other two terms of its
definition need the previous close, which is absent there. This is the one
deliberate exception to absence propagation in the library, and it is written
down rather than left to the engine, because propagating would make `atr` start
one bar later than every reference implementation while adding nothing: a bar's
own range is a true statement about that bar.

---

## 4. Why some lengths cost one bar more

Look again at two rows of that table. `sma(close, 14)` is ready at bar 13, and
`rsi(close, 14)` is ready at bar 14. The difference is not a quirk.

An average of 14 values needs 14 bars, and bars 0 to 13 are 14 bars, so bar 13
is the first one. `rsi` averages 14 **changes**, and a change needs two bars, so
14 changes need 15 bars, and bar 14 is the first one.

Every entry in the library that consumes changes rather than levels carries the
same extra bar, and the warmup column states it rather than leaving you to work
it out. When you are counting a composition by hand, this is the step people get
wrong, so it is worth one moment of attention per calculation: does this
function read levels, or differences between levels?

---

## 5. Warmups compose, and the arithmetic is simple

A call whose source is absent on a bar is absent on that bar too. Warmups
therefore add, and the rule is:

> A stage whose own warmup is "bar `k`" pushes everything downstream `k` bars
> later.

Written as arithmetic: the first bar a chain can produce a value for is the sum
of each stage's first bar.

```
sma(ema(close, 10), 10)
// ema is first available at bar 9.
// sma needs 10 present values, which arrive on bars 9 to 18.
// First value: bar 9 + 9 = bar 18.
```

Here is a three stage study, with the count written where the next reader will
find it:

```
version 1

study("Stretch", precision = 2, range = [0, 100])

rsiLen  = input(14, "RSI length",   min = 2, max = 200)
smooth  = input(9,  "Smoothing",    min = 1, max = 100)
window  = input(50, "Extreme window", min = 2, max = 500)

// Warmup, stage by stage:
//   rsi(close, 14)        first value at bar 14
//   ema(..., 9)           plus 8   = bar 22
//   highest(..., 50)      plus 49  = bar 71
// This study is honest from bar 71, and draws nothing before it.
r        = rsi(close, rsiLen)
smoothed = ema(r, smooth)
peak     = highest(smoothed, window)
trough   = lowest(smoothed, window)

span    = peak - trough
stretch = span > 0 ? (smoothed - trough) / span * 100 : none

level(80, "High", fade(red, 50))
level(20, "Low", fade(lime, 50))
plot(stretch, "Stretch", purple, width = 2)
```

Three details in that script are warmup decisions:

- The lengths are inputs, so the warmup is not a constant. The comment states
  the arithmetic with the defaults, which is the useful thing to write down.
- `span > 0` guards the division. Division by zero produces absence rather than
  an error, so the guard is not strictly needed, but writing it says that a flat
  window is a known state rather than an accident.
- Nothing tries to fill in the first seventy bars. The pane is empty there, and
  that is the report.

One extra rule for a length that is itself a series: the warmup is measured
against the largest value the length has taken since the start of the dataset,
which is the only definition that does not require the engine to see the future.

---

## 6. What an absent value does downstream

Warmup is only interesting because of what absence does after it. Here is the
whole of it in one table.

| Where an absent value lands | What happens |
|---|---|
| `+`, `-`, `*`, `/`, unary `-` | The result is absent. `none * 0` is absent, not zero |
| String concatenation | Absent. `"a" + none` is absent; use `text(none)`, which is `"none"` |
| `<`, `<=`, `>`, `>=` | The result is absent, not false |
| `==`, `!=` | Never absent. `x == none` is the normal way to test |
| `and`, `or`, `not` | Three-valued logic, with absence meaning unknown |
| An `if`, `while` or ternary condition | The false branch is taken |
| A windowed library function | If any bar of the window is absent, that bar's result is absent |
| A function [../../spec/stdlib.md](../../spec/stdlib.md) section 2.4 names as ignoring absence, and only those | Absent bars are ignored |
| A plot | The line breaks. A fill stops. A level is not drawn |
| `barColor`, `background` | The bar keeps its own colour; nothing is painted |
| A table cell | The cell is blank |
| An order's price or quantity | The order is refused with OS7002, naming the argument |

The line in that table that repays the most thought is the comparison row.
During warmup, `a > b` and `a <= b` are **both** absent, so both are false as
conditions, and a script that branches on one and assumes the other is its
complement takes neither path. That is deliberate. Returning false from a
comparison with an absent operand would look convenient and would quietly break
the identity that `not (a > b)` equals `a <= b`, and it would break it at the
left edge of the chart, where nobody is looking.

Equality is the deliberate exception. `none == none` is true, `none == 5` is
false, and `isNone(x)` means the same thing as `x == none`. Without a total
equality there would be no way to ask the question at all.

---

## 7. The shape where warmup changes an answer

There is exactly one shape in which warmup silently changes a study's output
rather than leaving a visible gap, and the compiler warns about it:

```
var regime = "unknown"

// During warmup the comparison is absent, so neither branch runs, so regime
// keeps its old value. The study reports a regime it never computed.
if rsi(close, 14) > 50
    regime = "up"
else
    regime = "down"
```

Warning OS8004 fires on an `if` whose condition can be absent and whose block
assigns to a name used outside it, because the absorbing of absence at the
branch, which is otherwise safe, becomes invisible once a persistent value
carries the result forward.

**Not raised yet.** OS8004 is in the catalogue and nothing raises it: the
checker does not follow which names a branch on a possibly absent condition
assigns.

Make the absent case explicit and the problem disappears:

```
r = rsi(close, 14)              // one call site, computed every bar

var regime = "unknown"
if not isNone(r)
    regime = r > 50 ? "up" : "down"
```

Now a reader can see that "unknown" means warmup. The same fix applies whenever
a warmup-absent value feeds a branch that sets something durable: a stop level,
a position flag, a session high.

---

## 8. Seeing how many bars a study needs

Three ways, in increasing order of certainty.

**Count it from the catalogue.** Add each stage's first bar, remembering that
functions consuming changes cost one extra. This is fast, it is exact, and it is
the only method that works before you have any data.

**Watch the chart.** Scroll to the oldest bar. The first bar where each column
starts is its warmup, and a column that never starts is a study whose warmup is
longer than the history you loaded.

**Probe it.** Put the answer on the chart. This costs six lines and removes all
doubt, particularly for a study whose lengths are inputs:

```
version 1

study("Warmup probe", precision = 2)

// The value whose warmup you want to know.
value = ema(rsi(close, 14), 9)

// The first bar on which it existed. isNone guards the assignment so this
// records the first bar only, and an absent firstBar means "not yet".
var firstBar = none
if isNone(firstBar) and not isNone(value)
    firstBar = bar.index

t = table("Warmup", 4, 2, position = "topRight")
cell(t, 0, 0, "bars loaded")
cell(t, 0, 1, text(bar.count))
cell(t, 1, 0, "first value at bar")
cell(t, 1, 1, isNone(firstBar) ? "not yet" : text(firstBar))
cell(t, 2, 0, "present in last 100")
cell(t, 2, 1, text(countPresent(value, 100)))
cell(t, 3, 0, "has a value now")
cell(t, 3, 1, text(not isNone(value)))

plot(value, "Value", aqua, width = 2)
```

For the composition above, that table reads "first value at bar 22", which is
14 plus 8, and matches the arithmetic of section 5.

Two notes on the probe. `countPresent(value, 100)` has a warmup of its own, bar
99, so its cell reads "none" until a hundred bars have loaded; `text(none)` is
the string `"none"`, which is the reason that cell is not blank. And the `var`
holding `firstBar` records a bar index, which is fine here because it is only
ever displayed within one run: a bar index is not safe to store across a reload,
since loading older history renumbers every bar.

A one line variant, when you want the number as a series rather than in a table:

```
readyFor = barsSince(not isNone(value))      // bars since it first had a value
firstBar = bar.index - readyFor              // the index it started at
```

---

## 9. How much history to load

Two numbers matter, and they add:

```
bars to load = the study's warmup + the bars you actually want to look at
```

A study with a warmup of 71 bars, on a chart where you want to see the last 500
bars of behaviour, needs at least 571 bars in the dataset. Load exactly 71 and
the study draws a single point.

Then load a margin beyond that, and here is the honest reason why. A recursive
average is seeded at a stated bar of the dataset it was given: `ema(src, n)` is
seeded on bar `n - 1` with the simple average of those `n` values, and `rma`
states its own seeding the same way. That seeding is exact and specified, so two
engines agree to the last decimal on the same data. It also means the seed sits
at a different moment in market history when you load a longer dataset, and the
values afterwards, while they converge quickly, are not bit-identical to the
ones from a shorter load.

Two practical consequences:

- Load a comfortable margin of history beyond the warmup, so the recursive
  averages have long since converged over the region you are actually reading.
- Pin the data range of anything you intend to compare. A backtest run over a
  fixed range, from a stored script revision, reproduces months later. The same
  backtest run over "whatever history the chart had open" does not, and the
  difference will be small enough to look like noise and large enough to change
  a marginal trade.

---

## 10. Filling in a warmup value, and when not to

`orElse(x, fallback)` substitutes a value where one is absent. It is the right
tool roughly half the time.

**Right:** a display default, where the substitute is clearly a label rather
than a measurement.

```
version 1

study("Reading, or waiting", precision = 2, range = [0, 100])

r = rsi(close, 14)

t = table("RSI", 1, 2, position = "topRight")
cell(t, 0, 0, "RSI")
cell(t, 0, 1, isNone(r) ? "warming up" : text(r, 1))

// Shade the pane while the study has nothing to say.
background(isNone(r) ? fade(gray, 90) : none)

plot(r, "RSI", purple, width = 2)
```

**Right:** seeding a persistent value on its first bar, where without the
fallback the value would stay absent forever. This is the idiom from the
trailing stop example:

```
var band = none
prevBand = band
band = max(rawBand, orElse(prevBand, rawBand))
```

**Wrong:** feeding a substitute into a decision, where it manufactures a signal
that the data never produced.

```
r = rsi(close, 14)

// Wrong. During warmup orElse hands crossUp an exact 50 on every bar, so the
// first real reading above 50 reports a crossing up from a number that was
// invented by this line.
if crossUp(orElse(r, 50), 50)
    signal("UP")

// Right. During warmup the comparison inside crossUp is absent, the condition
// is absent, the branch is not taken, and no marker is drawn. The first signal
// is the first real one.
if crossUp(r, 50)
    signal("UP")
```

The rule that covers both cases: **substitute for something a person will read,
never for something the script will act on.** A fabricated number that reaches a
decision is indistinguishable, afterwards, from a real one.

---

## 11. Warmup in a strategy

A strategy meets warmup at the worst possible moment, because an order made from
absent inputs is not a drawing that can simply be skipped.

The language is loud about it on purpose: **an order function given an absent
price or an absent quantity does not place a malformed order and does not
silently substitute a value. It rejects with OS7002, naming the argument that
was absent.** An order is the one place where doing nothing quietly is worse
than stopping loudly.

So a strategy should reach the order line only when its inputs exist:

```
version 1

strategy("Sized by volatility", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "units",
         fillOn = "nextOpen", slippage = 1)

atrLen     = input(14,   "ATR length", min = 1, max = 200)
stopMult   = input(2.0,  "Stop, in ATR", min = 0.2, max = 20)
riskAmount = input(5000, "Amount risked per trade", min = 1)

fast = ema(close, 9)
slow = ema(close, 21)
atrValue = atr(atrLen)

// Absent for the first 13 bars, so the distance and the size are absent too.
stopDistance = stopMult * atrValue
rawUnits     = stopDistance > 0 ? riskAmount / stopDistance : none
orderQty     = isNone(rawUnits) ? none : floor(rawUnits)

// The guard is the point. Without it the strategy would reach buy() during
// warmup and be refused with OS7002 on every one of those bars.
canSize = not isNone(orderQty) and orderQty > 0

if crossUp(fast, slow) and pos.size == 0 and canSize
    buy(qty = orderQty)

if crossDown(fast, slow) and pos.size > 0
    close()

plot(fast, "Fast", aqua, width = 2)
plot(slow, "Slow", orange, width = 2)
```

Note that `crossUp(fast, slow)` is itself absent during warmup, so in this
particular script the guard is belt and braces. Write it anyway: the day someone
replaces the entry condition with one that is true on bar 0, the guard is what
stands between the change and a run of refused orders.

The sizing helpers follow the same principle. `order.qtyForRisk(risk, entry,
stop)` returns absence when entry and stop are equal, rather than raising,
because that is a real state during warmup, and the order function that receives
the absent quantity refuses it by name.

---

## 12. Warmups that are not bar counts

A few warmups are stated as a condition rather than a number, and they are worth
recognising because no arithmetic will give you a bar index for them.

| Call | Warmup |
|---|---|
| `vwap(src)` | The session's first bar. It restarts every session |
| `vwapAnchor(src, resetWhen)` | The first bar the condition is true |
| `barsSince(cond)`, `valueWhen(cond, src)` | The first bar the condition is true, which may be never |
| `req.timeframe(tf, expr)` with the default mode | The first bar after a higher timeframe bar has closed |
| `req.symbol(...)` | The above, plus whenever the host answers |
| `session.startTime`, `session.endTime` (both planned) | The session's first bar |

Three consequences:

**`barsSince` and `valueWhen` are absent, not zero, before the condition has
ever held.** Zero would read as "it happened on this bar", which is the opposite
of the truth.

**A higher timeframe read on a fresh chart is absent for a while, and that
while is measured in coarse bars.** A daily read on a five minute chart is
absent until the first daily bar in the dataset has closed, which can be
hundreds of fine bars. `req.isReady(read)` answers whether the host has replied
at all, and `req.error(read)` carries the reason a read failed.

**A session anchored value restarts.** It is not warming up once; it warms up
every session, and a study built on `vwap` at the first bar of a session is
reporting a single bar's worth of information. Say so on the chart if a reader
might mistake it for a settled average.

---

## See also

- [execution-model.md](./execution-model.md) for why there is no start-up phase
  to hook into
- [bars-and-history.md](./bars-and-history.md) for the other source of absence
  at the left edge
- [persistence.md](./persistence.md) for the warmup bugs that a `var` turns into
  permanent ones
- [realtime-and-confirmation.md](./realtime-and-confirmation.md) for the right
  hand edge, where the last bar is still moving
- [absent-values.md](./absent-values.md) for absence everywhere else it appears
- [../troubleshooting.md](../troubleshooting.md) for a study that draws nothing
  at all
- [../README.md](../README.md) for the rest of the documentation
- [../../spec/stdlib.md](../../spec/stdlib.md) for every function's exact warmup
