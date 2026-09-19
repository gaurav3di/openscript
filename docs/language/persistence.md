# Persistence

By the end of this page you will be able to hold a value across bars on purpose,
know exactly which line of your script is doing the remembering, tell a value
that settles when a bar closes from one that moves on every tick, and recognise
the four bugs that the difference between those two causes.

## Contents

1. [A bar has no memory of its own](#1-a-bar-has-no-memory-of-its-own)
2. [`var`: initialised once, kept forever](#2-var-initialised-once-kept-forever)
3. [Where and when the initialiser runs](#3-where-and-when-the-initialiser-runs)
4. [Lifetime and scope are different questions](#4-lifetime-and-scope-are-different-questions)
5. [Reading a `var` before you reassign it](#5-reading-a-var-before-you-reassign-it)
6. [Persistence is not history](#6-persistence-is-not-history)
7. [A `var` holding an array](#7-a-var-holding-an-array)
8. [The value that settles, and the value that moves](#8-the-value-that-settles-and-the-value-that-moves)
9. [`live var`, and the one thing it is for](#9-live-var-and-the-one-thing-it-is-for)
10. [Four bugs this distinction causes](#10-four-bugs-this-distinction-causes)
11. [A worked example: a session accumulator](#11-a-worked-example-a-session-accumulator)

---

## 1. A bar has no memory of its own

Every top-level statement of a script runs again on every bar. A name assigned
without `var` is therefore computed fresh each time, from nothing:

```
tally = tally + 1       // OS2001: tally does not exist yet on this bar
```

The error is not a technicality. At the moment that line runs, this bar's
`tally` has not been assigned, and the previous bar's `tally` is not the
starting point for this bar's computation. It is readable, through history, but
reading it is a different thing:

```
tally = tally[1] + 1    // legal, and absent on every single bar
```

Trace it. On bar 0, `tally[1]` is absent because there is no bar before bar 0.
Absence propagates through the addition, so `tally` is absent on bar 0. On bar 1,
`tally[1]` reads bar 0's `tally`, which was absent, so bar 1 is absent. The
series is absent forever, and the plot is empty.

A per-bar language needs a way to say "keep this one". That is `var`.

---

## 2. `var`: initialised once, kept forever

`var name = initial` declares a value that is initialised once and then keeps
whatever it holds from bar to bar.

```
version 1

study("Bars and up bars", precision = 2)

var bars = 0
var ups  = 0

bars = bars + 1
if close > open
    ups = ups + 1

plot(ups / bars * 100, "Percent of bars that closed up", aqua)
```

On bar 0 the two `var` lines create the counters and set them to zero. On every
bar after that the `var` lines are no-ops: control reaches them, sees the value
already exists, and moves on. The two assignments below them run every bar, and
each one starts from what the previous bar left behind.

Compare the three kinds of name side by side:

| | Plain name | `var` | `live var` |
|---|---|---|---|
| Set on every bar | Yes, by its assignment | Only where the script assigns it | Only where the script assigns it |
| Value at the start of a bar | Absent, until assigned | What the previous bar left | What the previous execution left |
| Survives to the next bar | No | Yes | Yes |
| Restored before the moving bar runs again | Not applicable | Yes | No |
| Readable with `[]` | Yes, at the top level | Yes, at the top level | Yes, at the top level |
| Same numbers live as in a backtest | Yes | Yes | No, by design |

One more rule, small but worth knowing before you meet it: the declaration and
the assignment are one statement. `var tally` on its own is OS1011, and the fix
the compiler names is `var tally = none`.

---

## 3. Where and when the initialiser runs

**The initialiser runs once, on the first bar on which control reaches the
declaration.** Usually that is bar 0, because most `var` lines sit at the top
level. It is not bar 0 when the declaration sits inside a conditional block:

```
var started = false

if session.isFirstBar
    // This declaration is reached for the first time on the first bar of the
    // first session in the dataset, which may be bar 0 and may be bar 37.
    var sessionOpen = open
    started = true
```

Until then the value is absent. That is not a special case bolted on; it is what
"reached for the first time" means, and it is occasionally exactly the tool you
want: a value seeded from the first bar that satisfies a condition rather than
from the first bar of the dataset.

`var` may appear at the top level, inside a block, or inside a function. Inside
a function it gives that call site its own memory, which is what makes a
stateful helper reusable:

```
fn runLength(cond) =>
    var n = 0
    n = cond ? n + 1 : 0
    n

upRun   = runLength(close > open)       // its own counter
downRun = runLength(close < open)       // a separate counter
```

State is allocated per call site, not per function, so these two calls never see
each other's `n`.

---

## 4. Lifetime and scope are different questions

`var` says how long a value lives. The block it sits in says where the name can
be seen. The two are independent, and conflating them is a common first-week
mistake.

```
if breakout
    var highWater = high        // persists across bars, visible only here
    highWater = max(highWater, high)

plot(highWater, "High water", aqua)     // OS2001: not visible at the top level
```

The value above genuinely survives from bar to bar. The name simply cannot be
read outside the block that declared it. To plot it, declare it at the top level
and assign it inside the block:

```
var highWater = none

if breakout
    highWater = isNone(highWater) ? high : max(highWater, high)

plot(highWater, "High water", aqua)
```

Note that an assignment to a name that already exists in an enclosing scope
updates that name rather than creating a second one. There is never a second
variable with the same name in OpenScript: declaring one is OS2002, not a
warning, and the message quotes the line of the outer declaration.

---

## 5. Reading a `var` before you reassign it

Because the file runs top to bottom, a `var` read **above** the line that
reassigns it still holds the previous bar's value. This is an idiom, not a
trick, and it is how the trailing stop in the examples reads its own past
without a single `[1]`:

```
version 1

study("Trailing high", overlay = true, precision = 2)

var trail = none

// At this line, trail is still what the previous bar left in it.
prevTrail = trail

// Seed on the first bar, then only ever ratchet upward.
trail = isNone(prevTrail) ? low : max(prevTrail, low)

// Compare against the band as it stood before this bar moved it, not against
// the band this bar has just produced, or every bar would trigger itself.
if not isNone(prevTrail) and close < prevTrail
    signal("BROKEN")

plot(trail, "Trail", lime, width = 2)
```

Move the `prevTrail` line below the assignment and the script means something
else entirely, and the compiler cannot warn you, because both orders are legal
and both are wanted somewhere. When the order matters, say so in a comment; that
is what the examples do.

---

## 6. Persistence is not history

These two are constantly confused and are unrelated.

```
close[1]        // history: what close was one bar ago
var x = 0       // persistence: x survives into the next bar
x[1]            // both: what the persistent x was one bar ago
```

History is a read of the past. Persistence is a value that carries forward. A
plain name has history and no persistence; that is exactly why
`tally = tally[1] + 1` fails while `var tally = 0` works. A `var` at the top
level has both.

| Question | History | Persistence |
|---|---|---|
| Spelled | `x[n]`, `history(x, n)` | `var x = ...` |
| What it gives you | The value on an earlier bar | The value this bar starts with |
| Absent at the start | Yes, past the start of history | Only if the initialiser says so |
| Costs | Memory per retained bar | One cell for the whole run |

---

## 7. A `var` holding an array

An array value is a reference. A `var` holding an array persists the array, and
the rollback rule restores its **contents** as well as the reference, so a
strategy that pushes to an array on a moving bar does not accumulate duplicates
as ticks arrive.

```
version 1

study("Rolling window", precision = 2)

len = input(100, "Window", min = 2, max = 5000)

var closes = []

push(closes, close)
if size(closes) > len
    shift(closes)

plot(avg(closes), "Rolling mean", aqua)
plot(stdev(closes), "Rolling deviation", orange)
```

Two cautions come with references. Assigning one array name to another gives two
names for one array, so `copy(arr)` is how you get an independent one. And `[]`
on an array is element access, not history, so use `history(closes, 1)` when you
mean last bar's array and `element(closes, 0)` when you mean the first element.

---

## 8. The value that settles, and the value that moves

On a live chart the newest bar is executed again on every update. Its `close` is
the last traded price, its `high` can still rise, and its `volume` is still
growing. A value computed from those is a value that moves.

**The rollback rule** is what keeps a script from accumulating that movement:

> Before each re-execution of the moving bar, the engine restores every
> persistent value to what it held at the end of the last execution of the
> **previous** bar.

Persistent values means `var` cells and the contents of arrays those cells hold,
and it also covers the objects the `draw` namespace created. The effect is that
executing the moving bar twice gives the same answer as executing it once: the
script is idempotent in the bar.

```
version 1

study("Rollback", precision = 0)

var bars = 0
bars = bars + 1

plot(bars, "Bars")     // counts bars, not ticks, even on a live chart
```

Watch that script over three updates of one bar. The dataset has forty-one bars,
and bar 40 finished with `bars` holding 41.

| Update of bar 41 | `bar.updates` | `bars` restored to | `bars` after the line | What the chart shows |
|---|---|---|---|---|
| First | 1 | 41 | 42 | 42 |
| Second | 2 | 41 | 42 | 42 |
| Third | 3 | 41 | 42 | 42 |
| Bar closes | 3 | 41 | 42 | 42, and settled |

Without rollback that counter would climb by one per tick, and the same script
would produce different numbers on a live chart than in a backtest of the same
data, which would make the whole project pointless. The rule is the reason a
backtest is worth running.

So there are two classes of value on the moving bar:

- **A value that moves during the bar and settles at the close.** Anything
  computed from `close`, `high`, `low` or `volume` on the current bar, and
  anything derived from those. It is recomputed from scratch on every update, so
  nothing accumulates; its final value is the one the bar keeps.
- **A value that only ever changes once per bar.** Anything computed from
  `close[1]` and older, and any `var` that is only assigned under a condition
  that cannot flicker. These are already settled while the bar is still moving.

Preferring the second class where a decision is involved is most of what
[realtime-and-confirmation.md](./realtime-and-confirmation.md) has to say.

---

## 9. `live var`, and the one thing it is for

`live var` is identical to `var` except that it does **not** roll back, so it
survives re-execution of the moving bar.

```
version 1

study("Updates", precision = 0)

live var ticks = 0
ticks = ticks + 1

plot(ticks, "Updates this session")
```

It exists for one purpose: counting or accumulating over intrabar updates. It is
spelled with an extra word on the line because a script that uses it produces
different numbers live than in a backtest, and the reader should see that coming
in the source rather than discovering it in a report.

Use it when the count of updates is the actual measurement you want, such as an
activity display in a dashboard table. Do not use it to hold a trading decision:
a stop that was set on a tick that has since been rolled back is a stop nobody
can reproduce.

If you only want to know how many times this bar has run, you do not need a
counter at all. `bar.updates` is a built-in, and it resets with each new bar.

---

## 10. Four bugs this distinction causes

### 10.1 The absent seed that never recovers

This is the most common persistence bug in the language, and it is the same
shape as `tally = tally[1] + 1`:

```
var highWater = none

// Wrong: on the first bar, highWater is absent, so the comparison is absent,
// so the branch is not taken, so highWater stays absent forever.
if high > highWater
    highWater = high
```

The comparison `high > none` is absent, not true and not false. An absent
condition takes the false branch. The value is never seeded, so it is absent on
every bar and the plot is empty.

Two fixes, both one line:

```
// Ask the question the absent value can answer. Equality is total, and isNone
// is the same test spelled as a call.
if isNone(highWater) or high > highWater
    highWater = high

// Or give the comparison something to work with.
highWater = max(orElse(highWater, high), high)
```

### 10.2 The counter that counts the wrong thing

```
live var barsInTrade = 0
if pos.size != 0
    barsInTrade = barsInTrade + 1
```

On history this counts bars. On a live chart it counts updates, because
`live var` does not roll back, so a position held through two hundred ticks
reports two hundred bars. The backtest and the live run then disagree about the
same trade, and the disagreement grows with the tick rate of the instrument.

The fix is to drop the word `live`, or better, to ask the position directly:
`pos.barsHeld` is a built-in that is 0 on the entry bar.

The general rule: **`var` unless counting updates is the measurement.**

### 10.3 The warmup branch that silently changes an answer

```
var regime = "unknown"

// During warmup rsi is absent, the comparison is absent, and neither branch
// runs. regime keeps whatever the last non-warmup bar left, which on the first
// bars is the initialiser, and the study reports "unknown" as though it were a
// reading.
if rsi(close, 14) > 50
    regime = "up"
else if rsi(close, 14) < 50
    regime = "down"
```

The compiler emits warning OS8004 on an `if` whose condition can be absent and
whose block assigns to a name used outside it, precisely because this shape lets
warmup change an answer where nobody is looking. There are two things wrong
above and both deserve fixing: the stateful call appears twice, which is two
call sites and two independent pieces of state, and the absent case is not
handled.

```
r = rsi(close, 14)              // one call site, computed every bar

var regime = "unknown"
if not isNone(r)
    regime = r > 50 ? "up" : "down"
```

Now the absent case is explicit in the source, and a reader can see that
"unknown" means warmup rather than a neutral reading.

### 10.4 The late initialiser

```
if bar.index > 100
    var anchor = close       // initialised on bar 101, not bar 0
```

This is correct behaviour and it surprises people, so it is worth stating
plainly: a `var` inside a conditional block is absent until the first bar on
which control reaches the declaration. If you meant "seed from the first bar of
the dataset", declare it at the top level. If you meant "seed from the first bar
that satisfies this condition", this is the tool, and a comment saying so will
save the next reader a minute.

---

## 11. A worked example: a session accumulator

Everything on this page in one script: a value that resets per session,
accumulates across bars, survives the moving bar without double counting, and
handles its own absence.

```
version 1

study("Session volume weighted price", overlay = true, precision = 2)

src = input(hlc3, "Source")

// Three running totals rather than an array of every bar in the session. The
// rollback rule restores all three before the moving bar is re-executed, so
// the totals count bars and not ticks, and a live chart agrees with a backtest
// of the same data.
var priceVolume = 0.0
var totalVolume = 0.0
var bars        = 0

// A session is what the exchange opens, not what a calendar says: an evening
// session that runs past midnight is one session and two dates.
if session.isFirstBar
    priceVolume = 0.0
    totalVolume = 0.0
    bars        = 0

priceVolume += src * volume
totalVolume += volume
bars        += 1

// Absence is how this study says "not ready", rather than plotting a zero that
// would look like a price.
ready = totalVolume > 0
value = ready ? priceVolume / totalVolume : none

plot(value, "Session VWAP", orange, width = 2)
plot(bars,  "Bars this session", fade(silver, 40), scale = "left")
```

Three details in that script are persistence decisions rather than style:

- The reset is an assignment inside an `if`, not a second `var` line. A `var`
  line initialises once for the whole run; the reset has to happen every
  session.
- `totalVolume > 0` is the readiness test rather than `bars > 0`, because
  `volume` is absent rather than zero on an instrument the host has no volume
  for, and an absent addition leaves the total absent, which the comparison then
  reports as absent, which takes the false branch. The study draws nothing
  rather than dividing by zero.
- Nothing here needs `live var`. Every number settles when the bar closes, which
  is the only way the line on the chart today can be the line that was on it at
  the time.

---

## See also

- [execution-model.md](./execution-model.md) for the bar loop that makes
  persistence necessary in the first place
- [bars-and-history.md](./bars-and-history.md) for reading the past, which is
  the other half of this subject
- [realtime-and-confirmation.md](./realtime-and-confirmation.md) for rollback,
  `bar.updates` and what a moving bar is allowed to do
- [warmup.md](./warmup.md) for the absent values that so many persistence bugs
  start with
- [variables-and-scope.md](./variables-and-scope.md) for where a name can be
  seen, which is the question `var` does not answer
- [collections.md](./collections.md) for an array held in a `var`
- [../README.md](../README.md) for the rest of the documentation
- [../../examples/README.md](../../examples/README.md) for these idioms in
  complete scripts
