# Realtime and confirmation

By the end of this page you will be able to say, for any line of your script,
whether it is reading a finished fact or a number that is still moving, write a
signal that cannot be withdrawn after you have acted on it, and know why a chart
of history shows exactly what it would have shown at the time.

## Contents

1. [The newest bar is not finished](#1-the-newest-bar-is-not-finished)
2. [What moves, and what is already settled](#2-what-moves-and-what-is-already-settled)
3. [The bar is executed again, and rolls back first](#3-the-bar-is-executed-again-and-rolls-back-first)
4. [Why a condition can be true and then false on the same bar](#4-why-a-condition-can-be-true-and-then-false-on-the-same-bar)
5. [What the default protects you from](#5-what-the-default-protects-you-from)
6. [Three ways to act only on a confirmed bar](#6-three-ways-to-act-only-on-a-confirmed-bar)
7. [Opting in with `onUnconfirmed`](#7-opting-in-with-onunconfirmed)
8. [Alerts and how often they fire](#8-alerts-and-how-often-they-fire)
9. [Drawing on a bar that is still moving](#9-drawing-on-a-bar-that-is-still-moving)
10. [How a replay reconstructs the past exactly](#10-how-a-replay-reconstructs-the-past-exactly)
11. [The three things that break replay, and how to see them](#11-the-three-things-that-break-replay-and-how-to-see-them)
12. [A checklist before you trade a script](#12-a-checklist-before-you-trade-a-script)

---

## 1. The newest bar is not finished

Every bar on a chart except one is a finished fact. Its open, high, low, close
and volume will never change again. The exception is the newest bar, and on a
live chart it is being rewritten continuously: a trade prints, and the bar's
close becomes that price; another prints higher than anything before it, and the
bar's high moves.

OpenScript handles that by re-running the script:

> The newest bar of a live chart is executed again on every update: every tick,
> or every time the host pushes a new snapshot of it.

So a script that runs five thousand times over a five thousand bar history then
runs a six thousandth time, and a six thousand and first time, and so on, all on
bar 4999, until the interval elapses and bar 5000 appears.

`bar.updates` counts those executions for the current bar, starting at 1. The
rest of the `bar` namespace tells you where you are:

| Name | True when |
|---|---|
| `bar.isConfirmed` | This bar's interval has elapsed and it will not change again |
| `bar.isRealtime` | A live feed is driving updates, rather than a one-off history load |
| `bar.isNew` | The last update appended a bar rather than replacing one |
| `bar.isLast` | This is the newest bar in the dataset |
| `bar.updates` | How many times this bar has been executed |

`bar.isConfirmed` is true for every historical bar, and for the newest bar once
its interval has elapsed. It is the flag a script uses to refuse to act on a bar
that is still moving.

---

## 2. What moves, and what is already settled

On the bar being formed:

| Value | On the forming bar |
|---|---|
| `open` | Fixed at the first trade of the interval |
| `high` | Can only rise |
| `low` | Can only fall |
| `close` | The last traded price, so it moves in both directions |
| `volume` | Grows |
| `time` | Fixed: it is the bar's opening instant |
| `close[1]`, `high[1]`, anything older | Fixed, and will never change |
| `bar.index`, `bar.count` | Fixed for this bar |
| `bar.updates` | Rises with each execution |

That table is the whole hazard in one grid. A condition built from `close` is a
question about a number that moves. The same condition built from `close[1]` is
a question about a number that is finished.

```
// Moves during the bar, and its answer can be withdrawn.
breakingOut = close > highest(high, 20)[1]

// Settled: it is a statement about the bar that closed.
brokeOut = close[1] > highest(high, 20)[2]
```

Neither is wrong. They answer different questions, and a script should know
which one it is asking.

---

## 3. The bar is executed again, and rolls back first

Re-running a script on the same bar would double every accumulation, so the
engine does not simply re-run it:

> **The rollback rule.** Before each re-execution of a bar, the engine restores
> every persistent value to what it held at the end of the last execution of the
> **previous** bar.

Persistent values means `var` cells, the contents of arrays those cells hold,
the state of stateful library calls such as `ema` and `cum`, and the set of
objects the `draw` namespace has created. Every region an engine holds is
required to be snapshottable by a mechanical copy, precisely so that this rule
can be applied to all of them at once.

The effect is that executing the moving bar twice gives the same answer as
executing it once. The script is idempotent in the bar:

```
version 1

study("Rollback", precision = 0)

var bars = 0
bars = bars + 1

plot(bars, "Bars")     // counts bars, not ticks, even on a live chart
```

Without that rule the counter would climb by one per tick, and the same script
would produce different numbers on a live chart than in a backtest of the same
data. `live var` opts out of rollback, for the one case where counting updates
is the actual measurement; [persistence.md](./persistence.md) covers it.

What a script **may** do on a still-moving bar: everything computational. Read
values, compute, plot, draw, colour bars, write a table, read `bar.isConfirmed`
and branch on it. All of it is recomputed from scratch on each update, so
nothing accumulates.

---

## 4. Why a condition can be true and then false on the same bar

Take a fast average crossing a slow one on a five minute chart. The averages are
computed from `close`, and on the forming bar `close` is the last traded price.

Here is one bar, executed four times. The fast average starts the bar below the
slow one:

| Time | `bar.updates` | `close` | fast | slow | `crossUp(fast, slow)` |
|---|---|---|---|---|---|
| 10:05:12 | 1 | 101.10 | 101.02 | 101.05 | false |
| 10:06:40 | 2 | 101.45 | 101.11 | 101.06 | **true** |
| 10:08:03 | 3 | 101.30 | 101.09 | 101.07 | false |
| 10:09:58 | 4 | 101.55 | 101.14 | 101.08 | **true** |
| 10:10:00 | close | 101.55 | 101.14 | 101.08 | **true**, and final |

The condition was true, then false, then true again, within one bar. Nothing is
broken: each row is a correct answer about the data as it stood at that instant,
and the rollback rule means row 3 is not computed on top of row 2. It is
computed from the previous bar's state, exactly as row 2 was.

This is the single most important fact about live scripts, and it has a name
worth using: a condition on the forming bar is **provisional**. Acting on a
provisional condition means acting on something that may never have been true
when the bar finished.

If that cross had been an order, you would have bought at 10:06:40 and, at
10:08:03, held a position justified by a crossing that no longer existed.

---

## 5. What the default protects you from

OpenScript's default is that you cannot make that mistake by accident:

> **A script may not emit a `signal`, fire an `alert`, or place, modify or
> cancel an order on a bar that is still moving.** Those calls are deferred
> until the bar is confirmed, and if the condition that produced them is no
> longer true when the bar closes, they never happen at all.

Applied to the table above: the marker and the order are held. At 10:08:03 the
condition is false and the held call is dropped. At 10:09:58 it is true again
and held again. At 10:10:00 the bar closes with the condition true, and one
signal fires, once.

```
version 1

strategy("Confirmed only", overlay = true, precision = 2)

fast = ema(close, 9)
slow = ema(close, 21)

// No guard needed. The order is placed when the bar closes, and only if the
// crossing is still there.
if crossUp(fast, slow)
    buy(qty = 1)

if crossDown(fast, slow)
    close()

plot(fast, "Fast", aqua, width = 2)
plot(slow, "Slow", orange, width = 2)
```

The fill then follows the declaration's `fillOn` option, which defaults to
`"nextOpen"` rather than `"close"`, because a decision made from a bar's close
cannot be filled at that same close in the real market. A backtest whose default
is optimistic is a backtest that lies.

---

## 6. Three ways to act only on a confirmed bar

**Do nothing, and let the default work.** This is right for the large majority
of scripts. The deferral is not a delay you are paying for: the bar had to close
before the answer was final, and the language is simply not pretending
otherwise.

**Guard with `bar.isConfirmed`.** Needed when the file has opted into
unconfirmed action, and useful whenever a script does something the engine does
not defer for you, such as writing to a table or mutating a drawing:

```
if crossUp(fast, slow) and bar.isConfirmed
    signal("BUY")
```

**Ask about the previous bar instead.** This shifts the whole question one bar
back, so every input to it is already finished. The cost is one bar of lag, paid
visibly:

```
version 1

study("Acting a bar late", overlay = true, precision = 2)

fast = ema(close, 9)
slow = ema(close, 21)

// crossUp on the previous bar: every value it reads is settled, so this is
// true on exactly one bar and stays true for that bar's whole life.
crossed = orElse(crossUp(fast, slow)[1], false)

if crossed
    signal("BUY, confirmed")

plot(fast, "Fast", aqua, width = 2)
plot(slow, "Slow", orange, width = 2)
```

Note the `orElse`. On bar 0 there is no previous bar, so `crossUp(...)[1]` is
absent, and although an absent condition takes the false branch anyway, saying
so makes the script readable and lets the value be combined with `and` and `or`
without spreading absence through the expression.

| Approach | Acts on | Lag | Use when |
|---|---|---|---|
| The default deferral | The bar that just closed | None beyond the close | Almost always |
| `bar.isConfirmed` guard | The bar that just closed | None beyond the close | The file sets `onUnconfirmed` |
| `cond[1]` | The bar before the one that just closed | One bar | The decision needs inputs that were themselves settled a bar ago |

---

## 7. Opting in with `onUnconfirmed`

A study or strategy can act on a moving bar, by saying so in the declaration:

```
strategy("Intrabar", onUnconfirmed = true)

// The engine no longer holds the order, so the script guards it itself.
if crossUp(fast, slow) and bar.isConfirmed
    buy(qty = 1)
```

Three things change the moment that option is set, and you should want all three
before you set it:

- Signals, alerts and orders fire on every execution of the moving bar where
  their condition holds, so a flickering condition produces a flickering order
  unless the script guards it.
- The compiler emits warning OS8002 on any higher timeframe read in the file,
  because an unconfirmed fine bar reading a coarser bar is where repainting
  comes from, even when the read's own mode is honest.
- The alert frequency `"everyUpdate"` becomes available, and it is only
  available here: requesting it without `onUnconfirmed` is OS3009.

The option has a name rather than being a global setting because the choice
belongs in the file, where a reviewer reads it. A script that says nothing
cannot act on a moving bar, and a script that can, says so on line two.

---

## 8. Alerts and how often they fire

An alert follows the same confirmation rule as a signal. The deferred call fires
when the bar closes, and if the condition is no longer true by then it never
fires at all. That is the behaviour that makes an alert worth acting on.

```
if crossUp(fast, slow)
    alert("Fast crossed above slow at " + text(close, 2), id = "cross-up")
```

| `frequency` | Means |
|---|---|
| `"oncePerBar"` | At most one alert per bar. The default |
| `"once"` | The first time only, for the life of this study instance |
| `"everyUpdate"` | On every execution of the bar. Requires `onUnconfirmed = true`, or OS3009 |

Two behaviours worth knowing before you rely on alerts:

**Give every alert an `id`.** The compiler lifts each `alert()` call site into
one watched condition in the study the host runs, and the `id` is that
condition's stable name, so a user's subscription survives an edit to the
script. With no `id` the compiler derives one from the call's position, which
changes when a line is inserted above it, and warns with OS8008.

**Adding a study to a chart fires nothing for the history already on it.** An
alert is a statement about now. A study added at noon that emitted four hundred
historical alerts would be useless.

---

## 9. Drawing on a bar that is still moving

Drawings are objects a script creates and mutates, so they would be the obvious
place for a live chart to accumulate rubbish: one line per tick, thousands of
lines per session. The rollback rule covers them. The object set is restored to
what it was at the end of the previous bar before the moving bar runs again, so
a line created on the moving bar is created once, not once per update.

```
version 1

study("Last swing", overlay = true, precision = 2)

left  = input(5, "Pivot left bars",  min = 1, max = 50)
right = input(5, "Pivot right bars", min = 1, max = 50)

ph = pivotHigh(high, left, right)

var marker = none

if not isNone(ph)
    // Anchored to a time, not to a bar index: loading older history renumbers
    // every index and would drag the drawing sideways.
    marker = draw.label(time[right], ph, "H", color = red, textColor = white)
```

Two details in that script are about confirmation rather than drawing.

A pivot is reported `right` bars **after** the bar it formed on, because that is
the first bar on which it is knowable. Returning it at the pivot bar would be a
lookahead: the value would appear on history at a bar where no script could have
had it. The marker therefore appears late, and that lateness is the honest cost
of a pivot rather than a defect.

And the anchor is `time[right]`, not `bar.index - right`. A drawing anchored to
a time stays where it was put when more history arrives.

---

## 10. How a replay reconstructs the past exactly

A chart replay feeds bars to the engine one at a time, oldest first, exactly as
a live feed would have, and lets you watch the study build itself. The question
that matters is whether what you see in a replay is what you would have seen at
the time. In OpenScript the answer is yes, and it is worth knowing why, because
the reasons are the same ones that make a backtest trustworthy.

**The script cannot read forward.** `x[n]` looks back only; a negative offset is
an error rather than an option. Nothing else in the language reaches a later bar.
The single exception has to be written out in the source, is warned about, and
marks the study as repainting in the legend: a higher timeframe read with
`mode = "lookahead"`.

**Every historical bar is executed once, confirmed.** A history load hands the
engine finished bars, so each one runs with `bar.isConfirmed` true and the same
values a live run would eventually have settled on.

**The moving bar is idempotent.** Rollback means executing bar 4999 once, or
forty times as ticks arrive, leaves the same state behind for bar 5000. A replay
that steps one bar at a time and a live session that received four hundred ticks
per bar converge on identical state.

**Arithmetic is fixed.** Binary64, round-to-nearest-even, in source order. No
reassociation, no fused multiply-add, no extended precision. Array iteration is
index order. There is no randomness anywhere in the language, and no reading of
the wall clock during a bar except `chart.now()`. Two engines that both pass the
conformance suite produce identical output for identical input, to the last
decimal.

**Warmup is exact, not approximate.** A function that needs `k` bars is absent on
bars 0 to `k - 2` and produces a value from bar `k - 1`, on every conforming
engine. A replay therefore starts drawing each column on exactly the bar the
live chart did. See [warmup.md](./warmup.md).

Put together: **running the script over the first N bars produces exactly the
columns that a full run shows at bar N.** That is the property a replay depends
on, and it is also the property that lets a backtest be compared with a live
run, a chart with a report, and one engine with another.

For higher timeframe reads, the mode is what preserves it:

| Mode | What it reads | Repaints |
|---|---|---|
| `"confirmed"` | Only higher timeframe bars that have closed | Never. The default |
| `"developing"` | Includes the higher timeframe bar currently forming | On the newest bars only, within the current higher timeframe period |
| `"lookahead"` | A higher timeframe bar's final value from its first lower timeframe bar | On history, permanently and by design |

`"confirmed"` is the default and the only mode that never repaints. The other
two must be written out, in a word a reviewer will see. That is the whole
mechanism: a script that repaints says so on the line that causes it, and a
script that says nothing cannot repaint.

---

## 11. The three things that break replay, and how to see them

If a replay does not reproduce what a live run showed, one of these is in the
file. There are no others.

**A `"lookahead"` read.** It uses a higher timeframe bar's final values on the
lower timeframe bars inside it, which on history is information nobody had at
the time. It exists because drawing a completed coarse candle across history is
a legitimate picture, and a language that refused it would push people to the
same thing done worse. The compiler warns with OS8005, and the host shows the
repainting mark in the legend, because a warning in an editor nobody opens again
is not a disclosure.

**A `live var`.** It does not roll back, so its value depends on how many ticks
arrived rather than on what the bars were. A replay cannot reproduce a tick
count that was never recorded.

**`chart.now()`.** It is the chart's wall clock, not the bar's time. A script
that compares `time` against `chart.now()` says something different tomorrow.
Use `time` for anything about the bar, and reserve `chart.now()` for the rare
case where the current moment really is the question.

To inspect any of this while a script runs, put the state on the chart rather
than guessing at it:

```
version 1

study("Bar state", overlay = true)

t = table("Bar state", 4, 2, position = "topRight")

cell(t, 0, 0, "bar.index")
cell(t, 0, 1, text(bar.index))
cell(t, 1, 0, "confirmed")
cell(t, 1, 1, text(bar.isConfirmed))
cell(t, 2, 0, "realtime")
cell(t, 2, 1, text(bar.isRealtime))
cell(t, 3, 0, "updates")
cell(t, 3, 1, text(bar.updates))
```

A table is declared at the top level, like a plot, and written per bar with
`cell`. On a live chart the "updates" row climbs while the bar forms and resets
when the next one appears, which is the clearest possible demonstration that the
script is being run again and again on one bar.

---

## 12. A checklist before you trade a script

Six questions, each with a one line answer in the source:

1. Does the file set `onUnconfirmed`? If it does, is every signal, alert and
   order guarded with `bar.isConfirmed`, and did you mean to take on that
   responsibility?
2. Does any higher timeframe read name a mode other than `"confirmed"`? If so,
   the study repaints, and the legend will say so.
3. Does any `live var` feed a decision rather than a display?
4. Does any condition mix a moving value with a settled one in a way that reads
   as more certain than it is? Write `close[1]` where you mean "the bar that
   closed".
5. Is `fillOn` still `"nextOpen"`? Changing it to `"close"` fills at a price the
   decision itself was made from.
6. Does the study look the same after a reload as it did before? If not, one of
   the three items in section 11 is in the file.

---

## See also

- [execution-model.md](./execution-model.md) for the bar loop and what is
  re-executed
- [persistence.md](./persistence.md) for `var`, `live var` and the rollback rule
  in detail
- [bars-and-history.md](./bars-and-history.md) for reading the settled past
- [warmup.md](./warmup.md) for the other reason a study shows nothing
- [objects-and-methods.md](./objects-and-methods.md) for drawings, which roll
  back with everything else
- [../alerts.md](../alerts.md) for what an alert does once it has fired
- [../README.md](../README.md) for the rest of the documentation
- [../../spec/stdlib.md](../../spec/stdlib.md) for `req.timeframe` and its modes
