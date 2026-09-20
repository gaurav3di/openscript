# Repainting

By the end of this page you can define repainting precisely, name the four ways
a script causes it, see it on your own chart in under a minute, read what the
compiler is telling you about it, and decide the handful of cases where it is
legitimate.

This page is longer than the others on purpose. Repainting is the difference
between a study that looks brilliant in history and a study that makes money,
and almost every trader who has been burned by one could not say afterwards
which line did it.

## What repainting is

**A study repaints when the value it shows for a bar, after that bar has closed,
differs from the value it showed while that bar was the newest one.**

That is the whole definition, and everything below is a consequence of it. Two
different things move on a live chart, and only one of them is repainting.

| Movement | Example | Is it repainting |
|---|---|---|
| The newest bar's value changes while the bar is still forming | `close` ticks up, so `sma(close, 20)` ticks up with it | No. The bar is not finished and neither is the answer |
| A closed bar's value changes later | A marker appears on a bar that is already twenty bars old | Yes |
| A closed bar's value changes when the chart is reloaded | The study drew nothing there this morning and draws a signal there now | Yes, and this is the worst kind |

The first row is ordinary and unavoidable. A study computed from a price that is
still moving moves. Nobody is misled, because the bar is visibly the last one on
the chart.

The other two rows are the problem, and the problem is not aesthetic. A backtest
is a measurement of what a study would have told you at the time. If the study's
history is not what it said at the time, the backtest measured something that
never existed. The equity curve is real arithmetic over imaginary signals.

### Why history is where it hides

Nobody discovers repainting on history, because history is where it is
invisible. A repainting study's past is internally consistent: every marker sits
at a sensible place, every level is respected, every trend is entered near its
start. It looks like a study that works. It is a study that has been told the
answers.

The first evidence usually arrives as a live signal that appears, then
disappears. The second is a live track record that does not resemble the
backtest. By then the study has been traded.

## The four ways a script causes it

### 1. Reading a bar that has not finished

A bar that is still forming has a `close` that is the last traded price, a
`high` that may still be exceeded and a `low` that may still be broken. Anything
computed from those is provisional.

The language defends against this by default, in two ways:

- **Deferred effects.** `signal`, `alert` and every order function do not fire on
  a bar that is still moving. The call is deferred until the bar closes, and if
  the condition that produced it is no longer true by then, it never happens at
  all. That is exactly the behaviour that makes a signal worth acting on.
- **The rollback rule.** Before each re-execution of the moving bar, every
  persistent value is restored to what it held at the end of the previous bar.
  Executing the moving bar ten times therefore gives the same answer as
  executing it once, so a live chart and a backtest of the same data agree.

A script leaves both defences by writing `onUnconfirmed = true` in its
declaration, or by making a `"developing"` higher timeframe read, or by using
`live var` instead of `var`.

```
version 1

// Repaints. The entry is taken from a close that is still moving, so a bar that
// pokes above the level at 10:31 and falls back by 10:35 leaves a trade in the
// backtest that the market never gave anyone.
strategy("Breakout, unguarded", overlay = true, onUnconfirmed = true)

level20 = highest(high, 20)[1]

if close > level20
    buy(qty = 1)
```

```
version 1

// Does not repaint. Either drop onUnconfirmed, which is the default and makes
// the engine defer the order to the close, or guard every decision with
// bar.isConfirmed and keep the opt-in for the parts that need it.
strategy("Breakout, confirmed", overlay = true)

level20 = highest(high, 20)[1]

if close > level20
    buy(qty = 1)
```

Note what the second script does not need: no extra state, no flag, no "wait one
bar" logic. The default already is the guard. This is why `onUnconfirmed = true`
has a long name and appears in the declaration where a reviewer reads it first.

`live var` belongs in this category too. It opts out of the rollback rule, so a
value accumulated in one produces different numbers on a live chart than in a
backtest of the same data, by design. The compiler says so with OS8011:

> {name} is a live var, so it keeps its value across the updates of the moving
> bar.

### 2. Reading a bar that had not happened yet

The second cause is a read that answers with information from the future. In
OpenScript there is exactly one way to write it, and it is spelled out:

```
// The finished value of the coarse bar, shown on every chart bar inside it,
// including the ones before that value existed.
dayClose = req.timeframe("1D", close, mode = "lookahead")
```

`"lookahead"` gives a coarse bar's final value from its first chart bar. On a
five minute chart with a daily read, this hands 09:20 the number the day will
close at. Every study built on it anticipates the day perfectly, on history, and
knows nothing extra live, because live there is no future to read.

The mode exists for one honest purpose, drawing a completed coarse candle across
history as a picture, and it is named so that nobody reaches it without meaning
to. It carries two disclosures: a compiler warning on the line, and a mark on the
compiled study that the host shows in the legend, because a warning in an editor
nobody opens again is not a disclosure.

The library refuses to produce this shape anywhere else. `pivotHigh` and
`pivotLow` report a pivot on the bar `right` bars **after** it formed, which is
the first bar on which the pivot is knowable. Returning it at the pivot bar
would be a lookahead: a value appearing on history at a bar where no script
could have had it.

The order model applies the same principle to fills. `fillOn` defaults to
`"nextOpen"` rather than `"close"`, because a decision made from a bar's close
cannot be filled at that same close in the real market, and a backtest whose
default is optimistic is a backtest that lies.

### 3. Drawing a decision backwards in time

The third cause is different in kind: the values are honest, and the **drawing**
is placed in the past.

```
pivot = pivotHigh(high, 5, 5)
plot(pivot, "Pivot", red, offset = -5)          // drawn back at the pivot bar
draw.label(time[5], high[5], "Swing high")      // anchored five bars back
```

Nothing here is invented. The pivot really was at that bar, and the script found
out five bars later. But the chart's past gains a marker it did not have five
bars ago, so a reader who scrolls back sees a study that appears to have called
the high at the high.

That makes it a disclosure problem rather than a data problem, and the
disclosure is easy: say in the study's title or its comments that the marker
arrives `right` bars late, and never let a strategy act at the anchor bar's
price. A study is dishonest here only when the lag is hidden. This is also the
case where the distinction from the other three matters: nothing already drawn
changes, the past only gains something.

`offset` on a plot shifts where a column is drawn and never what it contains,
which is why a displaced cloud or a projected channel is expressible without
touching the data. A positive offset draws into the margin past the newest bar
and is not a repaint at all: nothing in the past moved.

### 4. Carrying state the next load will not reproduce

The fourth cause is the quietest. The study does not read the future and does
not read an unfinished bar; it simply produces a different answer the next time
the chart is loaded.

| Shape | Why the reload differs | The compiler |
|---|---|---|
| `live var` accumulating over ticks | History has no ticks, so the reloaded value is the bar-by-bar one | OS8011 |
| A persistent value holding `bar.index` | Every index shifts when older history is paged in | OS8014 |
| A stateful call inside a branch | Its state advances only on bars where the branch ran, and it is absent on the rest | OS8001 |
| A running total from bar 0: `cum`, `obv`, `ad` | Bar 0 moves when more history loads, so the total starts somewhere else | Not a warning: this is the honest definition of a running total |
| A seeded average near the left edge | `ema(src, n)` is seeded on bar `n - 1` with the simple average of those `n` values, so the seed sits at a different bar when more history loads | Not a warning: the seeding is specified and the effect fades |

The first three are script bugs and the compiler names them. The last two are
properties of the measurements themselves, and the defence is to keep them off
the part of the chart you make decisions on: do not trade the first bars of a
freshly loaded dataset, and do not compare a cumulative value across two
different history loads.

OS8014's message is the clearest statement of the general problem:

> {name} keeps a bar index across bars, and every index shifts when more history
> loads.

Store `time` instead. A bar's time does not move.

## How to see it

Four tests, cheapest first.

**Read the source for five things.** `"developing"`, `"lookahead"`,
`onUnconfirmed`, `live var`, and a negative `offset`. A file with none of those
five cannot repaint in the first three ways described above. That is not a
heuristic, it is a property of the language: the default mode is `"confirmed"`,
effects are deferred on a moving bar, and `var` rolls back.

**Read the legend.** A study containing a `"lookahead"` read carries a repaint
mark that the host shows there, whether or not anyone read the source.

**Watch one bar close.** Note the study's value while the bar is moving, wait
for the bar to close, and compare. The value should settle, once, and then never
move again. If a marker appears and disappears while you watch, the study acts
on unconfirmed data.

**Measure it.** History cannot show you a repaint, because history is the
repainted version. So measure the drift live, with a script:

```
version 1

// A meter, not a signal. It records what a read said on the first update of
// each bar and plots how far the read has travelled since.
study("Repaint meter", precision = 4)

tf = input("1h", "Interval to test", kind = "interval")

watched = req.timeframe(tf, close, mode = "developing")

// live var is the point of this study rather than a mistake: an ordinary var is
// restored to its previous bar value before every re-execution of the moving
// bar, which would erase the very thing being measured. The compiler warns with
// OS8011 that this file reports different numbers live than in a backtest, and
// for this file that is the intent.
live var seenAt = none
live var firstValue = none

if seenAt != time
    seenAt = time
    firstValue = watched

drift = isNone(firstValue) ? none : watched - firstValue

plot(drift, "Drift since this bar opened", orange, width = 2)
level(0, "No drift", gray)
```

On history every bar executes once, so the line is flat at zero and the study
looks pointless. Leave it running live for one session and it will not be flat.
The height of that line is how much a signal taken from the same read could move
before the bar closes. Swap `"developing"` for `"confirmed"` and the line stays
at zero live as well, which is the property the default mode is buying you.

## What the compiler tells you, and what it does not

Warnings never stop anything. They are reported on the line, with a code and a
fix, and they exist because the shapes they name are almost always mistakes.

| Code | Says | Relevance here |
|---|---|---|
| OS8001 | A stateful call inside a branch advances only on the bars where the branch runs | The call's history depends on which bars ran, so a reload can differ |
| OS8002 | This file sets `onUnconfirmed = true` and reads a coarser interval; together they repaint | Two sources of provisional data stacked |
| OS8004 | A branch on an absent condition changes a value used later | The warmup path quietly changes an answer |
| OS8011 | A `live var` keeps its value across the updates of the moving bar | Live and backtest differ by design |
| OS8014 | A persistent value holds a bar index, and every index shifts when more history loads | The reload test will fail |

The compiler also warns on a `"developing"` read and on a `"lookahead"` read,
naming the line and what the study will now do.

What the compiler cannot tell you is whether the repaint is acceptable. It does
not know whether the study is a dashboard a person reads or a filter a strategy
trades. That judgement is the script author's, which is why the mechanism is a
disclosure rather than a prohibition.

## What is not repainting

Worth listing, because a study accused of repainting is often doing something
else entirely.

- **The newest bar moving.** A study computed from a moving price moves. Wait
  for the close.
- **An empty left edge.** A call that needs `len` bars is absent until `len`
  bars exist. A gap at the start of the chart is a study saying it does not have
  the data yet, and absence draws a gap rather than a zero specifically so it is
  visible.
- **An alert that did not fire.** A condition true at 10:31 and false at the
  close produces no alert, on purpose. That is the deferral working, not a
  missed signal.
- **A late pivot.** A marker that arrives five bars after the high is a study
  paying the honest cost of knowing a pivot. Drawing it back at the high is the
  part that needs disclosing.
- **Two engines disagreeing.** That is a conformance failure, not a repaint, and
  it is a release blocker rather than a property of the script.

## When repainting is legitimate

It is legitimate when the reader can see it and nothing acts on it. That single
rule covers every acceptable case:

| Case | Mode or shape | Why it is acceptable |
|---|---|---|
| The finished coarse candle drawn over history | `"lookahead"` | The picture is the point, and the legend carries the mark |
| A dashboard showing the day's range so far | `"developing"` | "So far" is the question being asked, and a person is reading it |
| A swing marker drawn back at its pivot | negative `offset` | The lag is real, disclosed, and nothing trades at that bar |
| An intrabar tick counter | `live var` | Counting updates is the stated intent, and the warning is accepted |

And the rule that follows from it: **no order function, and no alert a person
will act on, may depend on a repainting value.** If a `"developing"` read is on
the chart for the trader to look at, guard the parts that trade with
`bar.isConfirmed` and a confirmed read of the same expression. Two reads of one
expression at two modes is cheap and makes the split explicit:

```
version 1

study("Day range, read twice", overlay = true, precision = 2)

// For the eye: what the day has done so far. It moves, and that is the point.
soFar = req.timeframe("1D", high, mode = "developing")

// For the decisions: only days that have closed. It never moves. No [1] inside
// it, because "confirmed" is already the last day that closed.
settled = req.timeframe("1D", high, mode = "confirmed")

plot(soFar,   "Today's high so far", fade(aqua, 40), width = 1, style = "step")
plot(settled, "Yesterday's high",    aqua,           width = 2, style = "step")

// The marker reads the settled value only. Nothing in this file acts on soFar.
// crossUp is "at or below, then above", so a close that touches the level and
// then clears it reports one cross rather than none.
if crossUp(close, settled)
    signal("ABOVE YESTERDAY")
```

## A review checklist

Run down this list before a study is trusted with money.

| Question | Where to look | A good answer |
|---|---|---|
| Does any read say `"developing"` or `"lookahead"`? | Every `req.` call | None, or one whose result nothing trades from |
| Does the declaration say `onUnconfirmed = true`? | Line 3 of the file | No, or every decision is guarded by `bar.isConfirmed` |
| Is any `var` a `live var`? | Every declaration | No, unless counting updates is the study's subject |
| Does a persistent value hold `bar.index`? | Every `var` assignment | No: it holds `time` |
| Is any stateful call inside an `if` or a ternary arm? | Every branch | No: computed at the top level, hidden with `none` |
| Does any plot use a negative `offset`? | Every `plot` | Only where the lag is stated in the title or comments |
| Did the study survive the reload test? | The chart | The markers are in the same places |

## See also

- [higher-timeframes.md](./higher-timeframes.md) for the three modes in detail
  and what each returns on a forming coarse bar
- [other-instruments.md](./other-instruments.md) for the reads whose answers
  arrive late, and what a missing bar means
- [timeframes.md](./timeframes.md) for intervals and for converting a period in
  time into a count of bars
- [sessions-and-time.md](./sessions-and-time.md) for session boundaries, which
  is where a coarse read steps
- [../README.md](../README.md) for the rest of the documentation
