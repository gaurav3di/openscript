# The execution model

By the end of this page you will be able to read any OpenScript file and say,
line by line, what happens on every bar: what is computed again from nothing,
what is carried forward, what the chart is handed at the end, and in what order
all of it happens.

This is the page the rest of the documentation leans on. Almost every surprise
in a per-bar language is a surprise about when something runs.

## Contents

1. [The file is the body of a loop](#1-the-file-is-the-body-of-a-loop)
2. [Compiled once, executed once per bar](#2-compiled-once-executed-once-per-bar)
3. [What a bar index means](#3-what-a-bar-index-means)
4. [Recomputed, remembered, fixed](#4-recomputed-remembered-fixed)
5. [Five bars, line by line](#5-five-bars-line-by-line)
6. [Source order is execution order](#6-source-order-is-execution-order)
7. [Blocks run inside the bar, not outside it](#7-blocks-run-inside-the-bar-not-outside-it)
8. [A call carries state, and the state belongs to the call site](#8-a-call-carries-state-and-the-state-belongs-to-the-call-site)
9. [Loops inside the bar loop](#9-loops-inside-the-bar-loop)
10. [Why the same bars always give the same numbers](#10-why-the-same-bars-always-give-the-same-numbers)
11. [What reaches the chart](#11-what-reaches-the-chart)
12. [Four mistakes this model causes](#12-four-mistakes-this-model-causes)

---

## 1. The file is the body of a loop

There is no main function in OpenScript, no event handler, and no entry point.
The file itself is the body of a loop over bars:

```
for each bar in the dataset, oldest first:
    run every top-level statement of the file, first line to last
```

That is the whole model. A file of forty lines is forty statements that the
engine runs once for bar 0, then again for bar 1, then again for bar 2, all the
way to the newest bar, and then again on the newest bar every time it changes.

Here is a script that says out loud what it is doing:

```
version 1

study("Trace")

n = bar.index
plot(n, "Bar index")
```

On a dataset of five thousand bars, `n = bar.index` executes five thousand
times. It is not a loop you wrote and it is not a loop you can see; it is the
shape of the language.

The reason it works this way rather than giving you a callback to fill in: a
chart study is a function from bars to columns of numbers, and every study wants
the same loop. A language that made you write the loop would make you write the
same loop in every file, and would then have to define what happens when two
files write it differently.

---

## 2. Compiled once, executed once per bar

Two things happen at two different times, and telling them apart removes most of
the confusion about why some statements may only appear at the top level.

```
source text
   -> tokens -> tree -> checked tree -> compiled program     once
   -> for each bar: run the program top to bottom            once per bar
```

**Compilation happens once.** Names are resolved, types are checked, the set of
plotted columns is fixed, the settings dialog is built from the `input()` calls,
and the whole program becomes a list of instructions.

**Execution happens once per bar.** Every instruction runs again for every bar.

Some statements sit in both worlds. `plot`, `input` and the other calls that
[../../spec/language.md](../../spec/language.md) section 15.3, "Where a call may
appear", makes top level only are read once, at compile time, because they
declare the fixed shape of the study: how many columns there are, what they are
called, what the legend says, which rows the settings dialog has. Their
**arguments**, however, are evaluated on every bar. That is how one `plot`
statement produces one value per bar.

This is why those calls must be at the top level of the file. Putting a `plot`
inside an `if` is error OS3006:

```
// Correct: one column, declared once, absent on the bars you want hidden.
plot(trending ? ema20 : none, "EMA 20", aqua)

// OS3006: the chart cannot build a legend for a column that may not exist.
if trending
    plot(ema20, "EMA 20", aqua)
```

The fix the compiler names is always the same one: plot `none` on the bars you
want hidden. An absent value reaching a drawing surface is a gap, never a zero,
so a plot that is absent on a bar simply breaks its line there.

Everything else may appear anywhere. The calls on the second list in that same
section, `signal` among them, are per-bar events or per-bar paint, so they
belong inside the per-bar logic.

---

## 3. What a bar index means

`bar.index` is the zero-based position of the bar being executed **within the
dataset the engine was given**. The oldest bar loaded is 0.

| Name | Type | Means |
|---|---|---|
| `bar.index` | `series number` | Position of this bar, oldest is 0 |
| `bar.count` | `series number` | `bar.index + 1`, bars seen so far |
| `bar.isFirst` | `series bool` | `bar.index == 0` |
| `bar.isLast` | `series bool` | This is the newest bar in the dataset |
| `bar.isConfirmed` | `series bool` | This bar's interval has elapsed |
| `bar.isRealtime` | `series bool` | A live feed is driving updates |
| `bar.isNew` | `series bool` | The last update appended a bar rather than replacing one |
| `bar.updates` | `series number` | How many times this bar has been executed |

The important word in the definition is *given*. A bar index is a position in
the data you loaded, not a universal address for that moment in market history.
Scroll left and the host loads two thousand older bars; every index in the
dataset shifts by two thousand, and the bar that was index 0 this morning is
index 2000 this afternoon.

The consequence, stated plainly: **a bar index is safe to subtract from another
bar index inside one run, and is never safe to store and compare across runs.**

```
// Safe: both indices come from the same run over the same dataset, so their
// difference is a real count of bars.
span = bar.index - pivotBarIndex

// Not safe: this value means a different bar tomorrow.
var anchorIndex = 0
if session.isFirstBar
    anchorIndex = bar.index
```

Store `time` for anything that has to survive a reload. A bar's opening instant
in UTC milliseconds does not move when more history arrives, which is also why
every object in the `draw` namespace is anchored to a time and a price rather
than to an index.

---

## 4. Recomputed, remembered, fixed

Three lifetimes, and every name in a script has exactly one of them.

| Thing | Lives for | Set by | Readable with `[]` |
|---|---|---|---|
| A plain top-level name | One bar | Its assignment, on every bar | Yes |
| A name first assigned in a block | One bar, inside that block only | Its assignment, on the bars the block runs | No, OS2004 |
| A `var` | The whole run | Its initialiser once, then any assignment | Yes, when it is at the top level |
| A `live var` | The whole run, without rollback | The same | Yes, at the top level |
| A series register | The whole run, one value per bar | The engine, as each bar finishes | That is what it is for |
| The chart surface | The whole run | Read once, at compile time | Not a value |

Read a script with that table in hand and the question "is this line recomputed
or remembered" answers itself. A line with `var` on it is remembered. Every
other assignment is recomputed.

The prior value of a recomputed name is not lost: history keeps it. What you do
not get is the prior value as a *starting point*:

```
tally = tally + 1       // OS2001: tally does not exist yet on this bar
tally = tally[1] + 1    // legal, and absent on every bar
```

The second line is the clearest single demonstration of the model. On bar 0,
`tally[1]` is absent, absence propagates through the addition, so `tally` is
absent. On bar 1 it reads bar 0's `tally`, which was absent, so it is absent
again. The series is absent forever. That is what `var` exists to fix, and
[persistence.md](./persistence.md) is the page about it.

---

## 5. Five bars, line by line

Here is a complete script, followed by every value it holds on each of its first
five bars. Read the table rather than the prose if you prefer; it is the whole
page in one grid.

```
version 1

study("Up share", precision = 2)

// Recomputed from the bar's own data every bar.
delta = close - close[1]

// Remembered. The initialiser runs once, on bar 0.
var up = 0

// An absent condition takes the false branch, which is what happens on bar 0.
if delta > 0
    up = up + 1

// Recomputed, but from a remembered value.
ratio = up / bar.count

plot(delta, "Change", aqua)
plot(ratio, "Up share", orange)
```

The dataset, five bars of closes: 100, 102, 101, 104, 104.

| Bar | `close` | `close[1]` | `delta` | `up` entering | Branch | `up` leaving | `bar.count` | `ratio` |
|---|---|---|---|---|---|---|---|---|
| 0 | 100.00 | absent | absent | 0, just initialised | not taken | 0 | 1 | 0.00 |
| 1 | 102.00 | 100.00 | 2.00 | 0 | taken | 1 | 2 | 0.50 |
| 2 | 101.00 | 102.00 | -1.00 | 1 | not taken | 1 | 3 | 0.33 |
| 3 | 104.00 | 101.00 | 3.00 | 1 | taken | 2 | 4 | 0.50 |
| 4 | 104.00 | 104.00 | 0.00 | 2 | not taken | 2 | 5 | 0.40 |

Six things in that table are worth naming, because each one is a rule rather
than an accident.

**Bar 0 has no previous bar.** `close[1]` is absent, not 100, and not zero.
Nothing is clamped to the start of history. See
[bars-and-history.md](./bars-and-history.md).

**An absent value propagates through arithmetic.** `close - close[1]` on bar 0
is absent because one operand was absent, so `delta` is absent and the "Change"
plot draws nothing at bar 0. The line starts at bar 1.

**An absent condition takes the false branch.** On bar 0 the comparison
`delta > 0` is itself absent, not false, because a comparison with an absent
operand is absent. The `if` then takes the false branch, because execution has
to go somewhere. This is the one place absence is absorbed rather than
propagated, and it is absorbed at the branch, where you can see it in the
source.

**`up` is initialised exactly once.** The `var` line is reached on every bar,
but its initialiser runs on the first bar that reaches it and never again.
On bars 1 to 4 the line is a no-op.

**`delta` is computed from scratch every bar, and `up` is not.** On bar 3, `up`
enters the bar holding 1, which is what bar 2 left in it. Nothing in the script
put it there this bar.

**On bar 4 the change is exactly zero and the branch is not taken**, because
`0 > 0` is false. There is no truthiness in OpenScript: zero is not false, it is
zero, and the comparison is the only thing being asked.

---

## 6. Source order is execution order

Within the file scope a name must be assigned before it is read, reading top to
bottom. Reading a name before its assignment is error OS2001, not an absent
value, because the file is the body of a loop that runs in source order.

```
plot(slow, "Slow", orange)      // OS2001: slow is assigned below
slow = ema(close, 21)
```

Functions are the one exception. A `fn` may be called before its declaration
appears, because a function declaration is not a per-bar statement; the checker
collects every declaration in the file before it checks any body.

```
plot(helper(close), "H", aqua)      // legal
fn helper(src) => sma(src, 9)
```

Order also decides what a `var` holds at a given line, and this is an idiom
worth learning rather than a trap. A `var` read **before** it is reassigned in
the file still holds the previous bar's value:

```
var band = none

// At this line, band is still whatever the previous bar left in it.
prevBand = band

band = max(rawBand, orElse(prevBand, rawBand))
```

This is how the trailing stop in the examples reads its own previous value
without a single `[1]`. Moving the `prevBand` line below the assignment would
change the meaning of the script, and the compiler cannot warn about it, because
both orders are legal and both are wanted somewhere.

---

## 7. Blocks run inside the bar, not outside it

A block is not a separate pass over the data. An `if` body is part of this bar's
execution, and it runs or does not run on this bar alone.

Two scope rules follow the per-bar model, and between them they mean a reader
never has to ask which of two variables a line is writing to:

**A name is declared by its first assignment in a scope.** An assignment to a
name that already exists in an enclosing scope updates that name rather than
creating a new one.

```
threshold = 70                  // declared in file scope
if volatile
    threshold = 80              // updates the same name
plot(threshold, "Threshold")    // 80 on volatile bars, 70 on the rest
```

**A name first assigned inside a block does not escape it.**

```
if volatile
    scratch = high - low        // declared in the block scope
plot(scratch, "Scratch")        // OS2001: scratch is not visible here
```

**Shadowing is an error, not a warning.** Declaring a name in an inner scope
when the same name exists outside is OS2002, and the message quotes the line of
the outer declaration. Since an assignment to an outer name updates it, and no
syntax exists to ask for a second variable, an attempt to shadow is always a
mistake. The most expensive class of bug in per-bar scripts is a value that is
right in one place and stale in another, and two variables with one name is the
shortest path to it.

Note the one consequence for `switch`: because an arm is a block, a name that
the arms set must be declared before the `switch`.

```
len = 14                    // declared here, so every arm updates one name
switch method
    case "fast"
        len = 9
    case "slow"
        len = 21
plot(sma(close, len), "SMA", aqua)
```

---

## 8. A call carries state, and the state belongs to the call site

Some library functions hold state between bars. `ema` does: it needs the
previous bar's value to produce this bar's. So does `rma`, `atr`, `vwap`, `cum`
and every function with a warmup longer than a single bar.

**State is allocated per call site, not per function.** Two calls in two places
are two independent pieces of state, which is what makes a stateful helper
reusable at all:

```
fn barsSinceTrue(cond) =>
    var n = none
    if cond
        n = 0
    else if not isNone(n)
        n = n + 1
    n

sinceUp   = barsSinceTrue(close > open)     // its own counter
sinceHigh = barsSinceTrue(high > high[1])   // a separate counter
```

Three consequences fall out of "per call site", and all three are specified
rather than discovered:

- A call inside a loop shares one state slot across every iteration, because one
  call site is one site. For state per iteration, keep an array and index it.
- Recursion is not allowed. A function may not call itself, directly or through
  a cycle; the compiler reports OS2005 and names the cycle. Write a loop.
- **A call site that does not execute on a bar leaves its series absent for that
  bar, and its state does not advance.**

That last rule is the one that bites. A stateful call inside a branch advances
only on the bars the branch is taken:

```
if trending
    e = ema(close, 20)      // the average only advances on trending bars
```

This is warning OS8001, and the fix it names is to compute the value
unconditionally at the top level and use the result inside the branch:

```
e = ema(close, 20)          // computed on every bar
if trending
    barColor(close > e ? lime : red)
```

The alternatives are all worse than absence. Forcing the call to run would
execute code the script said not to execute. Carrying the previous value forward
would draw a flat line that looks like data. An absent value breaks the line
where the call was skipped, which is the truth.

---

## 9. Loops inside the bar loop

`for` and `while` run inside a single bar. A loop is not a way to move across
bars; the bar loop already does that. A loop is for working over an array, or
over a fixed window of history within this bar.

```
version 1

study("Window sum, the slow way")

len = input(20, "Length", min = 1, max = 500)

total = 0.0
for i = 0 to len - 1
    total += close[i]

plot(total / len, "Mean", aqua)
```

That script is correct and is also the wrong way to write it: `sma(close, len)`
does the same work with a running total and an exact, documented warmup. The
loop above quietly produces an absent total for the first `len - 1` bars anyway,
because `close[i]` past the start of history is absent and absence propagates
through `+=`.

Two rules on loops that exist because of the per-bar model:

**A descending loop must say `step -1`.** `for i = 9 to 0` runs zero times; it
does not silently reverse. That costs one word and removes the only shape of
`for` loop that can spin forever by accident.

**Every iteration counts against a per-bar budget.** The default is 2,000,000
iterations summed over every loop executed during one bar. Exceeding it is
OS5001, which stops that bar and marks the study as errored on the chart rather
than breaking out of the loop with a plausible wrong number. The budget resets
each bar, so a long dataset is never itself a reason to fail, and it is yours to
raise in one line:

```
study("Heavy")
limits(loops = 50_000_000)
```

`limits()` is optional, appears at most once, and must be the statement
immediately after the declaration.

---

## 10. Why the same bars always give the same numbers

The same compiled program over the same bars must produce the same output on
every engine, every time. That promise is what makes a backtest comparable with
a chart, and a chart comparable with a live run, so the language gives up a few
things to keep it:

- All arithmetic is binary64 with round-to-nearest-even, in the order the source
  writes it. An engine may not reassociate, may not fuse a multiply and an add,
  and may not use extended precision registers.
- Iteration over an array is index order. There is no unordered collection.
- There is no source of randomness anywhere in the language, and no reading of
  the wall clock during a bar except through `chart.now()`, whose value the host
  supplies.
- Case conversion and month names are invariant, not locale dependent, so a
  script does not change its output because of how a machine is configured.

The practical reading: if two runs of your script disagree, the data disagreed.
That is a useful thing to be able to assume.

---

## 11. What reaches the chart

At the end of each bar the engine has produced one value for every plotted
column, plus whatever markers, paint and drawings the bar's code asked for. The
host receives the whole study as a descriptor: plotted columns, shaded bands,
levels, markers, the table, the free drawings, the pane background, the price
bar colours, the alerts, the fixed pane range and the settings inputs.

Two rules about that hand-off are worth carrying with you:

**An absent value is a gap, never a zero.** A plot breaks its line, a fill
stops, a `barColor` leaves the bar its own colour, a table cell is blank, a
level is not drawn.

**Signals, alerts and orders wait for the bar to close.** On a bar that is still
moving they are deferred by default, and if the condition that produced them is
no longer true when the bar closes, they never happen at all. That is the
subject of [realtime-and-confirmation.md](./realtime-and-confirmation.md).

---

## 12. Four mistakes this model causes

**Expecting an accumulator to accumulate without `var`.** `total = total + x` is
OS2001 and `total = total[1] + x` is absent forever. The fix is `var total = 0`.

**Computing an indicator where it is used.** A stateful call inside a branch
advances only on the bars the branch runs. Compute at the top level, use inside
the branch. The compiler warns once with OS8001; take the warning.

**Wrapping a plot in a condition.** `plot` is top level only, OS3006. Hide a bar
by plotting `none`.

**Storing a bar index and trusting it later.** Indices move when history loads.
Subtract two indices from the same run freely; store `time` for anything that
has to survive.

---

## See also

- [bars-and-history.md](./bars-and-history.md) for `[]`, what it returns at the
  start of history, and what a deep lookback costs
- [persistence.md](./persistence.md) for `var`, `live var` and the bugs the
  difference causes
- [realtime-and-confirmation.md](./realtime-and-confirmation.md) for the bar
  that is still moving
- [warmup.md](./warmup.md) for why a study draws nothing at the left edge
- [variables-and-scope.md](./variables-and-scope.md) for declaration, update and
  the ban on shadowing
- [functions.md](./functions.md) for user functions and per call site state
- [../README.md](../README.md) for the rest of the documentation
- [../../examples/README.md](../../examples/README.md) for twelve complete
  scripts that run
