# Labels, markers and shapes

By the end of this page you will be able to put text and marks on a chart with
the right one of the two calls that do it, anchor them above a bar, below a bar
or at a price, hang detail off them in a tooltip, and recognise the three cases
where a label is the wrong tool and something cheaper says it better.

## Two tools, and the difference matters

| | `signal(text, ...)` | `draw.label(t, p, text, ...)` |
|---|---|---|
| Is | A marker on this bar | An object you own |
| Anchored to | The bar it fired on, above it or below it | A timestamp and a price you choose |
| Lifecycle | None. It fires or it does not | Created, moved, retexted, deleted by you |
| Count | At most one per call site per bar | Whatever you create |
| On a moving bar | Deferred until the bar is confirmed | Drawn immediately, rolled back on re-execution |
| Lands in | One entry of the contract's markers | One object in the contract's free drawings |
| Costs | One channel, declared once | Memory, until you delete it |

The short version: **an event on a bar is a `signal`, a thing placed on the
chart is a `draw.label`.** A crossing, a breakout and a fill are events. The
reading pinned beside the last bar, and the caption on a zone, are things.

Choosing wrongly is not a style question. A `signal` has no lifecycle to get
wrong, no handle to go stale and no object count to cap, so every event marked
with a label instead of a signal is work you have taken on for nothing.

## signal: a named marker on this bar

```
signal(text, color = none, at = "auto", shape = "label", size = "normal")
```

`signal` is the whole of shape plotting. There is no separate call that plots a
triangle, no variant that plots it below the bar and no third variant that plots
it at a price. One call carries the text, the colour, the position and the
shape, because in an existing chart scripting language that surface is a single
function with six positional arguments whose order nobody remembers, and the
result is a line of code that cannot be read without the reference open.

| Argument | Takes | Notes |
|---|---|---|
| `text` | `string` | The marker's label and its payload. No text written on a bar means no marker on that bar |
| `color` | `color` | The plate colour. Absent means the host's default for a marker |
| `at` | `"auto"`, `"above"`, `"below"`, `"price"` | Where the marker sits relative to the bar |
| `shape` | `"label"`, `"arrowUp"`, `"arrowDown"`, `"triangleUp"`, `"triangleDown"`, `"circle"`, `"square"`, `"diamond"`, `"cross"`, `"flag"` | The mark itself |
| `size` | a named size | `"normal"` unless the host offers others |

With `at = "auto"` the marker sits above the bar when its text suggests a sell,
below when it suggests a buy, and above otherwise. That default is a
convenience for the common case and nothing more: **a script that cares says
which side it wants**, because the auto rule reads your text and your text may
not say what you think it says.

```
version 1

study("Crossing markers", overlay = true, precision = 2)

fastLen = input(9,  "Fast length", min = 1, max = 500)
slowLen = input(21, "Slow length", min = 1, max = 500)

// Both averages are computed unconditionally at the top level. Computing one
// inside the branch that uses it would advance its state only on the bars that
// branch was taken, which is warning OS8001 and a broken line.
fast = ema(close, fastLen)
slow = ema(close, slowLen)

plot(fast, "Fast", aqua,   width = 2)
plot(slow, "Slow", orange, width = 2)

// The side is stated rather than inferred from the word "BUY".
if crossUp(fast, slow)
    signal("BUY", color = lime, at = "below", shape = "triangleUp")

if crossDown(fast, slow)
    signal("SELL", color = red, at = "above", shape = "triangleDown")
```

### One call site, one marker

The compiler lifts each `signal()` call site into one entry of the contract's
markers, with its own stable identity. Two consequences follow, and both are
worth knowing before you meet them:

- **A call site that fires twice on one bar leaves the last text.** This can
  only happen inside a loop. One bar and one call site produce at most one
  marker, so a loop that signals per element marks the last element, not all of
  them. If you want one mark per element you want a drawing object per element,
  with the lifecycle that implies.
- **The marker layer is rebuilt from the script on every run.** A signal that
  stops firing because you changed an input leaves nothing behind. You never
  clear markers, and there is no marker equivalent of `draw.delete`.

### signal appears anywhere; plot does not

`plot`, `fill`, `level` and `table` must be at the top level, because the set of
plotted columns and grids is fixed before bar 0 so a legend and a settings
dialog can exist. A plot is hidden on a bar by plotting `none`, never by
wrapping it in an `if` (OS3006).

`signal` has no such rule. It is per-bar output, not part of the study's fixed
shape, so an `if` around it is the normal way to write it. Both of these are
legal and mean the same thing:

```
if breakout
    signal("BREAK")

signal(breakout ? "BREAK" : none)
```

The first is what most scripts write. The second is worth knowing because it is
the same rule at work: no text written for the bar means no marker, and an
absent text is the absence of an event, not an error.

### The moving bar

A signal does not fire on a bar that is still moving unless the declaration sets
`onUnconfirmed = true`. The call is deferred until the bar closes, and if the
condition that produced it is no longer true by then, it never happens at all.

That is the behaviour you want from a mark you are going to act on. A marker
that appears halfway through a bar and vanishes before the close is not
information; it is the chart showing you a condition that did not survive the
bar. If intrabar marking is genuinely the intent, the declaration says so in a
word a reviewer will see, and the script then guards itself with
`bar.isConfirmed` wherever it does not want the intrabar behaviour.

### Text during warmup

Marker text is a string, and the language has no implicit conversion, so a
number has to be converted before it can be concatenated. `"RSI " + r` is
OS2003. `"RSI " + text(r, 1)` compiles, and on a warmup bar it renders the word
`none` in the middle of your marker, because `text` of the absent value is the
string `"none"`.

One helper settles it for a whole script:

```
fn show(value, decimals) => isNone(value) ? "warming up" : text(value, decimals)
```

Keep marker text short regardless. A marker sits in the price area where the
candles are, and a forty character caption on every signal hides the thing the
study is about. Detail belongs in a tooltip, which is the next section but one.

## draw.label: a plate of text you own

```
draw.label(t, p, text, color = none, textColor = white, align = "center", tooltip = "")
```

A label is a drawing object with everything that implies: a handle, a lifecycle,
setters, and a deletion you are responsible for. Everything on
[lines-and-boxes.md](./lines-and-boxes.md) about anchoring, mutation, stale
handles and the rollback rule applies to labels without change.

| Setter | Changes |
|---|---|
| `draw.setAt(label, t, p)` | Where it sits |
| `draw.setText(label, text)` | Its caption |
| `draw.setColor(label, color)` | The plate colour |
| `draw.setTextColor(label, color)` | The text colour |
| `draw.setTooltip(label, text)` | The detail on hover |
| `draw.delete(label)` | Removes it |

The single most useful label in a study is the one pinned beside the newest bar
that says what the study currently reads. It is one object for the life of the
chart:

```
version 1

study("Current reading", overlay = true, precision = 2)

rsiLen = input(14, "RSI length", min = 2, max = 200)

oscillator = rsi(close, rsiLen)
band       = atr(14)

fn show(value, decimals) => isNone(value) ? "warming up" : text(value, decimals)

var tag = none

// Only the newest bar carries this label, so the work happens once per update
// rather than once per bar of history.
if bar.isLast
    caption = "RSI " + show(oscillator, 1)
    plate   = isNone(oscillator) ? gray : (oscillator > 70 ? red : (oscillator < 30 ? lime : silver))

    if isNone(tag)
        tag = draw.label(time, high + band, caption, color = plate, textColor = black)
    else
        // Moved and retexted, not recreated. A label per bar on a live chart is
        // a new object on every update that appends a bar.
        draw.setAt(tag, time, high + band)
        draw.setText(tag, caption)
        draw.setColor(tag, plate)
```

Note where `band` is computed. `atr(14)` holds state per call site and advances
only on the bars where it is executed, so calling it inside `if bar.isLast`
would give it one bar of history and an absent result. It is computed at the top
level and used inside the branch, which is the rule the compiler warns about
with OS8001 when a script gets it the wrong way round.

## Anchoring above or below a bar, or at a price

A signal takes a side: `"above"` or `"below"`, and the host places the marker
clear of the bar. A label takes a price, and the price is yours to compute.
There is no "above the bar" for a label, and there is no pixel offset anywhere
in the language.

That is deliberate. A pixel offset means one thing on a chart zoomed out to five
years and another on the same chart zoomed into an hour, and it means something
different again on an instrument that trades at 23.40 from one that trades at
72,000. An offset measured in the instrument's own volatility travels:

```
version 1

study("Pivot labels", overlay = true, precision = 2)

leftBars  = input(5,   "Pivot left bars",  min = 1, max = 50)
rightBars = input(5,   "Pivot right bars", min = 1, max = 50)
padding   = input(0.5, "Padding, in ATR",  min = 0, max = 5)
keep      = input(30,  "Labels to keep",   min = 1, max = 500)

pivotUp   = pivotHigh(high, leftBars, rightBars)
pivotDown = pivotLow(low,  leftBars, rightBars)

// One ATR read at the top level, used by both branches below.
pad = atr(14) * padding

var tags = []

if not isNone(pivotUp)
    push(tags, draw.label(time[rightBars], pivotUp + pad, text(pivotUp, 2),
                          color = red, textColor = white))

if not isNone(pivotDown)
    push(tags, draw.label(time[rightBars], pivotDown - pad, text(pivotDown, 2),
                          color = lime, textColor = black))

// Labels are objects, so they are capped like any other object.
if size(tags) > keep
    draw.delete(shift(tags))
```

Three things in that script are the point of it. The anchor time is
`time[rightBars]`, because a pivot is reported that many bars after it formed.
The padding is a multiple of `atr`, so the label clears the bar on any
instrument. And the list is capped, because a label is an object and an
uncapped object list is the one mistake that turns a good study into a slow
chart.

For a label that has to sit at a level rather than beside a bar, anchor it at
the level: `draw.label(time, rangeHigh, "Range high", ...)`. A label's anchor is
a price on the pane's own scale, so in a study with its own pane the anchor is
an oscillator reading, not a price.

## Tooltips

`tooltip` on the constructor, or `draw.setTooltip(obj, text)` later, attaches
detail that appears while the pointer rests on the object. Boxes and labels both
take one.

The division of labour is worth stating, because it is what keeps a chart
readable:

| Goes in the caption | Goes in the tooltip |
|---|---|
| What this is, in two or three words | The numbers behind it |
| The one value the eye needs | When it was created, how old it is |
| Nothing that changes every bar | Everything that changes every bar |

```
draw.setTooltip(zone, "Supply, " + text(zoneTop, 2) + " to " + text(zoneBottom, 2) +
                      ", " + text(age, 0) + " bars old")
```

A tooltip costs nothing visually, so it is where the detail you were tempted to
put in the caption belongs. It is also the only place a drawing object can say
something long without covering the chart.

## When a label is the wrong tool

| What you want to say | Use | Not a label, because |
|---|---|---|
| A value the chart has on every bar | `plot` | Fifty thousand labels is fifty thousand objects to say what one column says |
| An event on one bar | `signal` | A marker has no handle, no cap and no deletion to get wrong |
| The current state of six readings | `table` | A grid is pinned to a corner and never covers a candle |
| A regime that spans bars | `background` or `barColor` | A regime has no price, so it has no anchor |
| A price band over a stretch of time | `draw.box` | A box has the extent; a label at its corner is the caption, not the thing |
| A number you want to read off later | `print` | The log takes a value per bar without drawing anything |

The failure mode worth naming is the label per bar. It looks reasonable while
you are testing on two hundred bars and it is unusable on a real chart: the
labels overlap into a grey band, the chart slows down in proportion to the
history loaded, and the information was available as a column all along. If you
find yourself writing `draw.label` outside an `if`, stop and ask what the column
would be.

The second failure mode is the label used as a dashboard. Six labels stacked
above the last bar is a table that moves when price moves, obscures the candles
around it, and has to be repositioned by hand as the instrument's price changes.
A table is pinned to a corner, never overlaps anything, and takes the same
number of lines to write. That is [tables.md](./tables.md).

## Common mistakes

| Symptom | Cause | Fix |
|---|---|---|
| A marker on the wrong side of the bar | `at = "auto"` inferring from the text | State `at = "above"` or `at = "below"` |
| The marker says `RSI none` on early bars | `text()` of an absent value is the string `"none"` | Guard with `isNone` and say "warming up" |
| A marker appears and disappears during a bar | `onUnconfirmed = true` in the declaration | Remove it, or guard with `bar.isConfirmed` |
| One mark from a loop that should mark several | One call site emits one marker per bar | Draw an object per element instead |
| The label is inside the candle | Anchored at `high` with no padding | Anchor at `high + atr(14) * 0.5` |
| The label sits five bars right of its pivot | Anchored at `time` rather than `time[rightBars]` | Anchor at the bar the pivot formed on |
| The chart slows as history loads | One label per bar, or an uncapped list | Cap the list, or use a plot |
| OS2003 on the marker text | Concatenating a number to a string | `text(value, decimals)` |

## See also

- [overview.md](./overview.md) for the map of every drawing surface and what each one costs
- [lines-and-boxes.md](./lines-and-boxes.md) for the anchoring, mutation and lifecycle rules every label shares
- [tables.md](./tables.md) for the dashboard a stack of labels is trying to be
- [colors.md](./colors.md) for plate and text colours that stay legible on both chart themes
- [bar-coloring-and-backgrounds.md](./bar-coloring-and-backgrounds.md) for marking a stretch of bars rather than one
- [plots.md](./plots.md) for the column a label written on every bar should have been
- [../README.md](../README.md) for the rest of the documentation
- [../../spec/stdlib.md](../../spec/stdlib.md) sections 14.3 and 14.4 for the authoritative `signal` and `draw` reference
- [../../spec/language.md](../../spec/language.md) sections 7.5 and 15.3 for deferral on a moving bar and the drawing surfaces
- [../../examples/01-ema-cross.oscript](../../examples/01-ema-cross.oscript) for signals on a crossing
- [../../examples/04-rsi-divergence.oscript](../../examples/04-rsi-divergence.oscript) for labels anchored at a pivot
