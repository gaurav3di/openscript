# Lines, boxes and polylines

By the end of this page you will be able to create a drawing object, anchor it so
it stays where you put it, move and extend it as bars arrive, and delete it on a
rule, so that a study which draws across fifty thousand bars still holds a
handful of objects when it reaches the right edge.

## Why an object and not a plot

A `plot` is one value per bar. It is a column: the engine hands the chart a
number for every bar, the chart joins them up, and the shape you see is the
consequence of the numbers. You never position a plot, and you never delete one.

A drawing object is the other thing. It is a shape with its own anchors, created
on one bar, living across many, and removed when the script says so. It does not
correspond to a value per bar and cannot be expressed as one.

| You want | Use | Because |
|---|---|---|
| A value the chart has on every bar | `plot` | The chart already knows where to put it: bar by bar, at that bar's value |
| A line between two moments that are not adjacent | `draw.line` | Two anchors, and nothing to say about the bars between them |
| A rectangle covering a price band over a stretch of time | `draw.box` | It has a start, an end, a top and a bottom, none of which is per bar |
| A path through many points | `draw.polyline` | One shape, many anchors, optionally closed and filled |
| A fact about a bar with no price attached | `background` or `barColor` | See [bar-coloring-and-backgrounds.md](./bar-coloring-and-backgrounds.md) |

The test that settles it in practice: if you can write the thing down as a
number for every bar, plot it. A trailing stop is a plot. The line joining the
two swing highs that formed a divergence is not, because on the bars between
them there is no value to state.

## The four constructors

All of them live in the `draw` namespace and may appear anywhere a statement
may: inside an `if`, inside a loop, inside a function. They are not part of the
study's fixed shape, so they are on the anywhere list of
[`language.md`](../../spec/language.md) section 15.3 and the top-level rule
(OS3006) does not apply to them.

| Call | Returns |
|---|---|
| `draw.line(t1, p1, t2, p2, color = gray, width = 1, style = "solid", extendLeft = false, extendRight = false)` | `line` |
| `draw.label(t, p, text, color = none, textColor = white, align = "center", tooltip = "")` | `label` |
| `draw.box(t1, p1, t2, p2, color = none, fillColor = none, opacity = 0.12, width = 1, text = "", textColor = white, tooltip = "")` | `box` |
| `draw.polyline(times, prices, color = gray, width = 1, closed = false, fillColor = none, opacity = 0.12)` | `polyline` |

Labels are on this page only as objects with a lifecycle. What goes in them, how
they anchor above or below a bar, and when a label is the wrong tool are in
[labels-and-shapes.md](./labels-and-shapes.md).

`draw.polyline` takes two parallel arrays, one of times and one of prices,
rather than one array of points, because version 1 has no record type. That is
stated in the library reference rather than hidden: the call arrives in its
natural shape when `type` does, and until then the two arrays must be the same
length and are read index by index.

**The path is read once, at the call.** The polyline keeps its own copy, so
pushing to the arrays afterwards does not redraw it: `draw.setPoints` is how a
path changes, which is what the example at the end of this page does on every
swing.

## An anchor is a time and a price

**Every anchor is a timestamp in UTC milliseconds and a price on the pane's
scale.** Never a bar index, never a pixel, never an offset from the right edge.

The reason is in the execution model. `bar.index` is a position in the dataset
the engine was handed, so loading more history shifts every index; a script that
anchored at index 12,400 would find its line somewhere else entirely after the
chart paged in another year of bars. `time` does not move. The bar that opened
at a given instant opened at that instant no matter how much history sits to the
left of it.

The price side follows the pane the study draws in. An object created by an
overlay study is positioned on the instrument's own price scale. An object
created by a study with its own pane is positioned on that pane's scale, so a
divergence line drawn between two oscillator readings is anchored at 71.4 and
64.8, not at a price.

The pivot functions are where anchoring is usually got wrong, so here it is
done right:

```
version 1

study("Swing line", overlay = true, precision = 2)

leftBars  = input(5, "Pivot left bars",  min = 1, max = 50)
rightBars = input(5, "Pivot right bars", min = 1, max = 50)

pivot = pivotHigh(high, leftBars, rightBars)

var lastTime  = none
var lastPrice = none

if not isNone(pivot)
    // A pivot is reported rightBars bars after the bar it formed on, because
    // that is the first bar on which it is knowable. The anchor is therefore
    // that older bar's time and that older bar's price, not this bar's.
    pivotTime = time[rightBars]

    if not isNone(lastTime)
        draw.line(lastTime, lastPrice, pivotTime, pivot, color = orange, width = 2)

    lastTime  = pivotTime
    lastPrice = pivot
```

That script is correct about anchoring and wrong about lifecycle: it creates one
line per pivot and never removes any. The rest of this page is about the second
half.

## Move an object, do not draw a new one

A handle held in a `var` refers to the same object on the next bar. That is the
whole mechanism behind every well-behaved drawing study: create once, mutate
forever.

| Call | Moves or changes |
|---|---|
| `draw.setFrom(obj: line | box, t, p)` | A line's or box's first anchor |
| `draw.setTo(obj: line | box, t, p)` | Its second anchor |
| `draw.setBounds(obj: line | box, t1, p1, t2, p2)` | Both anchors in one call |
| `draw.setAt(label, t, p)` | A label's anchor |
| `draw.setPoints(polyline, times, prices)` | A polyline's whole path |
| `draw.setText(obj: label | box, text)` | A label's or box's caption |
| `draw.setColor(obj: line | label | box | polyline, color)` | The line or border colour |
| `draw.setTextColor(obj: label | box, color)` | The text colour |
| `draw.setFillColor(obj: box | polyline, color)` | A box's or polyline's fill |
| `draw.setWidth(obj: line | box | polyline, width)` | Line thickness |
| `draw.setStyle(obj: line, style)` | The line's style, one of those [`stdlib.md`](../../spec/stdlib.md) section 14.4 lists |
| `draw.setExtend(line, left, right)` | Whether the line continues to the pane edge |
| `draw.setTooltip(obj: label | box, text)` | The detail shown on hover |
| `draw.delete(obj: line | label | box | polyline)` | Removes one object |
| `draw.deleteAll()` | Removes every object this script created |
| `draw.count()` | How many objects this script currently holds |

Here is the pattern in full. Two dashed lines mark the previous session's high
and low, and there are exactly two of them on a chart of any length:

```
version 1

study("Previous session high and low", overlay = true, precision = 2)

var runningHigh = none
var runningLow  = none
var lastHigh    = none
var lastLow     = none
var highLine    = none
var lowLine     = none

// The session's own first bar rather than a date change, because an evening
// session that runs past midnight is one session and two dates.
if session.isFirstBar
    lastHigh    = runningHigh
    lastLow     = runningLow
    runningHigh = high
    runningLow  = low
else
    runningHigh = max(runningHigh, high)
    runningLow  = min(runningLow, low)

if not isNone(lastHigh)
    if isNone(highLine)
        // Created on the first bar that has a previous session to draw.
        highLine = draw.line(session.startTime, lastHigh, time, lastHigh,
                             color = red,  style = "dashed", extendRight = true)
        lowLine  = draw.line(session.startTime, lastLow,  time, lastLow,
                             color = lime, style = "dashed", extendRight = true)
    else
        // Moved on every bar after that. Redrawing instead would leave one
        // object per bar behind it, for the life of the chart.
        draw.setBounds(highLine, session.startTime, lastHigh, time, lastHigh)
        draw.setBounds(lowLine,  session.startTime, lastLow,  time, lastLow)
```

The `isNone(highLine)` test is doing the work of a constructor: the first time
through it builds, every time after it moves. A `var` initialised to `none` and
a test for absence is the idiom for "I have not made this yet" throughout the
language, and it is the same idiom as `barsSince` being absent before its
condition has ever been true.

## Extending into the future

The chart has empty space to the right of the newest bar. Two mechanisms reach
into it, and they are not the same.

**A line extends.** `extendRight = true` continues the line past its second
anchor to the edge of the pane, and keeps doing so as the pane scrolls.
`extendLeft = true` does the same to the left. `draw.setExtend(obj, left,
right)` changes it later. An extended line needs no maintenance: the anchors
still define its slope, and the extension is the chart's job.

**A box does not.** A box has four edges and no extend argument, so a box that
should reach the current bar has its right anchor moved there on every bar. That
is one `draw.setTo` call per bar against one object, which is cheap.

What neither of them can do in version 1 is project one bar past the newest bar,
because **nothing in the language exposes the interval between bars in
milliseconds**. `time - time[1]` looks like the answer and is wrong exactly
where it matters: it is the interval inside a session and the whole overnight
gap across one, and the right edge of a projected box is looked at hardest on
the first bar of a session. So a box's right edge is set to `time`, this bar's
own opening instant, and a line that must reach further extends instead.

```
version 1

study("Opening range box", overlay = true, precision = 2)

rangeMinutes = input(15, "Opening range, in minutes", min = 1, max = 240)
keepSessions = input(5,  "Sessions to keep",          min = 1, max = 60)

var openTime  = none
var rangeHigh = none
var rangeLow  = none
var zone      = none
var zones     = []

if session.isFirstBar
    openTime  = time
    rangeHigh = high
    rangeLow  = low
    // The previous session's box is not deleted here. It is simply let go of,
    // and the list below is what remembers it.
    zone      = none

// Milliseconds since the open rather than a wall clock comparison, so this
// script says the same thing in every timezone and needs no calendar.
elapsed = isNone(openTime) ? none : time - openTime
forming = not isNone(elapsed) and elapsed < rangeMinutes * 60000

if forming
    rangeHigh = max(rangeHigh, high)
    rangeLow  = min(rangeLow,  low)

    if isNone(zone)
        zone = draw.box(openTime, rangeHigh, time, rangeLow,
                        color = aqua, fillColor = aqua, opacity = 0.08)
        push(zones, zone)
        if size(zones) > keepSessions
            // shift returns the element it removes, so the oldest box is
            // deleted and forgotten in one line.
            draw.delete(shift(zones))
    else
        draw.setBounds(zone, openTime, rangeHigh, time, rangeLow)

else if not isNone(zone)
    // The range is complete: the top and the bottom are final and only the
    // right edge follows the session.
    draw.setTo(zone, time, rangeLow)
```

## The lifecycle discipline

**An object persists until the script deletes it.** There is no silent eviction
of the oldest, ever. The language fixes no number for how many a script may hold
at once; the budget is the host's memory, and a host that cannot hold another
one stops the bar with OS5010 and names the number rather than dropping objects
behind your back. That is a deliberate difference from the closed chart
scripting languages this one exists to replace, where a hard object limit is the
reason half the drawing studies in the wild are written the way they are.

The freedom costs you one obligation: **decide the lifecycle before you write
the constructor.** There are three shapes, and every correct drawing study is
one of them.

| Shape | Looks like | Object count | Use when |
|---|---|---|---|
| One object, moved forever | Create under `isNone(handle)`, `draw.set...` after | 1 per thing drawn | The thing always exists: a level, a channel, a session box |
| A capped list | `push` on create, `draw.delete(shift(list))` over the cap | Bounded by the cap | One object per event: zones, divergences, breakouts |
| Create and forget | A bare `draw.line(...)` on an event | One per event, forever | Never, unless the event count is provably small |

The third shape is what the swing line example above does. On a chart with two
thousand pivots it leaves two thousand lines, each of which the chart must hold,
hit-test and redraw on every pan. Turning it into the second shape is four
lines:

```
version 1

study("Swing lines, capped", overlay = true, precision = 2)

leftBars  = input(5,  "Pivot left bars",  min = 1, max = 50)
rightBars = input(5,  "Pivot right bars", min = 1, max = 50)
keep      = input(20, "Lines to keep",    min = 1, max = 500)

pivot = pivotHigh(high, leftBars, rightBars)

var lastTime  = none
var lastPrice = none
var lines     = []

if not isNone(pivot)
    pivotTime = time[rightBars]

    if not isNone(lastTime)
        push(lines, draw.line(lastTime, lastPrice, pivotTime, pivot,
                              color = orange, width = 2))
        // The cap is enforced on the bar that breaches it, so the count never
        // grows past it even for one bar.
        if size(lines) > keep
            draw.delete(shift(lines))

    lastTime  = pivotTime
    lastPrice = pivot
```

The array holding the handles is declared `var lines = []` with no type
annotation. The element type is fixed by the first `push`, which is how an empty
literal gets its type from context; there is no spelling for `array<line>` in
version 1, and the library reference says so rather than leaving you to guess.

Two more rules that fall out of the same thinking:

- **Delete from a list downwards.** A loop that walks a list ascending and
  removes elements as it goes skips the element after every removal, because
  removal renumbers everything above it. `for i = size(list) - 1 to 0 step -1`
  makes that impossible, and the descending form has to say `step -1` anyway, so
  it costs one word.
- **`draw.deleteAll()` is a reset, not a maintenance strategy.** Calling it every
  bar and rebuilding is correct and wasteful: it destroys and recreates the whole
  object layer fifty thousand times to show the state of the last bar. It earns
  its place when a setting changes and the whole picture is invalid, or on
  `bar.isLast` in a study that draws a small fixed set of objects for the current
  state only.

`draw.count()` is the health check. A study that draws should be able to say how
many objects it holds, and a count that climbs without bound on a long chart is
the bug this page exists to prevent.

## Deleted objects and stale handles

A handle held in a `var` outlives the object it names. Deleting an object does
not blank the handle, and a setter called on a deleted object is **OS4005**, not
a silent no-operation.

```
var zone = none

if broken
    draw.delete(zone)
    zone = none                 // without this line the next bar raises OS4005

if not isNone(zone)
    draw.setTo(zone, time, low)
```

The error exists rather than being ignored because a script mutating a deleted
object has lost track of its own state and is going to keep losing track of it.
Failing on the first stale call names the bar the object was deleted on, which
is the information you need; swallowing it would leave you looking at a chart
where one zone out of forty stopped updating.

The discipline is one line: **set the handle to `none` on the same lines that
delete the object**, and test `isNone` before every mutation.

## The moving bar

The newest bar of a live chart is executed again on every update. Drawing
objects follow the rollback rule exactly as `var` values do: before each
re-execution, the object set is restored to what it was at the end of the
previous bar. A script that creates a line on a condition does not accumulate
one line per tick, and a chart that has been open all day agrees with a backtest
over the same data.

The one thing to know about it: **hold object handles in `var`, never in `live
var`.** A `live var` deliberately survives rollback, so it would keep a handle
to an object that rolled back out of existence, and the next setter would raise
OS4005 on a script that looks correct. `live var` is for counting updates, and
an object handle is not a count.

## Objects are written, not read

There is no `draw.getTop(box)` and there will not be one in version 1. The
mutation table above is the whole interface: you can move an object, restyle it
and delete it, and you cannot ask it where it is.

So a script that needs to reason later about what it drew has to remember the
numbers itself, in parallel with the handles:

```
var zones      = []     // the objects
var zoneTop    = []     // what each one's top was when it was drawn
var zoneBottom = []
var zoneBar    = []     // and when
```

That is not a workaround for a missing feature so much as the honest shape of
the problem: the numbers a zone was built from are the script's own data, and
keeping them in the script is what lets the script decide, four hundred bars
later, whether price has closed through the zone. The drawing is output. The
numbers are state. Keeping them separate is what stops a study treating its own
picture as a database.

## A polyline in full

A polyline is the shape to reach for when a path has more than two points and
would otherwise be one `draw.line` per segment:

```
version 1

study("Swing path", overlay = true, precision = 2)

leftBars  = input(5,  "Pivot left bars",  min = 1, max = 50)
rightBars = input(5,  "Pivot right bars", min = 1, max = 50)
points    = input(12, "Points in the path", min = 3, max = 100)

pivotUp   = pivotHigh(high, leftBars, rightBars)
pivotDown = pivotLow(low,  leftBars, rightBars)

var pathTimes  = []
var pathPrices = []
var path       = none

swing = isNone(pivotUp) ? pivotDown : pivotUp

if not isNone(swing)
    push(pathTimes,  time[rightBars])
    push(pathPrices, swing)

    if size(pathTimes) > points
        shift(pathTimes)
        shift(pathPrices)

    // One object whose path is replaced, rather than one line per segment.
    if isNone(path)
        path = draw.polyline(pathTimes, pathPrices, color = purple, width = 2)
    else
        draw.setPoints(path, pathTimes, pathPrices)
```

The two arrays must stay the same length, which is why the trim removes from
both. `closed = true` with a `fillColor` turns the same call into a filled shape
and is how a script draws a wedge or a triangle.

## Common mistakes

| Symptom | Cause | Fix |
|---|---|---|
| Every line is in the wrong place after older history loads | Anchored on `bar.index` | Anchor on `time`, which does not move |
| A study gets slower the longer the chart is open | Create and forget | Cap the list, or keep one object and move it |
| A line marks the wrong bar by exactly the pivot's right bars | Anchored at `time` on the bar the pivot was reported | Anchor at `time[rightBars]` |
| OS4005 on a bar long after the delete | A handle not cleared when the object was deleted | Set the handle to `none` beside the `draw.delete` |
| A box's right edge is in a different place on every timeframe | Guessing the bar interval | Extend the right edge to `time`, or use a line with `extendRight` |
| Duplicate objects on a live chart only | An object handle kept in a `live var` | Use `var`, so the handle rolls back with the object |
| The box covers the candles | Fill at full opacity | Lower it: `opacity = 0.08`, or `fade` on the colour |

## See also

- [overview.md](./overview.md) for the map of every drawing surface and what each one costs
- [labels-and-shapes.md](./labels-and-shapes.md) for text plates, markers and anchoring above or below a bar
- [tables.md](./tables.md) for a grid pinned to a corner, which is where numbers belong
- [colors.md](./colors.md) for choosing the line, border and fill colours used here
- [bar-coloring-and-backgrounds.md](./bar-coloring-and-backgrounds.md) for a zone that has no price extent
- [plots.md](./plots.md) for output that is a column of one value per bar rather than geometry
- [../README.md](../README.md) for the rest of the documentation
- [../../spec/stdlib.md](../../spec/stdlib.md) section 14.4 for the authoritative `draw` reference
- [../../spec/language.md](../../spec/language.md) sections 7.2 and 7.5 for bar index, bar time and the rollback rule
- [../../examples/09-supply-demand-zones.oscript](../../examples/09-supply-demand-zones.oscript) for the drawing heavy case end to end
- [../../examples/04-rsi-divergence.oscript](../../examples/04-rsi-divergence.oscript) for geometry anchored in the past
