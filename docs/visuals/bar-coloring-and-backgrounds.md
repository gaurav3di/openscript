# Bar colouring and backgrounds

By the end of this page you will be able to recolour the instrument's candles
from a study, shade the pane behind everything on the bars that matter, say
which study owns the candles when two of them want to paint, and explain why a
regime belongs to a bar rather than to a price.

## The two calls

```
barColor(color)         // recolour the instrument's own candles on this bar
background(color)       // shade the full height of this bar's column, behind everything
```

Both may appear anywhere: inside an `if`, inside a loop, inside a function. They
are per-bar paint, not part of the study's fixed shape, so they are on the
anywhere list of [`language.md`](../../spec/language.md) section 15.3 and the top
level rule (OS3006) does not apply to them.

| | `barColor(color)` | `background(color)` |
|---|---|---|
| Paints | The instrument's candles or bars | The full height of the bar's column |
| Sits | In front, as the candle itself | Behind everything else in the pane |
| Lands in | The contract's price bar colours | The contract's pane background |
| Absent colour | Leaves the bar its own colour | Clears that bar's shading |
| One per | Program | Program |

Both are the cheapest surfaces in the language. Each is one entry in the
compiled program, carrying one colour per bar, and neither creates an object,
holds a handle or needs deleting.

## Recolouring the candles

`barColor` takes the instrument's own price bars and repaints them. It does not
add anything to the chart: it changes what is already there.

That is worth pausing on, because it is a trade rather than a gain. **A candle's
colour already carries information**, namely whether the bar closed above or
below where it opened, and a study that repaints it takes that away and puts its
own meaning in its place. You are spending a signal the reader already had.

Two consequences follow:

- **Paint a state the reader cannot get otherwise.** Trend direction, regime,
  which side of a trailing stop price is on. Not something they could read off
  the candle anyway.
- **Paint only the bars that matter.** `barColor(none)` leaves a bar its own
  colour, so a study that marks eleven interesting bars out of two hundred
  should pass an absent colour on the other hundred and eighty-nine rather than
  painting every bar in a slightly different shade of the same idea.

```
version 1

study("Trend regime", overlay = true, precision = 2)

fastLen = input(20,   "Fast length", min = 1, max = 500)
slowLen = input(50,   "Slow length", min = 1, max = 500)
paint   = input(true, "Recolour the candles")

fast = ema(close, fastLen)
slow = ema(close, slowLen)

// up is absent during warmup and not false, because a comparison with an absent
// operand is absent. That is what makes the three-state paint below possible
// without a separate warmup test.
up = fast > slow

// Three states, not two. Painting `up ? lime : red` would colour every one of
// the first forty-nine bars red and mean it, because an absent condition takes
// the false branch.
tint = isNone(up) ? none : (up ? lime : red)

// The switch is not decoration. See the single publisher rule below.
barColor(paint ? tint : none)

plot(fast, "Fast", aqua,   width = 2)
plot(slow, "Slow", orange, width = 2)
```

### Which study wins

Inside one script the rule is simple and needs no special case: `barColor` is
one field of the compiled program carrying one colour per bar, so a script with
three `barColor()` calls writes the same place three times and **the last write
on the bar wins**. That is the same rule as every other per-bar output, which is
why it takes one sentence here and none in the specification's channel section.

Between two studies the rule has a name: **the single publisher rule. Only one
study colours the candles at a time, and the winner is stable from frame to
frame.** A candle has one body and one border, so there is no honest way to
split it between two studies that both have an opinion; and a winner that
changed as the chart redrew would make the candles flicker between two meanings,
which is worse than either meaning alone.

The rule is written down rather than left to the host: **the owner is the study
latest in the chart's own study order that paints**, which is the order the
legend lists and the order a user changes deliberately, and every other study's
bar colouring is not drawn. `compiled-program.md` section 11 states it. Two
consequences are worth knowing while you write a study: dropping a second
colouring study on top takes the candles, which is usually what the person
dropping it meant, and adding a study that does not paint changes nothing.

What the rule guarantees you as a script author is that it is exactly one, and
that it does not change underneath the reader. What it asks of you is two lines
of courtesy:

- **Give the user a switch.** An input named "Recolour the candles" lets a
  reader keep your study and hand the candles back to another one without
  deleting anything. The example above has it, and so does the trailing stop
  example in the examples folder.
- **Say so in the title or the description.** A study that quietly takes the
  candles is a study nobody can debug when two of them are on the chart.

## Shading the pane

`background` paints the full height of this bar's column, behind the candles,
the plots, the fills and everything else in the pane the study draws in. For an
overlay study that is the price pane; for a study with its own pane it is that
pane.

There is no from and no to. **A shaded region is made of consecutive bars that
each paint themselves**, and it ends on the first bar that does not:

```
version 1

study("Session window", overlay = true)

window = input("0915-0930", "Shade this window")
shade  = input(true,        "Shade it")

// session.isIn reads the window in the chart's own timezone, so this study says
// the same thing to a reader in another country without a calendar anywhere.
inWindow = session.isIn(window)

// Behind the candles rather than as a fourth line: "the market is in the first
// fifteen minutes" is a fact about the bar and has no price to sit at.
background(shade and inWindow ? fade(silver, 92) : none)
```

Transparency is not optional here. The background covers the whole height of the
bar, over the candles and under everything, so anything below about 85 percent
transparency turns the shaded stretch into a block with a chart faintly visible
inside it. Start at `fade(c, 90)` and go up.

## Why a regime is a property of a bar, not a price

This is the idea that decides, every time, whether to reach for `background` or
for `draw.box`, and it is worth more than the API above it.

Ask what the thing you want to show is attached to.

**A supply zone is attached to prices.** It runs from 24,180 to 24,240 and it
means something at those prices and not at others. Price can be inside it, above
it or below it. It has a top and a bottom because the top and the bottom are the
information. That is a box: two times, two prices, a handle and a lifecycle.

**A regime is attached to bars.** "Volatility is expanded", "the session is in
its first fifteen minutes", "the higher timeframe is in an uptrend", "this study
is still warming up": none of those is truer at 24,180 than at 24,240. They are
statements about a moment, and a moment on a chart is a bar. That is a
background, which paints the whole height of the bar because the whole height of
the bar is what the statement covers.

Writing it per bar rather than as a region is what makes the surface behave:

| Property | Because it is per bar |
|---|---|
| The shading is exactly as long as the condition | It is recomputed from the condition on every bar, so it cannot be one bar too wide |
| It needs no anchor | There is no start time to store and no end time to guess |
| It needs no deletion | Nothing persists between bars, so nothing accumulates and no handle goes stale |
| It cannot drift when history is paged in | There is no index and no anchor to move |
| It updates when an input changes | The condition is recomputed; a drawn region would have to be found and redrawn |
| It costs one colour per bar | Not one object per region |

A box gets all six of those wrong for a regime, and pays an object and a
lifecycle for the privilege. The reverse is equally true: a background cannot
say "between these two prices", so a supply zone drawn as a background is a
study claiming the whole chart is supply.

| The fact you want to show | Surface | Anchored to |
|---|---|---|
| A value the chart has on every bar | `plot` | The bar and the value |
| The space between two values | `fill` | Two plots |
| A fixed reference price | `level` | A price |
| A price band over a stretch of time | `draw.box` | Two times and two prices |
| A direction this bar is in | `barColor` | The bar |
| A regime this bar is in | `background` | The bar |
| Something that happened on this bar | `signal` | The bar |
| The current reading of several things | `table` | A corner of the pane |

## Layering both

The two surfaces carry different kinds of fact, so a study can use both at once
without saying anything twice: direction on the candles, regime behind them.

```
version 1

study("Volatility regime", overlay = true, precision = 2)

atrLen  = input(14,  "ATR length",                    min = 1, max = 200)
meanLen = input(50,  "Compare against",               min = 2, max = 500)
hot     = input(1.5, "Expanded above this ratio",     min = 1, max = 5)
cold    = input(0.7, "Compressed below this ratio",   min = 0.1, max = 1)
paint   = input(true, "Recolour the candles")

// Named once and used twice. Two calls to atr(atrLen) would be two call sites,
// and a call site has its own state, so the same number would be computed twice
// per bar for nothing.
atrValue = atr(atrLen)
ratio    = atrValue / sma(atrValue, meanLen)

up   = close > ema(close, meanLen)
tint = isNone(up) ? none : (up ? lime : red)

// The candles carry direction. The background carries the regime. Neither
// repeats the other, which is the test for whether both are earning their place.
barColor(paint ? tint : none)

background(isNone(ratio) ? none :
           (ratio > hot  ? fade(orange, 90) :
           (ratio < cold ? fade(navy, 90) : none)))
```

The nested ternary is the ordinary way to write a three-way choice, and it stays
readable because each arm is one call. When a fourth state arrives, lift it into
a `switch` before the paint call rather than adding a third level:

```
tone = none
switch
    case isNone(ratio)
        tone = none
    case ratio > hot
        tone = fade(orange, 90)
    case ratio < cold
        tone = fade(navy, 90)
    default
        tone = none

background(tone)
```

`tone` is declared before the `switch` because a name first assigned inside an
arm is local to that arm. That rule exists to make the "declared in one arm
only" bug impossible, and here it costs one line and reads better anyway: the
default is visible at the top.

## Paint on the moving bar

The newest bar of a live chart is executed again on every update, and **paint is
recomputed from scratch every time**. Neither call is deferred the way a
`signal`, an `alert` or an order is.

That difference is deliberate and it is not an inconsistency. A signal is a
claim that something happened, and a claim that evaporates before the bar closes
was never worth making, so signals wait for confirmation. Paint is a statement
about what the data currently shows, it costs nothing to redraw, and the
rollback rule means nothing accumulates: the bar's output is thrown away and
rebuilt on every tick, so the last state is the only state.

If a particular paint should only appear on a settled bar, the script says so
itself, in a word the reader can see:

```
barColor(bar.isConfirmed ? tint : none)
```

## A study that draws its own candles

`barColor` recolours the instrument's bars. A study that produces its own
bar-shaped output, such as a smoothed or higher timeframe candle, draws it with
`plotCandles` and colours it there:

```
plotCandles(openHT, highHT, lowHT, closeHT, "Daily",
            colorUp = fade(lime, 40), colorDown = fade(red, 40))
```

The two do not interact. `plotCandles` is a plotted column with four named
sources, so it obeys the plot rules: top level only, hidden on a bar by passing
absent values, and coloured through its own arguments. `barColor` is per-bar
paint on somebody else's candles. Reaching for the wrong one is the commonest
way a higher timeframe candle study ends up fighting the chart.

## Common mistakes

| Symptom | Cause | Fix |
|---|---|---|
| The first fifty bars are painted "down" | An absent condition taking the false branch | `isNone(cond) ? none : (cond ? up : down)` |
| The shaded stretch hides the candles | Transparency too low | `fade(c, 90)` or higher for a background |
| The candles are the wrong colour with two studies loaded | Two studies both publishing bar colours | Turn one off at its switch; only one study owns the candles |
| A study cannot be kept without its candle colours | No switch declared | Add an input and pass `none` when it is off |
| The shading is one bar too long | Painting a region rather than a condition | Paint per bar from the condition itself |
| A zone drawn as a background covers the whole pane | A price band painted as a regime | Use `draw.box`, which has a top and a bottom |
| The colour flickers during a bar | The condition genuinely changes intrabar | Guard with `bar.isConfirmed` if only settled bars should paint |
| Nothing paints at all | `fade(c, 100)` | 100 is invisible: `fade` takes transparency |

## See also

- [overview.md](./overview.md) for the map of every drawing surface and what each one costs
- [colors.md](./colors.md) for building the colours these two calls take, and for transparency that survives both chart themes
- [lines-and-boxes.md](./lines-and-boxes.md) for a zone that has a top and a bottom
- [labels-and-shapes.md](./labels-and-shapes.md) for marking one bar rather than a stretch of them
- [tables.md](./tables.md) for stating the regime in words as well as in colour
- [plots.md](./plots.md) for `plotCandles` and the per-bar colour argument in full
- [../README.md](../README.md) for the rest of the documentation
- [../../spec/stdlib.md](../../spec/stdlib.md) section 14.3 for the authoritative `barColor` and `background` reference
- [../../spec/language.md](../../spec/language.md) sections 6.4, 6.6 and 7.5 for absent comparisons, absent conditions and the moving bar
- [../../examples/02-supertrend.oscript](../../examples/02-supertrend.oscript) for candles recoloured by which side of a stop price is on
- [../../examples/05-opening-range.oscript](../../examples/05-opening-range.oscript) for a background that says the range is still forming
