# Plots

By the end of this page you will be able to draw any column of numbers exactly
the way you want it: its shape, its colour on every bar, its thickness, the pane
and axis it lands on, how far it is shifted along the time axis, and how its
numbers are formatted.

A **plot** is one value per bar, drawn. That is the whole idea, and everything
else on this page is an argument that decides how those values are rendered. The
values themselves come from wherever you computed them: a library function, an
expression, a `var` that carries state forward. `plot` does not compute
anything.

---

## The call

```
plot(value, title,
     color = ...,
     width = 1.5,
     style = "line",
     offset = 0,
     overlay = none,
     precision = none,
     format = none,
     scale = "right")
```

| Argument | Type | Default | Means |
|---|---|---|---|
| `value` | `series number` | required | The number to draw on this bar. `none` draws nothing |
| `title` | `string` | required | The name in the legend, and the name a user sees in the settings dialog |
| `color` | `color` or `series color` | the host's next palette colour | One colour, or a colour per bar. See below |
| `width` | `number` | `1.5` | Line thickness |
| `style` | `string` | `"line"` | One of six shapes, listed below |
| `offset` | `number` | `0` | Bars to shift the drawing right; negative shifts left |
| `overlay` | `bool` | the declaration's | `true` forces this one column onto the price pane |
| `precision` | `number` | the declaration's | Decimals on the price scale this plot maps to |
| `format` | `string` | the declaration's | `"price"`, `"percent"` or `"volume"` on that same scale |
| `scale` | `string` | `"right"` | `"right"`, `"left"` or `"none"` |

`plot` returns a **handle**. You need it only when a `fill` has to name this
column, and then you keep it in an ordinary top-level name:

```
pUpper = plot(upper, "Upper", aqua)
```

The handle is a compile-time value. It cannot be stored in a `var` and cannot be
passed to a function, because the set of plotted columns is fixed before bar 0
and a handle that could travel at run time would let a script decide at bar
40,000 which columns exist.

`plot` is top level only. Putting one inside an `if` is OS3006, and the fix is
always the same: plot `none` on the bars you want hidden.

---

## The six styles

| `style` | Draws | Reach for it when |
|---|---|---|
| `"line"` | A line joining consecutive values | The value changes every bar and the slope between bars is meaningful. The default, and right most of the time |
| `"lineWithMarkers"` | The same line with a mark on every bar's value | The bars are sparse or the value is read one bar at a time rather than as a curve |
| `"step"` | A horizontal segment per bar, with a vertical jump where the value changes | The value changes only occasionally: once a session, once a coarse bar, once per trade |
| `"area"` | A line with the region between it and the axis filled | One quantity whose level, not whose shape, is the story |
| `"histogram"` | A bar from zero to the value | A quantity that is signed, so it reads above and below a zero line |
| `"column"` | A bar from the axis to the value | A quantity that is never negative, such as volume |

The style choice with a real reason behind it is `"step"`. A value that changes
once a day and is drawn as a line slopes gently from yesterday's reading to
today's, and every point along that slope is a price the script never read. The
step says the truth: the value was this, then it became that. Use it for a
higher timeframe read, for a session's opening range, for a stop level held
constant between trades, and for anything else that is piecewise constant.

```
// A value read once per coarse bar. A sloping line would imply intraday
// readings that never existed.
plot(req.timeframe("1D", high), "Previous day high", aqua,
     width = 2, style = "step")
```

The six names above are the same set the host's own style menu offers, so a user
can restyle any plot after the fact. Your choice is the sensible default, not a
lock.

---

## Colour: one colour, or a colour per bar

**A constant colour and a per-bar colour are the same argument.** Pass a `color`
and it becomes the plot's style colour, with no per-bar cost at all. Pass a
`series color`, which is any expression that produces a different colour on
different bars, and the compiler allocates a second channel and emits a colour
beside each value.

```
plot(fast, "Fast", aqua)                                   // one colour
plot(hist, "Histogram", color = hist > 0 ? lime : red,     // a colour per bar
     style = "histogram")
```

One argument covers both cases on purpose: a script that starts with one colour
and later wants two should not have to move to a different function, rename its
plot and lose the user's saved styling.

Two things about the per-bar form are worth knowing before you write one.

**The colour is only consulted where the value exists.** On a warmup bar the
value is absent, the line is broken there, and whatever the colour expression
produced for that bar is never used. So `hist > 0 ? lime : red` painting "red"
during warmup, because an absent condition takes the false branch, is harmless:
nothing is drawn there.

**The colour argument is an ordinary expression, so absence propagates into it.**
Where you want a specific look on the absent bars, say so with `orElse` or an
explicit test rather than letting the ternary's false branch stand in for it.

### Building colours

| Call | Gives |
|---|---|
| `aqua`, `orange`, `lime`, `red`, and fifteen more | A named colour, fully opaque |
| `#ff8800`, `#ff880080` | Hex, with an optional alpha byte |
| `rgb(r, g, b)` | Channels 0 to 255, fully opaque |
| `rgba(r, g, b, a)` | The same with alpha from 0 to 1, where 1 is opaque |
| `fade(colour, percent)` | The same colour at `percent` **transparency**, where 100 is invisible |
| `withAlpha(colour, a)` | The same colour at a stated alpha, 0 to 1 |
| `mix(a, b, weight)` | A blend; `weight` 0 gives `a` and 1 gives `b` |
| `alpha(colour)` | Read a colour's alpha back, 0 to 1 |

`fade` and `withAlpha` are opposites and both exist for a reason: `fade` matches
the way a chart's own style controls are labelled, where the number you type is
how see-through the thing is, and `withAlpha` matches the way a colour is
described in code. A script that guesses wrong draws something invisible, so the
two conventions each got a name instead of one function with a footnote.

A channel argument outside its range is OS4009, not a clamp. A colour computed
from data and landing at 300 is a bug in the computation, and clamping it would
draw a plausible picture over a broken calculation.

---

## Width and how heavy a line reads

`width` is a number and defaults to `1.5`. Two plots at the same width read as
equally important, which is the only rule worth following:

```
plot(basis, "Basis", orange, width = 2)                  // the line that matters
plot(upper, "Upper", aqua)                               // supporting
plot(previousClose, "Previous close", fade(silver, 55))  // reference
```

Thickness and transparency do different jobs. Thickness says "follow this".
Transparency says "this is here if you need it". A study that reaches only for
thickness ends up with five heavy lines and no hierarchy.

---

## Offsetting a plot

`offset` shifts **where the column is drawn, never what it contains**. A
positive offset pushes the drawing right, into the margin past the newest bar. A
negative offset pushes it left, back over history.

That separation is the whole point. A function that shifted the values instead
would hand you a series you cannot compare with anything else in the script
without shifting it back, and every comparison in the file would carry a
correction a reader has to verify. Two cases cover almost every use.

**A projection drawn into the future.** A trend frame's spans are computed on
the bar they are computed on, and drawn forward:

```
i = ichimoku(9, 26, 52)

// Drawn 26 bars to the right. spanA and spanB themselves are untouched, so a
// later line in this script can still compare them with today's close.
pA = plot(i[2], "Span A", lime, offset = 26)
pB = plot(i[3], "Span B", red,  offset = 26)
```

**A value drawn back where it belongs.** A pivot is only knowable `right` bars
after the bar it formed on, which is why `pivotHigh` reports it there. To draw
the mark at the pivot itself, shift the column left by the same amount:

```
rightBars = input(5, "Pivot right bars", min = 1, max = 50)

ph = pivotHigh(high, 5, rightBars)

// The value arrives late because the pivot was unknowable earlier. The drawing
// is pushed back to the bar the pivot actually happened on.
plot(ph, "Pivot high", orange, style = "lineWithMarkers", offset = -rightBars)
```

Note what this does not do: it does not make the script know the pivot any
earlier. The lag is real and stays real. `offset` only stops the picture lying
about which bar the value belongs to.

---

## Pane and scale

By default every plot lands in the pane the declaration chose. `overlay = true`
on one plot moves that column to the price pane and leaves the rest of the study
where it was, which is how a study with its own axis still puts one line where
the trader is looking.

```
study("Trend strength", range = [0, 100])

a   = adx(14, 14)
e20 = ema(close, 20)

plot(a[0], "ADX", purple, width = 2)
plot(e20, "EMA 20", orange, width = 2, overlay = true)
```

Within a pane, `scale` picks the axis:

| `scale` | Means | Use it for |
|---|---|---|
| `"right"` | The right-hand price axis. The default | Everything, normally |
| `"left"` | The left-hand axis | A second series in different units on the same pane |
| `"none"` | No price scale at all | A column whose magnitude would flatten everything else on the pane |

The second axis is the honest answer to a common problem: a premium in points
and a position value in money have no shared scale, and drawing them on one axis
makes one of them a flat line at the bottom.

```
plot(premium, "Combined premium", orange, width = 2)
plot(premium * lots * chart.lotSize, "Position value", aqua, scale = "left")
```

---

## Formatting the numbers

Three things control how a plot's numbers read, and they operate at two levels.

At the study level, in the declaration:

| Option | Default | Means |
|---|---|---|
| `precision` | `4` | Decimals on this study's axis and legend, 0 to 10 |
| `format` | `"price"` | `"price"`, `"percent"` or `"volume"`. Axis and crosshair formatting |

```
study("Volume", format = "volume", precision = 0)
study("Relative strength", format = "percent", precision = 1)
study("Index study", format = "price", precision = 2)
```

At the plot level, the same two names as arguments. **They set the formatting of
the price scale the plot maps to, not of that one line.** That is the whole
subtlety. A scale is shared by everything mapped to it, so formatting is a
property of the axis.

The consequence is stated in the specification and the compiler warns about it:
setting `precision` or `format` on a plot drawn over the price pane reformats
the instrument's own axis, which is almost never what anyone wants, and the
compiler emits warning OS8007. If you find yourself reaching for it there, the
thing you actually want is usually a second scale:

```
// Wrong: reformats the instrument's price axis. OS8007.
plot(changePct, "Change, percent", aqua, format = "percent", overlay = true)

// Right: a second axis of its own, formatted as a percentage.
plot(changePct, "Change, percent", aqua, format = "percent",
     scale = "left", overlay = true)
```

Inside a study's own pane, formatting a plot is ordinary and useful, because the
pane's axis belongs to the study:

```
version 1

study("Volume and its average", format = "volume", precision = 0)

len = input(20, "Average length", min = 2, max = 500)

// Columns, because volume is never negative, and coloured by the bar's
// direction so the picture carries two facts at once.
plot(volume, "Volume", color = close > open ? fade(lime, 35) : fade(red, 35),
     style = "column")

plot(sma(volume, len), "Average", orange, width = 2)
```

Formatting is display only. `format = "percent"` does not divide anything by a
hundred, and `precision = 2` does not round the value. The numbers your script
computed are the numbers it computed; `precision` decides how many of their
digits a reader sees. To round a value for real, use `round(x, decimals)`.

---

## Candle plots

`plotCandles` draws bar-shaped output rather than a line: four source columns,
one plot slot, and colours that split on whether the close is above the open.

```
plotCandles(open, high, low, close, title,
            colorUp = lime, colorDown = red,
            wickColor = none, borderColor = none)
```

Its two everyday uses are a coarse timeframe candle drawn over a fine chart, and
a smoothed candle built from averaged prices.

```
version 1

study("Coarse candles", overlay = true, precision = 2)

tf = input("1D", "Timeframe", kind = "interval")

// Read at the coarse timeframe, aligned onto this chart's bars. The default
// mode is "confirmed", which never uses a bar that had not closed yet.
o = req.timeframe(tf, open)
h = req.timeframe(tf, high)
l = req.timeframe(tf, low)
c = req.timeframe(tf, close)

// Faded well back, because these sit on top of the instrument's own candles
// and are a frame around them rather than a replacement for them.
plotCandles(o, h, l, c, "Daily",
            colorUp = fade(lime, 55), colorDown = fade(red, 55),
            wickColor = fade(silver, 55))
```

An absent value in any of the four sources leaves that bar's candle undrawn, by
the same gap rule as every other surface.

---

## Hiding a plot, and what absence draws

There is exactly one way to hide a plot on a bar: give it `none`.

```
// A stop that only exists while a position is open.
plot(pos.size > 0 ? entryStop : none, "Stop", red, style = "step")
```

Absence is not a special case bolted on for this. It is the same value a library
function returns during warmup, that a division by zero produces, and that
`close[1]` has on bar 0. A plot draws a gap wherever its value is absent, so
every one of those cases produces a line that starts where the data starts and
breaks where the data breaks, with no extra code from you.

A related pattern comes up whenever a value changes sides. One column cannot
change colour partway along in the sense of being two different lines, so a stop
that flips from below price to above price is two plots, each absent where the
other is live:

```
plot(dir ==  1 ? stopLine : none, "Stop, long",  lime, width = 2)
plot(dir == -1 ? stopLine : none, "Stop, short", red,  width = 2)
```

Two plots rather than one per-bar colour, because a single line that jumped from
one side of price to the other would draw a vertical segment through the candles
on the flip bar, which is a price the stop never was.

---

## Markers and events

A plot draws a value on every bar. An event happens on one bar. Two calls cover
the middle ground.

`style = "lineWithMarkers"` puts a mark on every value of an ordinary plot. Use
it where the values are sparse, such as a pivot series that is absent on most
bars, so the few values that exist read as points rather than as a line between
two distant bars.

`signal(text, color = none, at = "above", shape = "label")` is the whole of
shape plotting: one call, one named marker on the bar. It may appear anywhere in
the file, including inside an `if`, because it is a per-bar event rather than a
declared column.

```
if crossUp(fast, slow)
    signal("BUY", at = "below", shape = "triangleUp")

if crossDown(fast, slow)
    signal("SELL", at = "above", shape = "triangleDown")
```

`at` takes `"above"`, `"below"` or `"price"`, and defaults to `"above"`.
`shape` takes `"label"`, `"arrowUp"`, `"arrowDown"`, `"triangleUp"`,
`"triangleDown"`, `"circle"`, `"square"`, `"diamond"`, `"cross"` and `"flag"`.
Say where the marker goes on every call, as both calls above do: no value picks
the side by reading the text, because a marker whose position depends on its own
text reads differently on two engines. `at`, `shape` and `color` are fixed
before the first bar runs, so each must be a literal or an `input()`; a value
that changes from bar to bar is OS3003.

One thing to know before you build on it: `signal` does not fire on a bar that
is still moving, unless the declaration sets `onUnconfirmed = true`. A marker
that appeared and then withdrew itself when the bar closed would be worse than
no marker.

---

## Plotting a function that returns several numbers

A function with more than one output returns one `array<number>` holding this
bar's outputs, in the order its entry documents. One call site, one piece of
state, one shared computation, and as many plots as you want to draw.

```
version 1

study("MACD", precision = 4)

fastLen = input(12, "Fast",   min = 1, max = 200)
slowLen = input(26, "Slow",   min = 1, max = 400)
sigLen  = input(9,  "Signal", min = 1, max = 100)

// One call. Three calls to three separate functions would be three call sites
// and therefore three independent pieces of state, so the shared smoothing
// would be computed three times per bar.
m = macd(close, fastLen, slowLen, sigLen)

level(0, "Zero", fade(gray, 55), style = "solid")

plot(m[2], "Histogram", color = m[2] > 0 ? lime : red, style = "histogram")
plot(m[0], "MACD",   aqua,   width = 2)
plot(m[1], "Signal", orange, width = 2)
```

The returned array is never absent and never changes length. Each element
carries its own warmup and is `none` until it is reached, so `m[1]` is a legal
read on bar 0 and simply has no value there. An array that grew as warmup
completed would make that read an out-of-range error at the left edge of the
chart only, which is the worst place for an error to hide.

Note the order of the three plots: the histogram is declared first so it sits
under the two lines. Declaration order is the cheapest control you have over
what covers what within one pane.

---

## Common mistakes

| Mistake | What happens | Fix |
|---|---|---|
| `if cond` wrapped around a `plot` | OS3006 at compile time | `plot(cond ? value : none, ...)` |
| A stateful call inside the branch that uses it | Warning OS8001, and a line with holes in it | Compute it at the top level, use the result in the branch |
| `plot(x, "T", format = "percent")` on an overlay | Warning OS8007, and the instrument's axis is reformatted | Put it on `scale = "left"`, or set `format` on the declaration of a study with its own pane |
| Expecting `offset` to change the values | It never does, and nothing warns | Shift the values yourself with `[]` if that is what you meant |
| A sloping line for a value that changes once a day | The picture implies readings that were never taken | `style = "step"` |
| Five lines all at `width = 2` | No hierarchy; a reader cannot tell what to follow | One heavy line, the rest at the default, references faded |

---

## See also

- [overview.md](./overview.md) for the map of every drawing surface and the decision table that picks between them
- [fills.md](./fills.md) for shading the region between two of these plots
- [levels.md](./levels.md) for horizontal reference lines, the pane's fixed range and the price axis
- [labels-and-shapes.md](./labels-and-shapes.md) for `signal` in full, and for text plates a plot cannot carry
- [lines-and-boxes.md](./lines-and-boxes.md) for output that is geometry rather than a column
- [../README.md](../README.md) for the rest of the documentation
- [../../spec/stdlib.md](../../spec/stdlib.md) section 14.2 for the authoritative signatures of `plot` and `plotCandles`, and section 11 for the colour functions
- [../../spec/language.md](../../spec/language.md) section 6 for the absent value, which is what a gap in a line actually is
- [../../examples/01-ema-cross.oscript](../../examples/01-ema-cross.oscript) and [../../examples/02-supertrend.oscript](../../examples/02-supertrend.oscript) for complete scripts built on these calls
