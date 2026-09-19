# Drawing and output functions

By the end of this page you will be able to put anything a study computes onto
the chart: a plotted column, a shaded band, a fixed level, a marker on a bar,
recoloured candles, a pane background, a pinned panel, free drawings you move
and delete, and an alert.

## What may appear where

This is the first thing to get right, because the compiler enforces it.

| Call | Where it may appear | Why |
|---|---|---|
| `plot`, `plotCandles`, `fill`, `level`, `table` | Top level only | They define the fixed shape of the study: the set of columns, bands, levels and grids has to be known before bar 0 so the legend, the axis and the settings dialog can exist |
| `signal`, `barColor`, `background`, `cell`, `clear`, `print`, `alert`, every `draw` call | Anywhere | They are per-bar events or per-bar paint |

A `plot` inside an `if` is OS3006. Hide a plot on some bars by giving it `none`,
never by wrapping it:

```
plot(trending ? ema20 : none, "EMA 20", aqua)   // correct
if trending
    plot(ema20, "EMA 20", aqua)                 // OS3006
```

Those statements are read once, when the program is compiled, even though they
sit in the per-bar body of the file. Their **arguments** are still evaluated on
every bar, which is how a plot gets a new value per bar.

**Absence reaching any drawing surface is a gap, never a zero.** A plot breaks
its line, a fill stops, a level is not drawn, a bar keeps its own colour, a
table cell is blank. That is what makes plotting `none` the way to hide
something.

---

## 1. Plots, bands and levels

### `plot(value, title, color = ..., width = 1.5, style = "line", offset = 0, overlay = none, precision = none, format = none, scale = "right")`

Draw a column of numbers.
Parameters: `value` `series number` required; `title` `string` required;
`color` `color` or `series color`, default the host's next style colour; `width`
`number` default `1.5`; `style` `string` default `"line"`; `offset` `number`
default `0`; `overlay` `bool` default `none`; `precision` `number` default
`none`; `format` `string` default `none`; `scale` `string` default `"right"`.
Returns `plot`, a handle `fill` can name.

```
plot(ema(close, 21), "EMA 21", orange, width = 2)
```

`style` accepts `"line"`, `"lineWithMarkers"`, `"step"`, `"area"`, `"histogram"`
and `"column"`. These are the styles that make sense for a single column of
values, and they are the same set the host's own style menu offers, so a user
can change any plot's style after the fact without editing the script.

The returned handle is a compile-time value. It cannot be stored in a `var` or
passed to a function; it exists so that `fill` can name two plots.

**A constant colour and a per-bar colour are the same argument.** Pass a `color`
and it lands on the plot's style; pass a `series color` and it lands on the
per-bar colour callback instead. One argument covers both because a script that
starts with one colour and later wants two should not have to move to a
different function.

```
plot(macdHist, "Histogram", color = macdHist > 0 ? lime : red, style = "histogram")
```

`offset` shifts only where the column is drawn, never what it holds. A positive
offset puts the last values in the margin past the newest bar, which is what a
displaced cloud or a projected channel wants; a negative offset draws a value
back at the bar it describes, which is how a pivot marker lands on the pivot.

`precision` and `format` set the formatting of the **price scale** the plot maps
to, so setting them on a plot drawn over the price pane reformats the
instrument's own axis. That is almost never wanted, and the compiler says so
with warning OS8007.

### `plotCandles(open, high, low, close, title, colorUp = lime, colorDown = red, wickColor = none, borderColor = none)`

Draw bar-shaped output: a smoothed or higher timeframe candle.
Parameters: `open`, `high`, `low`, `close` each `series number` required;
`title` `string` required; `colorUp` `color` default `lime`; `colorDown` `color`
default `red`; `wickColor` `color` default `none`; `borderColor` `color` default
`none`.
Returns `plot`.

```
plotCandles(smoothOpen, smoothHigh, smoothLow, smoothClose, "Smoothed")
```

### `fill(plotA, plotB, color = ..., colorUp = none, colorDown = none, opacity = 0.12, overlay = none)`

Shade the region between two plots.
Parameters: `plotA` `plot` required; `plotB` `plot` required; `color` `color` or
`series color`, default the host's next fill colour; `colorUp` `color` default
`none`; `colorDown` `color` default `none`; `opacity` `number` default `0.12`;
`overlay` `bool` default `none`.
Returns `fill`.

```
fill(upper, lower, fade(aqua, 92))
```

Give `colorUp` and `colorDown` instead of `color` when the band should say which
of the two plots is on top: the region is painted with the first colour where
`plotA` is above `plotB` and the second where it is below.

### `level(price, title = "", color = gray, style = "dashed", width = 1)`

A fixed reference line in the study's pane.
Parameters: `price` `number` or `series number` required; `title` `string`
default `""`; `color` `color` default `gray`; `style` `string` default
`"dashed"`; `width` `number` default `1`.
Returns `level`.

```
level(70, "Overbought", red)
```

The price may be data-derived, such as the previous day's high, because the
contract recomputes levels after every calculation. A level is the right choice
when the line is a threshold the study is judged against; a plot is the right
choice when the line is a measurement.

---

## 2. Markers, paint, panels and the log

### `signal(text, color = none, at = "above", shape = "label")`

A named marker on this bar.
Parameters: `text` `string` required; `color` `color` default `none`; `at`
`string` default `"above"`; `shape` `string` default `"label"`.
Returns nothing.

```
if crossUp(fast, slow)
    signal("BUY", color = lime, at = "below", shape = "triangleUp")
```

`signal` is the whole of shape plotting: one call, one named marker on the bar,
in place of a plot call with six positional arguments choosing a shape, a
location and an offset.

| Argument | Accepts |
|---|---|
| `at` | `"above"` (the default), `"below"`, `"price"` |
| `shape` | `"label"`, `"arrowUp"`, `"arrowDown"`, `"triangleUp"`, `"triangleDown"`, `"circle"`, `"square"`, `"diamond"`, `"cross"`, `"flag"` |

Say where the marker goes. A call that names no `at` sits above the bar whatever
its text says, and no value places it by reading that text, because a marker
whose position depends on its own text reads differently on two engines.

`at`, `shape` and `color` are part of the marker's declaration, which is fixed
before bar 0, so each must be a compile-time constant: a literal or an
`input()`. A bar-dependent one is OS3003. Only the `text` is read per bar.

A signal does not fire on a bar that is still moving unless the declaration sets
`onUnconfirmed = true`. The deferred call fires when the bar closes, and if the
condition is no longer true by then it never fires at all. That is what makes a
marker on a live chart worth looking at.

### `barColor(color)`

Recolour the instrument's own candles on this bar.
Parameters: `color` `color` or `none` required.
Returns nothing.

```
barColor(trend > 0 ? lime : trend < 0 ? red : none)
```

### `background(color)`

Shade the whole height of this bar's column, behind everything else.
Parameters: `color` `color` or `none` required.
Returns nothing.

```
background(session.isIn("0915-0930") ? fade(yellow, 92) : none)
```

`background(none)` and `barColor(none)` leave the bar alone, which is how a
conditional paint switches itself off. Passing an absent colour is not an error,
and it is the reason neither call needs an `if` around it.

### `table(title, rows, cols, position = "topRight", textColor = none, bgColor = none, borderWidth = 0)`

Declare a grid pinned to a corner of the pane.
Parameters: `title` `string` required; `rows` `number` required; `cols` `number`
required; `position` `string` default `"topRight"`; `textColor` `color` default
`none`; `bgColor` `color` default `none`; `borderWidth` `number` default `0`.
Returns `table`.

```
panel = table("Readings", 4, 2, position = "topRight", textColor = silver)
```

### `cell(t, row, col, text, textColor = none, bgColor = none, align = "left")`

Write one cell on this bar.
Parameters: `t` `table` required; `row` `number` required; `col` `number`
required; `text` `string` required; `textColor` `color` default `none`;
`bgColor` `color` default `none`; `align` `string` default `"left"`.
Returns nothing.

```
cell(panel, 0, 0, "RSI", textColor = white)
```

### `clear(t)`

Empty every cell, so a table can be rebuilt from scratch.
Parameters: `t` `table` required.
Returns nothing.

```
clear(panel)
```

`clear` also has an array form, `clear(arr)`, documented in
[collections.md](./collections.md). The checker picks the signature from the
argument's type.

### `print(value)`

Write a value to the script's log with the bar's time.
Parameters: `value` any type.
Returns nothing. Nothing is drawn.

```
print("Entry " + text(close, 2) + " at " + date.format(time, "yyyy-MM-dd HH:mm"))
```

`print` writes to the per-script log, not to the chart. It is rate limited by
the host rather than by the language, and a host that drops lines must say how
many it dropped rather than truncating silently, so a log that looks short is
telling you it is short.

---

## 3. Alerts

### `alert(message, id = "", title = "", frequency = "oncePerBar")`

Raise a named alert on this bar.
Parameters: `message` `string` required; `id` `string` default `""`; `title`
`string` default `""`; `frequency` `string` default `"oncePerBar"`.
Returns nothing.

```
if crossUp(fast, slow)
    alert("Fast crossed above slow at " + text(close, 2), id = "cross-up")
```

| `frequency` | Means |
|---|---|
| `"oncePerBar"` | At most one alert per bar, the default |
| `"once"` | The first time only, for the life of this study instance |
| `"everyUpdate"` | On every execution of the bar; requires `onUnconfirmed = true`, or OS3009 |

`alert()` is the only function in this group, and that is not an omission: a
condition is an ordinary `if` in this language, so an alert needs nothing beyond
a way to say what to send. The compiler lifts each call site into one watched
condition whose predicate is the chain of guards that reaches the call, and the
host's runtime then watches the study rather than the script polling anything.

That lifting is why `id` matters: it is the stable name of that entry, so a
user's alert subscription survives an edit to the script. With no `id` the
compiler derives one from the call's position, which changes the moment a line
is inserted above it, and says so with warning OS8008.

Alerts follow the same confirmation rule as signals, and adding a study to a
chart that already holds history fires nothing for those bars. An alert is a
statement about now, and a study added at noon that emitted four hundred
historical alerts would be useless.

### `notify(message, channel)` (planned)

Send an alert somewhere the host has configured.
Parameters: `message` `string` required; `channel` `string` required.
Returns nothing. Lands in the host's routing rather than on the chart.

```
notify("Stop hit on " + chart.symbol, "desk")
```

---

## 4. The `draw` namespace

Objects a script creates and then mutates over time, rather than a column of one
value per bar. They are anchored to a time and a price, so an object stays where
it was put when more history is loaded and every bar index shifts underneath it.

**An object persists until the script deletes it.** There is no cap on how many
a script may create; the only budget is memory, and a host that cannot hold them
must say so rather than dropping the oldest. A study that silently loses its
oldest zone is a study whose picture depends on how long you have been looking
at it.

An object created on a bar that is then re-executed is subject to the rollback
rule: the object set is restored to what it was at the end of the previous bar
before the moving bar runs again, so a live chart does not accumulate one
duplicate line per tick.

### Creating

### `draw.line(t1, p1, t2, p2, color = gray, width = 1, style = "solid", extendLeft = false, extendRight = false)`

A trendline between two points.
Parameters: `t1` `number` required; `p1` `number` required; `t2` `number`
required; `p2` `number` required; `color` `color` default `gray`; `width`
`number` default `1`; `style` `string` default `"solid"`; `extendLeft` `bool`
default `false`; `extendRight` `bool` default `false`.
Returns `line`.

```
trend = draw.line(time[20], low[20], time, low, color = lime, extendRight = true)
```

### `draw.label(t, p, text, color = none, textColor = white, align = "center", tooltip = "")`

A plate of text at a point.
Parameters: `t` `number` required; `p` `number` required; `text` `string`
required; `color` `color` default `none`; `textColor` `color` default `white`;
`align` `string` default `"center"`; `tooltip` `string` default `""`.
Returns `label`.

```
tag = draw.label(time, high, text(close, 2), color = fade(navy, 40))
```

### `draw.box(t1, p1, t2, p2, color = none, fillColor = none, opacity = 0.12, width = 1, text = "", textColor = white, tooltip = "")`

A zone: supply, demand, an opening range.
Parameters: `t1` `number` required; `p1` `number` required; `t2` `number`
required; `p2` `number` required; `color` `color` default `none`; `fillColor`
`color` default `none`; `opacity` `number` default `0.12`; `width` `number`
default `1`; `text` `string` default `""`; `textColor` `color` default `white`;
`tooltip` `string` default `""`.
Returns `box`.

```
zone = draw.box(time, rangeHigh, time, rangeLow, fillColor = aqua)
```

### `draw.polyline(times, prices, color = gray, width = 1, closed = false, fillColor = none, opacity = 0.12)`

A path or a closed shape through many points.
Parameters: `times` `array<number>` required; `prices` `array<number>` required;
`color` `color` default `gray`; `width` `number` default `1`; `closed` `bool`
default `false`; `fillColor` `color` default `none`; `opacity` `number` default
`0.12`.
Returns `polyline`.

```
path = draw.polyline(swingTimes, swingPrices, color = orange)
```

It takes two parallel arrays rather than an array of points because version 1
has no record type. It arrives in its natural shape when `type` does, and the
compatibility promise means this form keeps working when it does.

### Mutating, deleting and counting

| Call | Returns | For |
|---|---|---|
| `draw.setFrom(obj, t, p)` | nothing | Move a line's or box's first anchor |
| `draw.setTo(obj, t, p)` | nothing | Move its second anchor |
| `draw.setBounds(obj, t1, p1, t2, p2)` | nothing | Move both anchors in one call |
| `draw.setAt(label, t, p)` | nothing | Move a label |
| `draw.setPoints(polyline, times, prices)` | nothing | Replace a polyline's path |
| `draw.setText(obj, text)` | nothing | Change a label's or box's caption |
| `draw.setColor(obj, color)` | nothing | Change the line or border colour |
| `draw.setTextColor(obj, color)` | nothing | Change the text colour |
| `draw.setFillColor(obj, color)` | nothing | Change a box's or polyline's fill |
| `draw.setWidth(obj, width)` | nothing | Change the line thickness |
| `draw.setStyle(obj, style)` | nothing | `"solid"`, `"dashed"` or `"dotted"` |
| `draw.setExtend(line, left, right)` | nothing | Continue a line to the pane edge |
| `draw.setTooltip(obj, text)` | nothing | Detail shown while the pointer rests on the object |
| `draw.delete(obj)` | nothing | Remove one object |
| `draw.deleteAll()` | nothing | Remove every object this script created |
| `draw.count()` | `number` | How many objects this script currently holds |

```
draw.setTo(zone, time, rangeLow)
draw.setText(tag, "high " + text(rangeHigh, 2))

if draw.count() > 200
    draw.deleteAll()
```

A setter given an object that has already been deleted is a runtime error
(OS4005) rather than a silent no operation, because a script mutating a deleted
object has lost track of its own state and will keep doing so, and every bar
after that point draws a picture the script does not believe in.

---

## 5. Three worked examples

### A study whose plots, band and levels are all declared once

```
version 1
study("Bands", overlay = true, precision = 2)

len  = input(20, "Length", min = 2, max = 500)
mult = input(2.0, "Deviation multiple", min = 0.1, max = 5)
show = input(true, "Show the fill")

b = bollinger(close, len, mult)

basis = plot(b[0], "Basis", fade(silver, 30))
upper = plot(b[1], "Upper", aqua)
lower = plot(b[2], "Lower", aqua)

fill(upper, lower, show ? fade(aqua, 92) : none)

// A level, not a plot: the zero line is a threshold rather than a measurement.
level(0, "Zero", gray)

barColor(close > b[1] ? lime : close < b[2] ? red : none)
```

### A zone that is created once and then grown

```
version 1
study("Opening range zone", overlay = true)

minutes = input(15, "Range length, in minutes", min = 1, max = 240)

var rangeHigh = none
var rangeLow  = none
var zone      = none

elapsed = (time - session.startTime) / 60000
inRange = not isNone(elapsed) and elapsed < minutes

if session.isFirstBar
    rangeHigh = high
    rangeLow  = low
    // One object per session, created on the session's first bar and then
    // moved. Creating one per bar would leave a stack of boxes behind.
    zone = draw.box(time, high, time, low, fillColor = aqua, color = fade(aqua, 40))

if inRange and not isNone(zone)
    rangeHigh = max(rangeHigh, high)
    rangeLow  = min(rangeLow, low)
    draw.setBounds(zone, session.startTime, rangeHigh, time, rangeLow)

if not inRange and not isNone(zone)
    draw.setText(zone, "range " + text(rangeHigh - rangeLow, 2))
```

### A panel and a log line that agree

```
version 1
study("Panel", overlay = true)

panel = table("Readings", 3, 2, position = "bottomRight", textColor = silver)

r = rsi(close, 14)
a = atr(14)

fn show(value, decimals) => isNone(value) ? "warming up" : text(value, decimals)

if bar.isLast
    cell(panel, 0, 0, chart.symbol, textColor = white)
    cell(panel, 0, 1, chart.interval, textColor = white)
    cell(panel, 1, 0, "RSI")
    cell(panel, 1, 1, show(r, 1), textColor = r > 70 ? red : r < 30 ? lime : silver)
    cell(panel, 2, 0, "ATR")
    cell(panel, 2, 1, show(a, 2))

if bar.isLast and bar.isConfirmed
    print(chart.symbol + " RSI " + show(r, 1) + " ATR " + show(a, 2))
```

The panel is written only on the newest bar, because it shows one state and
writing it on every bar of history would cost fifty thousand writes to display
the last one. The rollback rule makes that safe on a live chart: the newest bar
re-executes on each update and rewrites the same cells with the same values.

## See also

- [color.md](./color.md) for `fade`, `mix` and what an absent colour means to each surface
- [series.md](./series.md) for the values these calls draw and for `time`, which anchors a drawing
- [string.md](./string.md) for building the text in a marker, a cell or a log line
- [input.md](./input.md) for the settings rows a plot generates and the ones a script declares
- [ta.md](./ta.md) for the indicators most of these examples plot
- [strategy.md](./strategy.md) for what a fill draws on the chart without any call at all
- [../../../spec/stdlib.md](../../../spec/stdlib.md) for the specification these entries are derived from
