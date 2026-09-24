# Settings and style

By the end of this page you will know exactly what settings dialog a script gets
without asking for one, which rows come from your `input()` calls and which the
host generates for every plot, how to hand a colour to the reader under a name
you chose, and what a saved chart layout has to hold to bring a study back
exactly as it was.

## The dialog has two halves

Add a study to a chart and it arrives with a dialog, a legend row and a place in
the picker. None of that is declared. All of it is generated from two sources
the compiler fixes before bar 0.

| Half | Built from | Changes |
|---|---|---|
| Inputs | Your `input()` calls, in source order | The values the calculation reads |
| Style | The fixed drawing surface: every `plot`, and every other drawing call [../spec/language.md](../spec/language.md) section 15.3 makes top level only | How the same numbers look |

The split is the point. The Inputs half changes what the study computes, so a
value there belongs to the script's author, who chose its bounds and its default.
The Style half changes nothing the script computes, so it belongs entirely to the
reader, and no script has to spend a line on it.

```
version 1

study("Two averages", overlay = true, precision = 2)

fastLen = input(9,  "Fast length", min = 1, max = 500)
slowLen = input(21, "Slow length", min = 1, max = 500)

plot(ema(close, fastLen), "Fast", aqua,   width = 2)
plot(ema(close, slowLen), "Slow", orange, width = 2)
```

Two inputs and two plots produce a dialog with two number rows and two style
groups, one per plotted column, each carrying a colour, an opacity, a thickness,
a line style and a plot style. The script asked for none of it.

## What the declaration decides

The declaration is where a study says how it wants to be placed and formatted.
Every value here is a compile-time constant, because the pane, the axis and the
legend exist before the first bar runs. An `input()` counts as a constant, so any
of these can be handed to the reader.

The options themselves, with the type, the default and the meaning of each, are
the table in [../spec/language.md](../spec/language.md) section 13.2, "study
options".

```
version 1

study("Oscillator", precision = 2, format = "percent", range = [0, 100],
      group = "Momentum")

len = input(14, "Length", min = 2, max = 200)

level(70, "Overbought", red)
level(50, "Middle", gray)
level(30, "Oversold", lime)

plot(rsi(close, len), "Oscillator", purple, width = 2)
```

`range = [0, 100]` is worth the six characters on any bounded oscillator. Without
it the pane rescales to whatever the data did, so 70 stops meaning overbought and
the reader is comparing a line against a moving frame. A reversed or single
element range is OS3016.

`precision` belongs on the declaration and almost never on a plot. Setting
`precision` or `format` on a plot changes the formatting of the price scale that
plot maps to, so a plot drawn over the price pane reformats the instrument's own
axis, which is very rarely what anyone wants. The compiler warns when a script
does it.

## The style rows every plot carries

For each plotted column, the host generates these rows without the script
declaring any of them.

| Row | Starts at | The reader can |
|---|---|---|
| Colour | The plot's colour argument | Pick any colour |
| Opacity | Full, unless the colour carried an alpha | Fade the line without editing the script |
| Thickness | `width`, default `1.5` | Thicken or thin it |
| Line style | Solid | Switch to dashed or dotted |
| Plot style | `style`, default `"line"` | Switch between line, line with markers, step, area, histogram and column |
| Visibility | Shown | Hide the column and its legend row |

A `fill` carries its own colour and opacity rows, and a `level` carries colour,
line style and thickness. A `table` carries its text and background colours.

Two things follow, and both save a script work.

**A script never writes style for the reader's benefit.** Write the colour that
makes the study readable on the day you ship it and stop there. A trader who
wants a thicker line, a dashed line or a histogram instead of a column changes it
in the dialog, and the change survives in the saved layout. A script that tried to
be exhaustive here would add a dozen inputs that duplicate controls the reader
already has.

**Style is a preference, and a value is a computation.** The line between the two
halves of the dialog is exactly that. If a change affects a number, it belongs in
an input. If it affects only how the same number looks, it is already handled.

The one exception is the reason for the next section.

## A colour the reader may change under your name

Sometimes a colour means something. An up colour against a down colour, a long
stop against a short stop, one band against another: these are not styling, they
are part of what the study says. For those, declare a `color` input and pass it to
the plot.

```
version 1

study("Stop", overlay = true, precision = 2)

atrLen = input(10,  "ATR length", min = 1, max = 200)
mult   = input(3.0, "Band, in ATR", min = 0.5, max = 20)

longTint  = input(lime, "Long stop colour",  group = "Colours")
shortTint = input(red,  "Short stop colour", group = "Colours")

atrValue = atr(atrLen)
var dir  = 1
var stop = none

prevStop = stop

if close > orElse(prevStop, low)
    dir = 1
else if close < orElse(prevStop, high)
    dir = -1

stop = dir == 1 ? hl2 - mult * atrValue : hl2 + mult * atrValue

// One column cannot change colour partway along, so a stop that switches sides
// is two plots with a gap in each. Each gets its own colour input, and each
// takes over that plot's generated colour row rather than adding a second one.
plot(dir ==  1 ? stop : none, "Stop, long",  longTint,  width = 2)
plot(dir == -1 ? stop : none, "Stop, short", shortTint, width = 2)
```

**A colour input passed to a plot takes over that plot's colour row; it does not
add a second one.** That rule exists so a reader can never end up with two colour
controls for one line, set to different colours, with no way to tell which one is
winning. The input's title becomes the label, which is why a named colour input
is worth declaring at all: "Long stop colour" says more in the dialog than a
generated row labelled after the plot.

## A colour that changes per bar

The colour argument accepts either a `color` or a `series color`. Pass a constant
and it lands on the plot's style. Pass an expression that varies per bar and the
engine carries a colour per bar alongside the value. One argument covers both,
because a script that starts with one colour and later wants two should not have
to move to a different function.

```
version 1

study("Momentum histogram", precision = 4)

upTint   = input(lime, "Rising colour")
downTint = input(red,  "Falling colour")

m = macd(close, 12, 26, 9)

level(0, "Zero", gray)

plot(m[0], "MACD",   aqua)
plot(m[1], "Signal", orange)
plot(m[2], "Histogram", m[2] > 0 ? upTint : downTint, style = "histogram")
```

When a plot's colour varies per bar, the script is deciding the colour on every
bar, so the generated colour row can no longer be the last word. Build the per-bar
colour out of colour inputs, as above, and the reader keeps control of both
colours through rows you named. A per-bar colour built from bare literals is a
colour the reader cannot change at all, which is the same failure as a hard-coded
length.

Four colour helpers cover nearly every case:

| Call | Does |
|---|---|
| `rgb(r, g, b)` | Channels 0 to 255, fully opaque |
| `rgba(r, g, b, a)` | The same with alpha 0 to 1, where 1 is opaque |
| `fade(color, percent)` | The same colour at `percent` transparency, where 100 is invisible |
| `withAlpha(color, a)` | The same colour at a stated alpha, 0 to 1 |

`fade` takes transparency and `withAlpha` takes opacity. They are opposite
conventions on purpose, because a chart's own controls are labelled one way and
a colour value is written the other, and a script that guesses draws something
invisible. `fade(aqua, 92)` is the usual way to write a band shade.

## Paint the reader did not ask for

`background()` and `barColor()` are per-bar paint rather than plotted columns, so
they carry no style rows at all. The reader cannot turn them off in the Style
half, because there is nothing there to turn off. Anything that paints over the
reader's own candles or the whole pane therefore needs a switch of your own.

```
version 1

study("Session shading", overlay = true)

shade  = input(true,  "Shade the session")
paint  = input(false, "Recolour the candles")

tint   = input(aqua, "Shade colour", group = "Colours")

inSession = session.isIn("0915-1530")

// Passing an absent colour leaves the bar alone, which is how a conditional
// paint switches itself off. It is not an error.
background(shade and inSession ? fade(tint, 94) : none)
barColor(paint ? (close > open ? lime : red) : none)
```

Default a paint switch to `false` unless the study is about the paint. A study
that recolours the instrument's candles the moment it is added has overwritten
something the reader may have configured deliberately.

## What a saved chart layout holds

A layout is what lets a chart come back tomorrow as the chart you left. For each
study on it, the layout stores four things.

| Stored | Keyed by | Written by |
|---|---|---|
| The value of each input | The name the input assigns | The reader, in the Inputs half |
| Each style override | The plot's, fill's or level's title | The reader, in the Style half |
| The pane placement and scale | The study instance | `overlay` and `scale`, then the reader dragging |
| The pinned script revision | The study instance | The revision the chart was holding when the study was added |

Restoring is one rule per input: **the effective value is the stored value when
the layout has one and it passes validation, and the declared default otherwise.**
Validation is exact: the type must match, a number must be inside `min` and `max`,
a select value must be one of `options`.

**A stored value that fails validation stops the study and says which row and
which bound, rather than quietly using the default.** That is the same decision as
in the dialog itself, for the same reason: a study that came back under its own
name drawing numbers the reader never configured is worse than one that says it
cannot start. The usual cause is a script edit that tightened a bound, which is a
change the author can see and the reader cannot.

The fourth row is the one people forget. A layout pins a revision, so reopening a
chart restores the study as it was when you added it, not as the script is today.
[revisions.md](./revisions.md) covers what moves a pin and why nothing else does.

## Names are the contract with a saved layout

Because the layout keys a value by a name, a name is a promise.

- An input's stored value is keyed by **the name the input assigns**, so renaming
  `len` to `length` orphans every reader's stored value and the study comes back
  on the default.
- A plot's style override is keyed by **the plot's title**, so renaming "Fast" to
  "Fast EMA" orphans the reader's colour and thickness.
- Titles must be unique within a file (OS3017), because the legend row, the
  dialog and the layout all key on them, and two columns sharing a title would
  overwrite each other's stored settings.

There is no way around this and no cleverness that would help: with nothing to
match on, the only honest behaviour is to fall back to the default. What follows
is a working habit rather than a language rule.

**Choose the name and the title once, before anyone else loads the study.** After
that, treat a rename as a change your readers will see, and say so in the revision
message. When a rename is genuinely necessary, expect every saved layout to come
back on defaults and tell people that before they find out.

## Worked example: a study that gives away everything worth giving

```
version 1

study("Channel", overlay = true, precision = 2, short = "CH")

len = input(20,   "Length", min = 2, max = 500,
            tooltip = "Bars in the channel and in the basis.")
src = input(hlc3, "Source")

mult = input(2.0, "Width, in ATR", min = 0.2, max = 10, step = 0.1,
             group = "Channel")

upperTint = input(aqua,   "Upper colour", group = "Colours")
lowerTint = input(aqua,   "Lower colour", group = "Colours")
basisTint = input(orange, "Basis colour", group = "Colours")
shade     = input(true,   "Shade the channel", group = "Colours")

basis = ema(src, len)
band  = mult * atr(len)

upper = basis + band
lower = basis - band

plot(basis, "Basis", basisTint, width = 2)
upperPlot = plot(upper, "Upper", upperTint)
lowerPlot = plot(lower, "Lower", lowerTint)

// fade takes transparency, so 100 is invisible: that is how a shade is switched
// off without wrapping a top level call in an if.
fill(upperPlot, lowerPlot, fade(upperTint, shade ? 94 : 100))
```

What the reader gets: three number rows, four colour rows and a switch in the
Inputs half, and in the Style half a full set of thickness, line style, plot style
and visibility controls for each of the three columns plus the shade. What the
script spent on it: eight lines. What the script did not have to write: a single
thickness input, a single line style input, or any code to save or restore any of
it.

## See also

- [inputs.md](./inputs.md) for every input kind, grouping, tooltips and the rule
  that decides what belongs in the dialog at all
- [revisions.md](./revisions.md) for the revision a layout pins, and what a rename
  does to values readers have already saved
- [visuals/plots.md](./visuals/plots.md) and [visuals/fills.md](./visuals/fills.md)
  for the calls whose style rows this page describes
- [visuals/overview.md](./visuals/overview.md) for the whole drawing surface and
  what is fixed before bar 0
- [reference/functions/color.md](./reference/functions/color.md) for colour
  construction, fading and blending
- [../spec/language.md](../spec/language.md) section 13 for the declaration's
  options as the specification states them
