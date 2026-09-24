# Colour functions

By the end of this page you will be able to name a colour, build one from
channels, make one transparent by the right amount, blend two of them into a
scale, and know which argument takes a percentage and which takes a fraction.

## The three ways to write a colour

```
aqua                    // a named colour
#ff8800                 // hex, 24 bit
#ff880080               // hex with an alpha byte
rgb(255, 136, 0)        // built from channels
```

Names are bare, with no prefix, because a colour appears in almost every line
that draws something and a prefix on a fixed vocabulary of nineteen words is
pure noise. Each name is an ordinary global of type `color` at full opacity, so
the standard library can add more without a grammar change.

The names are the table under
[The nineteen named colours](../constants.md#the-nineteen-named-colours) in the
constants reference.

Their exact channel values are fixed in the library manifest and are part of the
conformance suite, so a study looks the same on every engine. That is the point
of fixing them: a shared script whose colours shifted between two charts would
be describing a different picture to each reader.

A colour has no warmup. It is a plain value, not a series, unless a script
builds one per bar out of per-bar data, in which case it is a `series color` and
the drawing functions accept it in the same argument. That equivalence is worth
knowing before the entries: **a constant colour and a per-bar colour are the
same argument.** Pass a `color` and it lands on the plot's style; pass a
`series color` and it lands on the per-bar colour callback instead. A script
that starts with one colour and later wants two does not have to move to a
different function.

---

## 1. Construction

### `rgb(r, g, b)`

A fully opaque colour from three channels.
Parameters: `r` `number` required, 0 to 255; `g` `number` required, 0 to 255;
`b` `number` required, 0 to 255.
Returns `color`.

```
plot(signalLine, "Signal", rgb(255, 136, 0))
```

### `rgba(r, g, b, a)`

The same with an alpha.
Parameters: `r` `number` required, 0 to 255; `g` `number` required, 0 to 255;
`b` `number` required, 0 to 255; `a` `number` required, 0 to 1 where 1 is
opaque.
Returns `color`.

```
background(rgba(255, 0, 0, 0.08))
```

A channel argument outside its range is an argument error (OS4009), not a clamp.
A colour computed from data and landing at 300 is a bug in the computation, and
clamping it would draw a plausible picture from a broken number. The same
applies to an alpha above 1 or below 0.

**Not raised yet.** OS4009 is in the catalogue and nothing raises it: a channel
outside its range reaches the chart rather than stopping the bar.

### `fade(color, percent)`

The same colour at `percent` transparency.
Parameters: `color` `color` required; `percent` `number` required, 0 to 100
where 100 is invisible.
Returns `color`.

```
fill(upper, lower, fade(aqua, 88))
```

### `withAlpha(color, a)`

The same colour at a stated alpha.
Parameters: `color` `color` required; `a` `number` required, 0 to 1 where 1 is
opaque.
Returns `color`.

```
plot(band, "Band", withAlpha(orange, 0.35))
```

### `alpha(color)`

Read a colour's alpha.
Parameters: `color` `color` required.
Returns `number`, 0 to 1.

```
isSolid = alpha(userColor) == 1
```

### `mix(a, b, weight)`

Blend of two colours.
Parameters: `a` `color` required; `b` `color` required; `weight` `number`
required, 0 to 1 where 0 gives `a` and 1 gives `b`.
Returns `color`.

```
barColor(mix(red, lime, clamp(strength, 0, 1)))
```

### `hsl(h, s, l)` (planned)

Hue, saturation and lightness construction.
Parameters: `h` `number` required; `s` `number` required; `l` `number` required.
Returns `color`.

```
tint = hsl(200, 0.6, 0.5)
```

### `gradient(value, from, to, colorFrom, colorTo)` (planned)

Position a value between two colours.
Parameters: `value` `number` required; `from` `number` required; `to` `number`
required; `colorFrom` `color` required; `colorTo` `color` required.
Returns `color`.

```
barColor(gradient(rsi(close, 14), 30, 70, lime, red))
```

Until it ships, the same picture is two lines with `clamp` and `mix`, shown in
the first worked example below.

---

## 2. Transparency and opacity are opposites

This is the one part of the colour surface that catches people, so it is worth
the table.

| Call | Argument | 0 means | The high end means |
|---|---|---|---|
| `fade(color, percent)` | percent transparency, 0 to 100 | unchanged, fully visible | `100`: invisible |
| `withAlpha(color, a)` | alpha as a fraction, 0 to 1 | invisible | `1`: fully opaque |
| `rgba(r, g, b, a)` | alpha as a fraction, 0 to 1 | invisible | `1`: fully opaque |
| `alpha(color)` | reads alpha, 0 to 1 | invisible | `1`: fully opaque |

`fade` takes transparency as a percentage because that is how a chart's own
style controls are labelled, and a script that wants to agree with the number a
user sees in the settings dialog should use the same convention. `withAlpha`
exists for the other convention, which is what every colour value in the world
is stored as. The two are the same idea from opposite ends:

```
fade(aqua, 88)          // the same colour as
withAlpha(aqua, 0.12)
```

Guessing wrong here draws something invisible, which looks like a broken script
rather than a wrong number, so both names state their unit in the entry above.

A useful pair of rules of thumb: a fill behind a plot wants roughly `fade(c,
85)` to `fade(c, 95)`, and a pane background wants more transparency than that
again, because it covers the full height of the bar's column and sits behind
everything the reader is actually trying to look at.

---

## 3. Where a colour lands

A colour reaches the host as a colour string on whatever field carries it. An
alpha below 1 is carried in that string's alpha channel, so there is no separate
opacity field to keep in step.

| Passed to | Lands on |
|---|---|
| `plot(..., color = c)` with a constant | that column's style colour |
| `plot(..., color = c)` with a series | that column's per-bar colour callback |
| `fill(..., color = c)` | the shaded band's colour |
| `fill(..., colorUp = ..., colorDown = ...)` | the band's two directional colours |
| `level(..., color = c)` | the horizontal level's colour |
| `signal(..., color = c)` | the marker's colour |
| `barColor(c)` | the instrument's own candle for that bar |
| `background(c)` | the pane background for that bar's column |
| `cell(..., textColor = ..., bgColor = ...)` | that cell's text and background |
| any `draw` constructor, as the chart contract map in [`stdlib.md`](../../../spec/stdlib.md) section 18 lists them | the object's line, fill or text colour |

**An absent colour is not an error and is not black.** `background(none)` and
`barColor(none)` leave the bar alone, which is how a conditional paint switches
itself off:

```
background(risky ? fade(red, 92) : none)
barColor(trend > 0 ? lime : trend < 0 ? red : none)
```

That second line is worth reading twice. When `trend` is absent during warmup,
both comparisons are absent, both ternary conditions take their false arm, and
the bar keeps its own colour. Absence reaching a drawing surface is always a
gap, never a zero and never a default colour.

---

## 4. Three worked examples

### A heat scale without the planned `gradient`

```
version 1
study("Volume heat", overlay = true)

len = input(20, "Average length", min = 2, max = 500)

rv = relativeVolume(len)

// clamp first, so a single enormous bar does not saturate every other bar's
// colour, and mix second. weight is 0 at one times average and 1 at three.
weight = clamp((rv - 1) / 2, 0, 1)

barColor(isNone(rv) ? none : mix(silver, orange, weight))
```

### A band whose fill says which way it is leaning

```
version 1
study("Band", overlay = true)

b = bollinger(close, 20, 2)

basis = plot(b[0], "Basis", fade(silver, 30))
upper = plot(b[1], "Upper", aqua)
lower = plot(b[2], "Lower", aqua)

// A light fill between the outer bands, and a stronger one between price and
// the basis so the lean is visible without reading the numbers.
fill(upper, lower, fade(aqua, 92))
fill(basis, upper, colorUp = fade(lime, 88), colorDown = fade(red, 88))
```

### A colour the user can change without editing the script

```
version 1
study("User colour", overlay = true)

lineColor = input(aqua, "Line colour")
showFill  = input(true, "Shade the gap")

fast = ema(close, 9)
slow = ema(close, 21)

f = plot(fast, "Fast", lineColor)
s = plot(slow, "Slow", fade(lineColor, 40))

fill(f, s, showFill ? fade(lineColor, 90) : none)
```

The host already generates a colour row in the settings dialog for every plot,
without the script declaring anything. Declaring a `color` input and passing it
in takes over that row rather than adding a second one, which is what you want
when one chosen colour drives several plots and a fill: the user changes it once
and the whole study follows.

## See also

- [drawing.md](./drawing.md) for `plot`, `fill`, `background`, `barColor` and the drawing objects that take these colours
- [input.md](./input.md) for the colour input that puts a swatch in the settings dialog
- [math.md](./math.md) for `clamp` and `round`, which keep a computed channel or weight in range
- [series.md](./series.md) for the per-bar values a colour is usually computed from
- [../../../spec/stdlib.md](../../../spec/stdlib.md) for the specification these entries are derived from
