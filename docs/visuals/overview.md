# What a script can put on a chart

By the end of this page you will be able to look at any picture you want on a
chart, name the call that makes it, say which pane it lands in, and know what it
costs.

A script produces exactly two kinds of thing: numbers, and pictures made from
numbers. The numbers are the easy half. This page is a map of the other half:
every call in OpenScript that reaches a drawing surface, what each one is good
at, and the four questions worth asking before you choose between them.

The four questions are always the same:

1. Is this thing one value per bar, or is it a shape that spans bars?
2. Does it have a price to sit at, or is it a fact about the whole bar?
3. Is it fixed before the first bar runs, or does it appear and disappear?
4. Which pane should a reader find it in?

Answer those four and the call chooses itself.

---

## The seven surfaces

Everything a script draws lands on one of seven surfaces. The specification
calls them the fields of the chart contract, and
[`../../spec/stdlib.md`](../../spec/stdlib.md) section 18 lists the whole map.
Here they are in the order you will reach for them.

| Surface | Calls | Shape of the thing |
|---|---|---|
| Plotted columns | `plot`, `plotCandles` | One value per bar, joined into a line, a step, an area, a histogram, columns or candles |
| Shaded bands | `fill` | The region between two plotted columns |
| Horizontal levels | `level` | A line straight across the pane at one price |
| Bar-anchored markers | `signal` | A named mark on one bar |
| Per-bar paint | `barColor`, `background` | A colour applied to a bar, with no price of its own |
| Free drawings | `draw.line`, `draw.label`, `draw.box`, `draw.polyline` | Objects anchored to a time and a price, created and mutated over many bars |
| The pinned grid | `table`, `cell` | A panel in a corner of the pane, showing one state rather than a history |

Two more calls produce output that is not drawn at all, and they belong in the
map because people look for them here: `alert` declares a watched condition that
the host raises, and `print` writes a line to the script's log. Neither one puts
anything on the chart.

---

## If you want X, use Y

This is the table to keep open while you write. The right-hand column names the
page that explains the call in full.

| If you want | Use | Explained in |
|---|---|---|
| A moving average drawn over price | `plot(value, title, colour)` | [plots](./plots.md) |
| A value that only changes once a session or once a day | `plot(..., style = "step")` | [plots](./plots.md) |
| A histogram of an oscillator, coloured by sign | `plot(..., color = v > 0 ? lime : red, style = "histogram")` | [plots](./plots.md) |
| Volume as columns under the chart | `plot(volume, ..., style = "column")` | [plots](./plots.md) |
| A smoothed or higher timeframe candle | `plotCandles(o, h, l, c, title)` | [plots](./plots.md) |
| A plot pushed forward or back along the time axis | `plot(..., offset = n)` | [plots](./plots.md) |
| One line from a pane study drawn over price | `plot(..., overlay = true)` | [plots](./plots.md) |
| A value on the opposite price axis | `plot(..., scale = "left")` | [plots](./plots.md) |
| A shaded band between two lines | `fill(plotA, plotB, ...)` | [fills](./fills.md) |
| A band that changes colour with which line leads | `fill(a, b, colorUp = ..., colorDown = ...)` | [fills](./fills.md) |
| Shading between a line and a fixed value | An invisible second plot, then `fill` | [fills](./fills.md) |
| A fixed reference line at 70, 30 or zero | `level(70, "Overbought", ...)` | [levels](./levels.md) |
| A line at yesterday's high, tracking the data | `level(dayHigh, ...)` | [levels](./levels.md) |
| A pane whose axis never rescales | `study(range = [0, 100])` | [levels](./levels.md) |
| How many decimals the axis shows | `study(precision = 2)` | [levels](./levels.md) |
| An axis reading as a percentage or a volume | `study(format = "percent")` | [levels](./levels.md) |
| A mark on the one bar a thing happened | `signal("BUY")` | [labels and shapes](./labels-and-shapes.md) |
| A plate of text at a price | `draw.label(t, p, text)` | [labels and shapes](./labels-and-shapes.md) |
| The instrument's candles recoloured by regime | `barColor(colour)` | This page, below |
| The whole bar column shaded behind everything | `background(colour)` | This page, below |
| A trendline between two points in the past | `draw.line(t1, p1, t2, p2)` | [lines and boxes](./lines-and-boxes.md) |
| A zone that is extended and later deleted | `draw.box(...)` then `draw.setTo(...)` | [lines and boxes](./lines-and-boxes.md) |
| A readings panel in the corner | `table(...)` and `cell(...)` | [tables](./tables.md) |
| A condition the host should watch | `alert(message, id = "...")` | Nothing is drawn; see `stdlib.md` section 16 |
| A value written to the log while debugging | `print(value)` | Nothing is drawn; see `stdlib.md` section 14.3 |

Three entries in that table deserve their reasons stated here, because people
reach for the wrong one.

**A crossing is not a plot.** A crossing happens on one bar. A plotted column
carries one value on every bar, so the only way it can express an event is by
being absent on all the other bars, which means you pay for a whole column to
draw one dot. `signal("BUY")` is the call for an event, and it is the whole of
shape plotting in this language: one call, one named marker, with `at` and
`shape` if you care where it sits and what it looks like.

**A regime is not a price.** "The range is still forming", "the higher
timeframe is long", "volatility is in the top decile": none of these has a price
to sit at. Drawing one as a line puts a flat series through the middle of the
price scale saying something that has nothing to do with price. `background`
shades the bar's whole column, and `barColor` recolours the bar itself. Both
take `none` to mean "leave this bar alone", which is how a conditional paint
switches itself off.

**A fixed reference is not a plot either.** A line at 70 does not need a column
of fifty thousand identical numbers, a legend entry and a settings row. `level`
draws it with one call and no column at all.

---

## What may appear where in the file

This is the rule that catches everyone once.

| Calls | Where they may appear | Why |
|---|---|---|
| `plot`, `plotCandles`, `fill`, `level`, `table`, `input` | Top level only. Inside an `if`, a loop or a function is OS3006 (OS3007 for `input`) | They declare the fixed shape of the study. The legend, the settings dialog and the pane have to exist before bar 0, so the set of columns, bands, levels and rows must be known at compile time |
| `signal`, `barColor`, `background`, `cell`, `print`, everything in `draw`, every order function | Anywhere | They are per-bar events and per-bar paint. Nothing about them has to be known in advance |

So a plot is never hidden by wrapping it in a branch. It is hidden by giving it
the absent value on the bars you do not want:

```
plot(trending ? ema20 : none, "EMA 20", aqua)   // correct

if trending
    plot(ema20, "EMA 20", aqua)                 // OS3006
```

The same shape works for a fill, whose colour may be absent on a bar, and for a
level, whose price may be absent. Absence reaching any drawing surface is a gap,
never a zero. That single rule is worth memorising, because it is what makes
"hide it by plotting `none`" work everywhere without a second mechanism:

| Surface | What an absent value looks like |
|---|---|
| A plotted column | The line breaks. Nothing is drawn on that bar |
| A shaded band | The band stops and resumes |
| A level | The line is not drawn |
| A marker | No marker on that bar |
| `barColor` | The bar keeps its own colour |
| `background` | The bar's column is not shaded |
| A table cell | The cell is blank |

---

## What costs a plot slot

A **plot slot** is one entry in the contract's plotted columns: a legend entry,
a column of values retained for every bar, and a generated row in the settings
dialog where a user can restyle it without editing your script. Only two calls
create one.

| Call | Plot slots | Values retained per bar |
|---|---|---|
| `plot(...)` | one | one |
| `plotCandles(...)` | one, naming four source columns | four |
| `fill(...)` | none. It names two plots that already exist | none of its own |
| `level(...)` | none | its price, read every bar |
| `signal(...)` | none | its text, on the bars it fires |
| `barColor(...)`, `background(...)` | none | one colour per bar, each |
| `table(...)`, `cell(...)` | none | the cells written this bar |
| `draw.*` | none | the objects the script is holding |
| `alert(...)` | none | a condition and a message |

Two consequences follow, and both come up in real scripts.

**A multi-output function costs one slot per output you draw.** `macd` returns
three numbers in one array, from one call site and one piece of state. Drawing
all three is three `plot` calls and three slots. Drawing only the histogram is
one slot, and the other two outputs cost nothing because they were never
plotted.

**A shaded band costs two slots even when you do not want the lines.** `fill`
names two plots, so the plots have to exist. When the band is the whole point
and the edges are noise, keep the plots and make them invisible with a fully
transparent colour:

```
pUpper = plot(basis + band, "Upper", fade(aqua, 100))
pLower = plot(basis - band, "Lower", fade(aqua, 100))
fill(pUpper, pLower, color = aqua, opacity = 0.08)
```

`fade` takes transparency, not opacity, and 100 is invisible. The two plots
still appear in the legend with their values, which is usually what you want
anyway: the reader can hover and read the band's edges even though no line is
drawn.

Only `plot` gets a generated style row in the settings dialog, per
[`../../spec/stdlib.md`](../../spec/stdlib.md) section 13.4. A script that wants
a colour under its own name declares a `color` input and passes it to the plot,
which takes over that row rather than adding a second one.

---

## Which pane a thing lands in

A study is either drawn over the instrument's candles or given a pane of its
own, and the declaration decides which:

```
study("Over price", overlay = true)     // the price pane
study("Own pane")                       // overlay defaults to false
```

That is the default for everything the file draws. Three calls can override it
per item, and the rest cannot.

| Thing | Pane | Can it be overridden? |
|---|---|---|
| `plot(...)` | The study's pane | Yes, `overlay = true` puts this one column on the price pane |
| `plotCandles(...)` | The study's pane | Yes, same argument |
| `fill(...)` | The study's pane | Yes, same argument |
| `level(...)` | The study's pane | No. A level has no `overlay` argument |
| `signal(...)` | The study's pane, positioned relative to the bar | No |
| `background(...)` | The pane the study owns, full height of the bar's column | No |
| `barColor(...)` | Always the instrument's own candles on the price pane, even from a study that owns a separate pane | No |
| `table(...)` | Pinned to a corner of the study's pane | No, but `position` picks the corner |
| `draw.*` | Anchored to a time and a price, so the pane whose scale holds that price | No |

`barColor` is the one that surprises people, and it is deliberate: a trend
reading computed in a pane below the chart is most useful painted onto the
candles a trader is actually looking at, and forcing the study to be an overlay
just to reach them would mean giving up its own axis.

Within a pane, `scale` decides which price axis a plot maps to:

| `scale` | Means |
|---|---|
| `"right"` | The right-hand axis. The default |
| `"left"` | The left-hand axis, for a second series in different units |
| `"none"` | No price scale at all, so this column cannot stretch the pane |

A study reading a premium in points and a position value in money wants both
axes, and says so:

```
plot(premium, "Combined premium", orange, width = 2)
plot(premium * lots * chart.lotSize, "Position value", aqua, scale = "left")
```

---

## The order things are painted in

Only one rule of the stack is fixed by the specification, and it is the one that
matters: **`background` is painted behind everything else**. Everything else is
the order in which the host paints the descriptor's fields, and the practical
guidance is the same either way: build a picture that reads correctly whatever
the order, rather than one that depends on an opaque layer hiding another.

Bottom to top, the layers are:

| Layer | Holds | Note |
|---|---|---|
| 1 | The pane background, from `background(...)` | Fixed by the specification: behind everything |
| 2 | The instrument's candles, recoloured by `barColor(...)` | Only on the price pane |
| 3 | Shaded bands, from `fill(...)` | Translucent when no colour is named: the first plot's colour at twelve percent |
| 4 | Plotted columns, from `plot` and `plotCandles` | |
| 5 | Horizontal levels, from `level(...)` | |
| 6 | Free drawings, from the `draw` namespace | |
| 7 | Bar-anchored markers, from `signal(...)` | |
| 8 | The pinned grid, from `table` and `cell` | Fixed to a corner, so it covers whatever is under it |

Three facts you can rely on, which together are enough to design with:

- A `fill` given no colour is translucent, so a band over candles does not hide
  them: it takes the first plot's colour faded to twelve percent, which was
  chosen for exactly that. Name a colour and you get that colour, because
  `opacity` starts at 1 and only dims what the script already wrote.
- An absent value removes a layer for that bar rather than painting a zero over
  what is underneath.
- A background shade is a whole-column wash, so keep it faint. `fade(silver, 92)`
  reads as a tint; `silver` at full strength reads as a bug.

---

## Three worked examples

### One study, one of each surface

Every surface in one overlay study, so the shapes can be compared side by side.

```
version 1

study("Surface tour", overlay = true, precision = 2)

len = input(20, "Length", min = 2, max = 500)

basis = sma(close, len)
band  = 2 * stdev(close, len)

// Two plots, so the fill has two columns to name. The basis is a third.
pUpper = plot(basis + band, "Upper", aqua)
pLower = plot(basis - band, "Lower", aqua)
plot(basis, "Basis", orange, width = 2)

fill(pUpper, pLower, color = aqua, opacity = 0.08)

// A regime, painted rather than plotted: it has no price to sit at.
barColor(close > basis ? lime : red)
background(close > basis + band ? fade(orange, 93) : none)

// An event, on the one bar it happened.
if crossUp(close, basis + band)
    signal("BREAKOUT", at = "above", shape = "triangleUp")
```

Read it as: three plot slots, one band that costs none, a colour on every
candle, a wash on the bars price spent outside the band, and a marker on the
bars where it first left.

### An oscillator with its own pane, its own scale and its own lines

```
version 1

study("RSI with a zone", precision = 2, range = [0, 100])

len = input(14, "Length", min = 2, max = 200)

r = rsi(close, len)

// Levels, not plots. Three horizontal lines, no columns, no legend entries.
level(70, "Overbought", fade(red, 40))
level(30, "Oversold", fade(lime, 40))

pOsc = plot(r, "RSI", purple, width = 2)

// The midline exists only so the fill has a second column to name, so it is
// plotted at full transparency and draws no line of its own.
pMid = plot(50, "Midline", fade(gray, 100))

fill(pOsc, pMid, colorUp = fade(lime, 86), colorDown = fade(red, 86))
```

`range = [0, 100]` fixes the pane's scale, so 70 is at the same height on every
chart you open. That is the whole reason to fix a range: an axis that rescales
turns a reading with real bounds into a shape with none.

### A pane study that reaches onto the price chart

```
version 1

study("Trend strength", precision = 2, range = [0, 100])

diLen  = input(14, "DI length",  min = 1, max = 100)
adxLen = input(14, "ADX length", min = 1, max = 100)

a = adx(diLen, adxLen)
strength = a[0]

// Computed at the top level, on every bar. A stateful call placed inside the
// branch that uses it would advance only on the bars that branch was taken,
// which is warning OS8001 and a line with holes in it.
e20 = ema(close, 20)

level(25, "Trending above here", fade(gray, 50))
plot(strength, "ADX", purple, width = 2)

// This one column belongs where the trader is looking, not down here.
plot(strength > 25 ? e20 : none, "EMA 20 while trending", orange,
     width = 2, overlay = true)

// And the candles themselves carry the regime.
barColor(strength > 25 ? none : fade(gray, 60))
```

Three things are worth noticing. The study owns a pane, but one of its columns
is on the price pane and its bar colouring is too. The average is computed
unconditionally and only the drawing is conditional. And `barColor(none)` on the
trending bars leaves those candles their own colour, which is a stronger picture
than painting them a second colour.

---

## Choosing between a plot, a level and a drawing

These three overlap, and picking the wrong one produces a script that works and
then becomes painful to change. The distinction is not aesthetic.

| | `plot` | `level` | `draw.line` |
|---|---|---|---|
| Shape | One value per bar | One horizontal line across the pane | A segment between two anchored points |
| How many | Fixed at compile time, one per call | Fixed at compile time, one per call | As many as the script creates, any time |
| Value | A different value on every bar | One price, re-read every bar; the last bar's wins | Two fixed points, movable later |
| History | Retained per bar, readable with `[]` | Not a series you can read back | Not readable back at all |
| Costs | A plot slot | No plot slot | No plot slot, but memory per live object |
| Good for | An indicator, a band edge, a stop that moves every bar | A threshold, yesterday's high, a zero line | A trendline between two pivots, a zone, an annotation |

The tie-breaker: **if the thing has a value on every bar, plot it**. If it has
one value that the whole pane should show at a single height, make it a level.
If it starts somewhere in the past and ends somewhere else, draw it.

---

## Where to go next

The three pages that follow take the top three rows of the surface table in
full. Start with plots: everything else names a plot or sits beside one.

## See also

- [plots.md](./plots.md) for the plot family in full: styles, colours, widths, offsets, panes and number formatting
- [fills.md](./fills.md) for shaded bands between two plots, and between a plot and a fixed value
- [levels.md](./levels.md) for horizontal reference lines, data-derived levels, a fixed pane range and the price axis
- [labels-and-shapes.md](./labels-and-shapes.md) for `signal` markers and text plates anchored at a price
- [lines-and-boxes.md](./lines-and-boxes.md) for the `draw` objects a script creates, moves and deletes
- [tables.md](./tables.md) for the grid pinned to a corner of a pane
- [../README.md](../README.md) for the rest of the documentation
- [../../spec/stdlib.md](../../spec/stdlib.md) section 14 for the drawing calls, and section 18 for the whole chart contract map
- [../../spec/language.md](../../spec/language.md) section 7.1 for why the drawing surfaces are top level only
- [../../examples/README.md](../../examples/README.md) for twelve complete scripts that use every surface on this page
