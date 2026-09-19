# Debugging

By the end of this page you will be able to take a script that produces a wrong
number, or no number, and find the exact bar where it first goes wrong and the
exact line that does it.

## The shape of the problem

A script is the body of a per-bar loop. It runs once per bar, from the first
line to the last, over a dataset that may be fifty thousand bars long, and it
keeps almost nothing between bars except what you told it to keep. There is no
breakpoint, no stepper you can attach and no variable inspector, because there
is nothing to attach one to: by the time you look at the chart the loop has
finished forty-nine thousand times.

So debugging in OpenScript is not stepping. It is **making the script say what
it did**, on every bar or on one chosen bar, and then reading that back. The
language gives you five ways to make it say so, and the rest of this page is
those five and the method that uses them.

| Way | Shows | Best for |
|---|---|---|
| A plot | One number per bar, drawn | Finding the bar a value goes wrong on |
| `background` or `barColor` | One fact per bar, painted behind or on the candles | Finding which bars are absent, or which bars a branch ran on |
| A table | A grid of values on one bar, usually the newest | Watching many values at once, live |
| `draw.label` | Text pinned to one bar at one price | Freezing the state of a chosen bar where you can see it |
| `print` | A line in the script's log, with the bar's time | A trace over a range of bars, and the first-offender pattern |

## Start with the question, not the tool

Three questions, in this order, solve most of it.

1. **Is the value absent, or is it wrong?** Absent and wrong are different bugs
   with different causes. Absence usually comes from warmup, from a gap in the
   data, or from a branch that did not run. A wrong number usually comes from
   arithmetic, from an off-by-one lookback, or from state that was updated in
   the wrong order.
2. **On which bar does it first go wrong?** Not "it looks wrong on the right of
   the chart". The first bar. Everything after the first wrong bar is a
   consequence.
3. **What did the inputs to that line hold on that bar?** Once you have the bar,
   you can print everything that feeds the line and compare against arithmetic
   you do by hand.

## Making a value visible

### Plot it

The fastest look at any intermediate value is a plot. Two things get in the way
and both have a one line fix.

**A bool cannot be plotted.** There is no truthiness and no conversion from
`bool` to `number`, so write the conversion out. It is also a chance to
distinguish "false" from "absent", which is the distinction that matters:

```
r = rsi(close, 14)
hot = r > 70

// Three states, three values: 1 for true, 0 for false, and a gap for absent.
// Plotting orElse(hot, false) would draw a confident zero through the whole
// warmup, which is the thing this plot exists to catch.
plot(isNone(hot) ? none : (hot ? 1 : 0), "debug: hot", fuchsia, style = "step")
```

**A debug plot on a price overlay ruins the price scale.** A value of 0.3 on a
pane whose prices are in the thousands flattens everything. Put debug plots on
the other scale, or work in a second, non-overlay copy of the study:

```
study("Bands, with debug", overlay = true, precision = 2)
// ...
plot(dev, "debug: deviation", fuchsia, scale = "left")
```

Delete debug plots before you publish. Each one occupies a legend row and a
settings group, and a plot that is absent on every bar earns warning OS8009.

### Paint the bars

`background` and `barColor` answer "which bars" faster than any plot, because
you read them without looking at a scale. The single most useful debugging line
in the language is this one:

```
// Every bar where the value is absent is shaded. Run this once on any study
// whose line has a hole in it and the cause is usually obvious immediately:
// a block of shading at the left edge is warmup, a stripe in the middle is a
// gap in the data or a branch that did not run.
background(isNone(value) ? fade(red, 85) : none)
```

The same trick shows which bars a branch ran on:

```
taken = false
if forming and not session.isFirstBar
    rangeHigh = max(rangeHigh, high)
    taken = true

background(taken ? fade(aqua, 90) : none)
```

`taken` is declared before the `if` on purpose: a name first assigned inside a
block is local to that block, so assigning it only inside would put it out of
reach of the `background` call (OS2001).

### Write a debug panel

A table is the closest thing to a variable inspector. Declare it at the top
level, because the pane has to reserve room for it before bar 0, and write the
cells only on the newest bar, because a panel shows one state and writing it
fifty thousand times to display the last one is fifty thousand wasted writes.

```
version 1

study("Bands, with a debug panel", overlay = true, precision = 2)

length    = input(20,   "Length", min = 2, max = 500)
widthDev  = input(2.0,  "Band width", min = 0.1, max = 10)
showPanel = input(true, "Show the debug panel")

basis = sma(close, length)
dev   = widthDev * stdev(close, length)
upper = basis + dev
lower = basis - dev

// Declared unconditionally. A table inside an if is OS3006, for the same
// reason a plot is: the grid is part of the study's fixed shape.
panel = table("Debug", 6, 2, position = "topRight",
              textColor = silver, bgColor = fade(black, 25))

// One place that decides what an absent value looks like. A blank cell and a
// zero are both wrong: the first hides that the study is warming up, the
// second invents a number.
fn show(value, decimals) => isNone(value) ? "absent" : text(value, decimals)

if showPanel and bar.isLast
    cell(panel, 0, 0, "bar.index")
    cell(panel, 0, 1, text(bar.index, 0))
    cell(panel, 1, 0, "bar.updates")
    cell(panel, 1, 1, text(bar.updates, 0))
    cell(panel, 2, 0, "confirmed")
    cell(panel, 2, 1, bar.isConfirmed ? "yes" : "no")
    cell(panel, 3, 0, "basis")
    cell(panel, 3, 1, show(basis, 4))
    cell(panel, 4, 0, "dev")
    cell(panel, 4, 1, show(dev, 4))
    cell(panel, 5, 0, "upper")
    cell(panel, 5, 1, show(upper, 4))

plot(basis, "Basis", orange, width = 2)
```

`bar.updates` and `bar.isConfirmed` are in that panel deliberately. On a live
chart they are the two facts that explain most "it worked in the backtest"
reports, and they cost two rows.

### Print a trace

`print(value)` writes one line to the script's log with the bar's time attached.
It is the tool for a range of bars rather than a single one, and it has three
rules worth knowing before you use it.

**Build the string with `text()`.** `+` concatenates two strings and does
nothing else, so `"rsi " + r` is OS2003 at compile time. And `"a" + none` is
`none`, so a line built from an absent value is itself absent. `text(none)` is
the string `"none"`, which is why the conversion is also the fix:

```
// Wrong: + joins two strings and nothing else, so this is OS2003.
print("rsi " + r)

// Right, and it keeps working during warmup: text(x) with no decimals accepts
// any value and renders an absent one as the word none, so a trace line is
// never silently lost to absence propagating through the concatenation.
print("bar " + text(bar.index, 0) + " rsi " + text(r) + " close " + text(close, 2))
```

The two argument form, `text(x, decimals)`, is for a number and is what you want
for a value you know is present. For anything that can be absent, either use the
one argument form or pass it through a helper that decides what absence looks
like, which is the `show` function in the panel above.

**Guard it.** An unguarded `print` writes one line per bar per run. The host
rate limits the log and must say how many lines it dropped, but a trace you have
to scroll through is barely better than no trace. Print a window:

```
fromBar = input(240, "Trace from bar", min = 0)
toBar   = input(260, "Trace to bar",   min = 0)

if bar.index >= fromBar and bar.index <= toBar
    print("bar " + text(bar.index, 0) +
          " time " + date.format(time, "yyyy-MM-dd HH:mm") +
          " close " + text(close, 2) +
          " basis " + text(basis, 6) +
          " dev " + text(dev, 6))
```

**Remember the bar may run more than once.** On the newest bar of a live chart
the script re-executes on every update, so an unguarded print on `bar.isLast`
produces a line per tick. Add `and bar.isConfirmed` when you want one line per
bar.

## Stepping, when there is no stepper

Stepping through a per-bar script means one of three things, and they are worth
keeping apart.

**Stepping through the bars.** Restrict the trace to a window of two or three
bars, as above, and read the log. Widen the window until you can see the bar
where a value changes in a way you did not expect. This is the real equivalent
of a stepper and it is usually five lines.

**Stepping through the lines of one bar.** Print the intermediate values in
source order on one chosen bar. Because execution is strictly top to bottom with
no callbacks, a printed list of intermediates in source order *is* a stack
trace of that bar:

```
watchBar = input(-1, "Dump state on this bar index, -1 for none")

if bar.index == watchBar
    print("1 src " + text(close, 6))
    print("2 basis " + text(basis, 6))
    print("3 dev " + text(dev, 6))
    print("4 upper " + text(upper, 6))
    print("5 prevUpper " + text(upper[1], 6))
```

**Watching the state carried between bars.** Print the `var` before and after
the block that updates it. Reading a `var` before it is reassigned gives the
previous bar's value, which is exactly the thing you want to see:

```
var stop = none

before = stop                       // what the previous bar left
if long
    stop = max(orElse(stop, lo), lo)

if bar.index >= fromBar and bar.index <= toBar
    print("bar " + text(bar.index, 0) +
          " stop in " + text(before) + " out " + text(stop))
```

## Inspecting one bar you can point at

When you can see the offending bar on the chart, pin its state to it. A label is
anchored to a time and a price, so it stays on that bar when more history loads
and every index shifts.

```
watchBar = input(-1, "Label this bar index, -1 for none")

if bar.index == watchBar
    draw.label(time, high,
               "bar " + text(bar.index, 0) + "\n" +
               "close " + text(close, 2) + "\n" +
               "basis " + show(basis, 4) + "\n" +
               "dev " + show(dev, 4),
               color = fade(black, 20), textColor = white)
```

Two cautions. A label created on the moving bar is subject to the rollback rule,
so it does not accumulate a duplicate per tick, which is what you want. And a
label persists until the script deletes it, so a condition that is true on a
thousand bars leaves a thousand labels: guard it tightly, or call
`draw.deleteAll()` at the top of the bar while you are experimenting.

## Breaking on a condition

There is no breakpoint, so a break becomes a guard around a dump. The pattern is
the same whatever the condition is: state the condition as a bool at the top
level, then hang the output off it.

```
// Break when the value moves further in one bar than it plausibly can.
jump = input(5.0, "Report a one bar move larger than this", min = 0)

moved = not isNone(basis) and not isNone(basis[1]) and abs(basis - basis[1]) > jump

if moved
    print("jump at " + date.format(time, "yyyy-MM-dd HH:mm") +
          " from " + text(basis[1], 6) + " to " + text(basis, 6) +
          " close " + text(close, 2) + " volume " + text(volume))
    background(fade(red, 70))
```

Note both `isNone` tests. Without them the comparison is absent during warmup,
an absent condition takes the false branch, and the break silently never fires
on the bars most likely to be the problem. That is worth saying twice: **a guard
written without thinking about absence fails exactly where you need it.**

## Narrowing a wrong number to the bar it first goes wrong on

This is the method the rest of the page is in service of.

### The first-offender pattern

Keep one persistent value. Record the first bar the disagreement appears on, and
print it once. Everything after that bar is downstream.

```
version 1

study("Where does it first disagree", precision = 6)

tolerance = input(0.000001, "Tolerance", min = 0)

mine      = myCalculation(close, 20)
reference = sma(close, 20)

// Both must be present before a comparison means anything. Comparing while one
// is absent gives an absent result, the branch is skipped, and the first true
// disagreement after warmup would be reported as the first one of all.
comparable = not isNone(mine) and not isNone(reference)
disagrees  = comparable and abs(mine - reference) > tolerance

var firstBadTime = none
var firstBadBar  = none

if disagrees and isNone(firstBadTime)
    firstBadTime = time
    firstBadBar  = bar.index
    print("first disagreement at " + date.format(time, "yyyy-MM-dd HH:mm") +
          " bar " + text(bar.index, 0) +
          " mine " + text(mine, 10) +
          " reference " + text(reference, 10) +
          " difference " + text(mine - reference, 10))

plot(mine, "Mine", aqua)
plot(reference, "Reference", orange)
plot(comparable ? mine - reference : none, "Difference", fuchsia, scale = "left")

fn myCalculation(src, len) =>
    total = 0.0
    for i = 0 to len - 1
        total += src[i]
    total / len
```

`firstBadTime` holds a time rather than a bar index on purpose: a bar index is a
position in the data the engine was given, and loading more history renumbers
every bar. Keeping an index in a persistent value earns warning OS8014 for that
reason. The index is printed, because inside one run it is the number you type
into `watchBar`, and it is not kept.

### Bisecting the script

When the first-offender pattern tells you the bar but not the line, halve the
script rather than staring at it.

1. Take the wrong output and the bar it first goes wrong on.
2. Plot, or print, the value halfway up the dependency chain on that bar.
3. If the halfway value is right, the bug is below it. If it is wrong, the bug
   is above it. Repeat.

Four rounds of this covers a sixteen line dependency chain, which is longer than
most scripts have. It beats reading, because reading finds the bugs you can
imagine and bisection finds the one that is actually there.

### Bisecting the inputs

If the value is wrong for one setting and right for another, the shortest path
is often the input rather than the code. Set the length to 2, or 1 if the
function allows it, and work the arithmetic out by hand. Most off-by-one bugs in
a lookback are visible at length 2 and invisible at length 20.

## Six bugs that look like other bugs

| Symptom | Usual cause | Confirm it by |
|---|---|---|
| The line never draws at all | The plotted value is absent on every bar (OS8009), or a name was never assigned what it was meant to hold | `background(isNone(value) ? fade(red, 85) : none)` |
| The line has a hole in the middle | One absent bar propagated through the arithmetic, or a stateful call inside a branch that did not run (OS8001) | Print the inputs on the first bar of the hole |
| The line is flat near the left edge, then correct | Warmup, read wrongly: something applied `orElse(x, 0)` and drew a confident zero | Remove the `orElse` and look for the gap |
| A counter stays absent for ever | `x = x[1] + 1` with no `var`: `x[1]` is absent on bar 0 and absence propagates | Replace with `var x = 0` |
| Right in the backtest, different live | The moving bar. A `live var`, an unguarded accumulation, or a signal on an unconfirmed bar | Put `bar.updates` and `bar.isConfirmed` in a debug panel |
| The numbers change when you scroll back | A stored `bar.index` (OS8014), or a higher timeframe read in `"lookahead"` mode | Search the file for `bar.index` in a `var` and for `mode =` |

## Read the error, then read the catalogue

Every diagnostic carries a stable code, a line, a column, a message and a fix,
and a diagnostic that cannot state a fix is treated as a defect in the
diagnostic. When you get a code, look it up in
[`../../spec/errors.md`](../../spec/errors.md): each entry gives the cause, the
reason the rule exists, and a before and after pair that is usually your exact
situation in four lines.

Warnings deserve the same treatment. OS8001, OS8004, OS8010, OS8014 and OS8015
each describe a shape that is nearly always a bug, and each of them has cost
somebody an afternoon of the debugging this page describes. Clearing a warning
is cheaper than the session it saves you.

## The loop, written out

1. **Fix the data.** Debug on a dataset that does not change under you. A moving
   dataset turns a reproducible bug into a mystery.
2. **Reproduce it once.** Know the symptom precisely: which plot, which bar,
   what value you expected.
3. **Find the first wrong bar** with the first-offender pattern.
4. **Dump the state of that bar** with a guarded print or a label.
5. **Form one hypothesis** and change one thing.
6. **Re-run and compare.** If the change did nothing, put it back before trying
   the next one. Two speculative changes at once is how a small bug becomes two
   small bugs.
7. **Write the test** that would have caught it, while you still remember what
   it was.

## See also

- [testing.md](./testing.md) for turning step 7 into something you can re-run
- [profiling.md](./profiling.md) for when the script is correct but slow
- [limits.md](./limits.md) for the errors that are a budget rather than a bug
- [style-guide.md](./style-guide.md) for the shapes that cause these bugs
- [publishing.md](./publishing.md) for stripping a debug harness before release
- [../../spec/errors.md](../../spec/errors.md) for every code, its cause and its fix
- [../../spec/language.md](../../spec/language.md) for the absent value and the rollback rule
