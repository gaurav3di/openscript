# Your first study

By the end of this page you will have built a complete, configurable indicator
from an empty file, one addition at a time, and you will have seen the whole
script after every single addition.

## Contents

1. [What we are building](#what-we-are-building)
2. [Step 0. An empty study](#step-0-an-empty-study)
3. [Step 1. A value](#step-1-a-value)
4. [Step 2. A plot](#step-2-a-plot)
5. [Step 3. An input](#step-3-an-input)
6. [Step 4. A second plot](#step-4-a-second-plot)
7. [Step 5. A band between them](#step-5-a-band-between-them)
8. [Step 6. A signal marker](#step-6-a-signal-marker)
9. [The finished script](#the-finished-script)
10. [Three things to try next](#three-things-to-try-next)
11. [What went wrong, and why](#what-went-wrong-and-why)

---

## What we are building

A deviation band study. A moving average down the middle, a band a fixed number
of standard deviations above and below it, the region between them shaded, and a
marker on the bar where price closes back inside the band after having been
outside it.

There is a library call that would produce all three lines in one go. We are not
going to use it, because the point of this page is the additions, not the
indicator. Every step below is a change you make to the file, press Apply, and
look at. Seven steps, seven complete scripts.

## Step 0. An empty study

Start with the smallest file the compiler will accept. Two statements, and it
draws nothing at all.

```
version 1

study("Deviation bands", overlay = true, precision = 2)
```

Press Apply. A legend row appears saying "Deviation bands" and the chart is
otherwise unchanged. That is the correct result: a study with no drawing calls is
a valid study with nothing to draw.

The three things on that declaration line:

| Option | Value here | Effect |
|---|---|---|
| The title | `"Deviation bands"` | The name in the legend and in the picker. Required, and it is the first positional argument |
| `overlay` | `true` | Draw on the price pane. The default is `false`, which gives the study a pane of its own below the chart |
| `precision` | `2` | Two decimals on this study's own axis and in its legend. The default is 4 |

We set `overlay = true` because a band around price belongs on top of price. An
oscillator would leave it out.

## Step 1. A value

Add a calculation. Nothing is drawn yet, and that is deliberate: a value and its
drawing are two separate decisions, and separating them is what lets one value
feed a plot, a band, a marker and an order without being computed four times.

```
version 1

study("Deviation bands", overlay = true, precision = 2)

basis = sma(close, 20)
```

Press Apply and the chart still shows nothing new. You will, however, get warning
OS8010 on the line: `basis` is assigned and never read. A warning stops nothing,
the script runs, and in this case it is telling you the truth. It goes away in
the next step.

Two things are happening on that one line that are worth naming now.

**`basis` is a series.** It is not one number; it is one number per bar. The
engine computes it on every bar of the chart, oldest first, because the file is
the body of a per-bar loop. Because `basis` is assigned at the top level of the
file, it also has history: later on you could write `basis[1]` for the previous
bar's value.

**`basis` is absent for the first nineteen bars.** A twenty bar average cannot
exist until twenty bars do. It is not zero and it is not a partial average: it is
the absent value, written `none`, on bars 0 to 18, with a real number from bar 19
onward. Nothing needs to be done about that. It travels through the rest of the
script by itself and comes out at the other end as a line that starts at bar 19.

## Step 2. A plot

```
version 1

study("Deviation bands", overlay = true, precision = 2)

basis = sma(close, 20)

plot(basis, "Basis", orange, width = 2)
```

Apply, and an orange line appears down the middle of the price action, starting
twenty bars in from the left edge.

`plot(value, title, colour, ...)` draws one column of numbers. The arguments you
will use most:

| Argument | Default | For |
|---|---|---|
| `value` | required | The series to draw, one number per bar |
| `title` | required | The legend name, and the label in the settings dialog |
| colour | host picks one | A named colour such as `orange`, a hex literal such as `#ff8800`, or a call such as `fade(aqua, 90)` |
| `width` | `1.5` | Line thickness |
| `style` | `"line"` | `"line"`, `"lineWithMarkers"`, `"step"`, `"area"`, `"histogram"`, `"column"` |
| `offset` | `0` | Shift where the column is drawn, never what it contains |

Two rules about `plot` that are easier to learn now than to debug later.

**It must be at the top level of the file.** Not inside an `if`, not inside a
loop, not inside a function. The set of plotted columns has to be fixed before
bar 0 so that the legend row, the axis and the settings dialog can be built. A
`plot` inside a block is error OS3006.

**To hide it on some bars, give it `none`.** That is what the previous rule means
in practice. `plot(trending ? basis : none, "Basis", orange)` draws the line only
where `trending` is true, and leaves a gap everywhere else.

## Step 3. An input

A length hard-coded as `20` is a length you have to edit the file to change. An
input makes it a setting.

```
version 1

study("Deviation bands", overlay = true, precision = 2)

length = input(20, "Basis length", min = 2, max = 500)

basis = sma(close, length)

plot(basis, "Basis", orange, width = 2)
```

Apply, then open the study's settings. There is now a row labelled "Basis length"
with 20 in it and a stepper, and changing it redraws the line without recompiling
anything.

`input()` declares one tunable value and builds one row of the dialog. The kind
of control comes from the **type of the default value**, which is why the default
comes first and the label second:

| Written | Control | Type of the name |
|---|---|---|
| `input(20, "Length", min = 2, max = 500)` | Number field with a stepper | `number` |
| `input(true, "Show the band")` | Checkbox | `bool` |
| `input(aqua, "Band colour")` | Colour swatch | `color` |
| `input(close, "Source")` | Source picker over the prices [../spec/stdlib.md](../spec/stdlib.md) section 13.1 lists for a source input | `series number` |
| `input("fast", "Mode", options = ["fast", "slow"])` | Menu | `string` |
| `input("60", "Bias timeframe", kind = "interval")` | Interval menu | `string` |

Every kind also accepts `group`, which puts a heading above a set of rows, and
`tooltip`, which is where the sentence goes that the label was too short to hold.

Like `plot`, `input()` may only appear at the top level, and for the same reason:
the dialog is built once, before the first bar runs. An `input()` inside a block
is error OS3007. If you want a length that depends on something, read the input
at the top level and do the arithmetic below it.

While you are here, add the source as an input too. It costs one line and means
the study works on the typical price or on the high without an edit:

```
length = input(20,    "Basis length", min = 2, max = 500)
src    = input(close, "Source")

basis = sma(src, length)
```

## Step 4. A second plot

Now the bands. A standard deviation over the same window, multiplied by a second
input, added to and subtracted from the basis.

```
version 1

study("Deviation bands", overlay = true, precision = 2)

length = input(20,    "Basis length", min = 2, max = 500)
mult   = input(2.0,   "Band width, in deviations", min = 0.1, max = 10)
src    = input(close, "Source")

basis = sma(src, length)
dev   = mult * stdev(src, length)

upper = basis + dev
lower = basis - dev

plot(basis, "Basis", orange, width = 2)
plot(upper, "Upper", fade(aqua, 30))
plot(lower, "Lower", fade(aqua, 30))
```

Apply. Three lines now, all starting at the same bar.

They start at the same bar because absence composes. `stdev(src, length)` has the
same warmup as `sma(src, length)`, both are absent on bars 0 to 18, and any
arithmetic involving an absent value is absent, so `upper` and `lower` are absent
there too and their plots simply begin where the data does. You never write any
warmup handling. It falls out of the rule.

`fade(aqua, 30)` is the aqua named colour at 30 percent transparency. Note which
way round that is: `fade` takes transparency, so 0 is solid and 100 is invisible.
The other convention is available as `withAlpha(colour, a)`, where `a` runs from
0 to 1 and 1 is opaque. Both exist because guessing wrong between them draws
something invisible, and an invisible line looks exactly like a broken script.

`mult` defaults to `2.0` rather than `2` deliberately. A number is a number in
this language, with no separate integer type, so either works. Writing `2.0`
tells the dialog and the next reader that a fractional value is expected here,
while `min = 0.1` is what actually enforces it.

## Step 5. A band between them

```
version 1

study("Deviation bands", overlay = true, precision = 2)

length = input(20,    "Basis length", min = 2, max = 500)
mult   = input(2.0,   "Band width, in deviations", min = 0.1, max = 10)
src    = input(close, "Source")
shade  = input(true,  "Shade the band")

basis = sma(src, length)
dev   = mult * stdev(src, length)

upper = basis + dev
lower = basis - dev

plot(basis, "Basis", orange, width = 2)
upperPlot = plot(upper, "Upper", fade(aqua, 30))
lowerPlot = plot(lower, "Lower", fade(aqua, 30))

fill(upperPlot, lowerPlot, shade ? fade(aqua, 92) : none)
```

Apply, and the region between the two outer lines is shaded.

`fill(plotA, plotB, colour)` names two plots, not two values. That is why the
two band lines are assigned to `upperPlot` and `lowerPlot` above: `plot` returns
a handle, and a handle is what `fill` takes. The band has no values of its own,
so the region is derived every bar from the two columns the plots already carry,
and the fill inherits their warmup without a guard. It is a separate call from
`plot` rather than an argument to it, because a band belongs to a pair of columns
and not to either one of them. See
[visuals/fills.md](./visuals/fills.md) for the rest of the band rules.

The interesting part of that line is the ternary. `shade` is a checkbox, and when
it is off, `fill` is handed `none` and draws nothing. That is the same rule as
hiding a plot: `fill` is top level only, so an `if` around it would be error
OS3006, and passing an absent colour is how a fill switches itself off. The same
trick works for `background(...)` and `barColor(...)`, which is how a conditional
paint turns itself off on the bars it does not want.

The band inherits its warmup from the two plots it sits between, so it also
starts at bar 19 with nothing special written.

## Step 6. A signal marker

The last addition is an event rather than a value. We want a marker on the bar
where price closes back inside the band after having been outside it.

```
version 1

study("Deviation bands", overlay = true, precision = 2)

length = input(20,    "Basis length", min = 2, max = 500)
mult   = input(2.0,   "Band width, in deviations", min = 0.1, max = 10)
src    = input(close, "Source")
shade  = input(true,  "Shade the band")
mark   = input(true,  "Mark re-entries")

basis = sma(src, length)
dev   = mult * stdev(src, length)

upper = basis + dev
lower = basis - dev

// crossDown is true on the bar where close was at or above upper and is now
// below it. The "at or above" is deliberate: two series that touch and separate
// report one cross rather than none, which matters on a coarse tick.
backInside  = crossDown(close, upper)
backAbove   = crossUp(close, lower)

plot(basis, "Basis", orange, width = 2)
upperPlot = plot(upper, "Upper", fade(aqua, 30))
lowerPlot = plot(lower, "Lower", fade(aqua, 30))

fill(upperPlot, lowerPlot, shade ? fade(aqua, 92) : none)

if mark and backInside
    signal("BACK INSIDE", red, at = "above", shape = "triangleDown")

if mark and backAbove
    signal("BACK INSIDE", lime, at = "below", shape = "triangleUp")
```

Apply. Small triangles appear on the bars where price re-enters the band.

`signal` is the whole of marker drawing: one call, one named marker on this bar.
Unlike `plot`, it may appear anywhere, because it is a per-bar event rather than
part of the study's fixed shape. Its arguments:

| Argument | Default | For |
|---|---|---|
| `text` | required | What the marker says |
| colour | none | The marker's colour |
| `at` | `"above"` | `"above"`, `"below"` or `"price"` |
| `shape` | `"label"` | One of the shapes the `signal` entry of [reference/functions/drawing.md](./reference/functions/drawing.md) lists |

Both calls above say where the marker goes, and yours should too: a call that
names no `at` sits above the bar whatever its text says, and no value places it
by reading that text, because a marker whose position depends on its own text
reads differently on two engines.

Notice that the two cross tests are computed at the top level, above the `if`
statements that use them. That is not style; it is the rule that catches more
beginners than any other. `crossDown` holds state from bar to bar, and a stateful
call written **inside** a branch only advances on the bars where that branch
runs, and is absent on the rest. The compiler warns about it as OS8001. Compute
it unconditionally, use the result inside the branch.

One more thing you get for free: `signal` does not fire on a bar that is still
moving. On a live chart the newest bar is executed again on every update, and a
marker that appeared and disappeared as price wobbled would be worse than no
marker. The call is deferred until the bar closes, and if the condition is no
longer true by then, it never happens at all.

## The finished script

Seven steps, and here is what each one added:

| Step | Added | Chart changed by |
|---|---|---|
| 0 | The declaration | A legend row, and a pane decision |
| 1 | A value | Nothing, plus a warning that nothing reads it |
| 2 | A plot | One line, starting at bar 19 |
| 3 | An input | One settings row, and a length you can change without editing |
| 4 | A second and third plot | Two more lines, same warmup |
| 5 | A fill | A shaded region, switchable from the dialog |
| 6 | Two signals | Markers on re-entry bars |

The whole file, which is what a finished study of this kind looks like:

```
version 1

study("Deviation bands", overlay = true, precision = 2)

length = input(20,    "Basis length", min = 2, max = 500)
mult   = input(2.0,   "Band width, in deviations", min = 0.1, max = 10)
src    = input(close, "Source")
shade  = input(true,  "Shade the band")
mark   = input(true,  "Mark re-entries")

basis = sma(src, length)
dev   = mult * stdev(src, length)

upper = basis + dev
lower = basis - dev

backInside = crossDown(close, upper)
backAbove  = crossUp(close, lower)

plot(basis, "Basis", orange, width = 2)
upperPlot = plot(upper, "Upper", fade(aqua, 30))
lowerPlot = plot(lower, "Lower", fade(aqua, 30))

fill(upperPlot, lowerPlot, shade ? fade(aqua, 92) : none)

if mark and backInside
    signal("BACK INSIDE", red, at = "above", shape = "triangleDown")

if mark and backAbove
    signal("BACK INSIDE", lime, at = "below", shape = "triangleUp")
```

Thirty lines, five settings, and no warmup handling anywhere in it.

Save it now. A save writes a revision with a number, a timestamp and the full
source, and a chart pins the revision it was added with, so from this point the
chart you are looking at is reproducible. That mechanism is
[editor-tour.md](./editor-tour.md).

## Three things to try next

**Colour the basis by slope.** A plot's colour argument accepts a constant colour
or a per-bar colour, and it is the same argument either way:

```
plot(basis, "Basis", basis > basis[1] ? lime : red, width = 2)
```

`basis[1]` is the previous bar's value, which is available because `basis` is
assigned at the top level of the file. On bar 19, the first bar the average
exists, `basis[1]` is absent, the comparison is absent, and the ternary takes its
false arm. If that matters to you, say so: `orElse(basis > basis[1], false)`.

**Show how far outside the band price has gone.** A second study, in its own
pane, reading the same idea as a percentage:

```
version 1

study("Band position", precision = 2, range = [0, 1])

length = input(20,  "Length", min = 2, max = 500)
mult   = input(2.0, "Width", min = 0.1, max = 10)

level(1, "Upper", fade(red, 40))
level(0, "Lower", fade(lime, 40))

plot(bbPercent(close, length, mult), "Position", purple, width = 2)
```

**Put the current reading in a corner.** A table is declared once at the top
level, like a plot, and written per bar. Writing it on the newest bar only is
worth the two extra words: a panel shows one state, and writing it fifty thousand
times to display the last one is fifty thousand wasted writes.

```
t = table("Bands", 2, 2, position = "topRight")

if bar.isLast
    cell(t, 0, 0, "Basis")
    cell(t, 0, 1, text(basis, 2))
    cell(t, 1, 0, "Width")
    cell(t, 1, 1, text(upper - lower, 2))
```

## What went wrong, and why

The errors this particular script attracts, in the order people hit them.

| Code | Written | Why it is refused |
|---|---|---|
| OS3006 | `plot` inside `if shade` | The set of columns is fixed before bar 0. Pass `none` instead |
| OS3007 | `input()` inside a block | The dialog is built once, before bar 0 |
| OS8001 | `stdev` computed inside an `if` | A stateful call in a branch advances only on that branch's bars |
| OS2003 | `"Width: " + (upper - lower)` | Nothing converts itself. Write `text(upper - lower, 2)` |
| OS1003 | One line of a block indented by five spaces instead of four | Every line of one block carries exactly the same leading whitespace |
| OS2002 | A second `length` inside a function | There is no shadowing. Rename it, or let the assignment update the outer one |
| OS8018 | An input added and not yet used | Use the name, or delete the row it puts in the dialog |

And the one that is not an error at all: **the first bars of your line are
missing**. They are meant to be. A twenty bar average has nothing honest to say
about bar 3, so it says nothing, and a gap is the visible form of that.

## See also

- [getting-started.md](./getting-started.md) for what happens between Apply and a line
- [first-strategy.md](./first-strategy.md) for turning this study into something that trades
- [editor-tour.md](./editor-tour.md) for autocomplete, inline errors and saving a revision
- [installing.md](./installing.md) for where this file now lives, and how to share it
- [../spec/stdlib.md](../spec/stdlib.md) for every function, its arguments and its exact warmup
- [../examples/README.md](../examples/README.md) for twelve complete scripts to read next
