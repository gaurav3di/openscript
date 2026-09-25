# Technical analysis functions

By the end of this page you will be able to find any moving average, trend
measure, oscillator, volatility measure, range builder or volume study in the
standard library, call it with the right arguments, and know exactly which bar
it starts producing values on.

## How to read an entry

Every entry gives four things and then one line of code you can paste into a
script.

| Part | Means |
|---|---|
| Signature | The name with every parameter and its default |
| Parameters | Each parameter's type and default, `required` when it has none |
| Returns | The type of the result |
| Warmup | The first bar the call can produce a value for, counting the oldest bar in the dataset as bar 0 |

Warmup is a promise. A warmup of "bar `len - 1`" means the call returns `none`
on bars 0 to `len - 2` and a value from bar `len - 1` onward, on every
conforming engine, to the bar. It is written down rather than described as
"after a while" because an indicator that starts one bar late does not match a
reference implementation, and a trader comparing two charts has no way to see
which one is wrong.

Warmup is counted in bars of the call's own source, so warmups compose. The
source of `sma(ema(close, 10), 10)` is itself absent until bar 9, and the outer
mean needs ten present values after that, so the pair is absent until bar 18.

Three rules cover the whole page:

1. **A windowed call propagates absence.** If any bar in the window is absent,
   that bar's result is absent. There are exactly three functions in the library
   that ignore absent values instead, and they are named for it: `sumSkip`,
   `avgSkip` and `countPresent`, all in [series.md](./series.md).
2. **A length must be a whole number of 1 or more.** A fractional length is an
   argument error (OS3004) naming `round`, never a silent truncation, because a
   length of 14.5 is a bug in the script and rounding it hides the bug. A length
   may be a series, in which case it is read per bar and the warmup is measured
   against the largest value the length has taken so far.
3. **A call marked `(planned)` is not in the first release.** It is listed so
   the surface is legible: you can see that the gap is known and named rather
   than wonder whether it was forgotten. Calling one is an error saying it is
   planned, not an error saying the name does not exist.

## Functions with more than one output

A function with more than one output returns an `array<number>` holding this
bar's outputs, in the order its entry documents. The array itself is never
absent and never changes length: each element carries its own warmup and holds
`none` until it is reached.

```
version 1
study("MACD", precision = 4)

m = macd(close, 12, 26, 9)

plot(m[0], "MACD", aqua)
plot(m[1], "Signal", orange)
plot(m[2], "Histogram", gray, style = "histogram")
```

The length is fixed so that `m[1]` is never an out of range error on an early
bar. A library that grew the array as warmup completed would break scripts only
at the left edge of the chart, which is the hardest place to notice anything.

One call returning three numbers rather than three named calls matters for
speed as well as for reading: state is allocated per call site, so three
separate functions sharing one smoothing would compute that smoothing three
times on every bar.

---

## 1. Moving averages and trend

In this section `src` is any `series number` and `len` is a length under rule 2
above.

### Picking a mean

| You want | Use | Why |
|---|---|---|
| The plain average everyone means by "the 20 day" | `sma` | No weighting, no seeding argument, no surprises |
| A mean that reacts sooner and keeps reacting | `ema` | Weight `2 / (len + 1)`, never fully forgets an old bar |
| The smoothing the classic oscillators are built from | `rma` | Weight `1 / len`; `atr`, `rsi` and their relatives use it |
| Less lag at the same length | `hma` | Costs a longer warmup |
| A mean the user can switch from the settings dialog | `ma` | One call whose `type` a `select` input feeds |

### `sma(src, len)`

Arithmetic mean of the last `len` values.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(sma(close, 20), "SMA 20", aqua)
```

### `ema(src, len)`

Exponential mean, weight `2 / (len + 1)`, seeded on bar `len - 1` with the
simple average of those `len` values.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(ema(close, 21), "EMA 21", orange)
```

### `wma(src, len)`

Linearly weighted mean, the newest value weighted `len` and the oldest weighted
1.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(wma(hlc3, 10), "WMA 10", lime)
```

### `rma(src, len)`

Smoothed mean with weight `1 / len`, seeded like `ema`. This is the smoothing
the classic oscillators use, which is why it is in the library rather than left
to each study to write.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(rma(trueRange(), 14), "Smoothed range", silver)
```

### `hma(src, len)`

Weighted mean tuned to lag less than `wma` at the same length.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series number`. Warmup: bar `len + round(sqrt(len)) - 2`.

```
plot(hma(close, 55), "HMA 55", purple)
```

### `dema(src, len)`

Double exponential mean: an `ema` with its own lag subtracted once.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series number`. Warmup: bar `2 * len - 2`.

```
plot(dema(close, 20), "DEMA 20", aqua)
```

### `tema(src, len)`

Triple exponential mean: the same lag correction applied twice.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series number`. Warmup: bar `3 * len - 3`.

```
plot(tema(close, 20), "TEMA 20", teal)
```

### `vwma(src, len)`

Mean weighted by each bar's volume, so a bar nobody traded counts for little.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series number`. Warmup: bar `len - 1`. Absent on every bar when the
host supplies no volume.

```
plot(vwma(close, 20), "VWMA 20", olive)
```

### `swma(src)`

Fixed four bar symmetric mean, weights 1, 2, 2, 1 divided by 6.
Parameters: `src` `series number` required.
Returns `series number`. Warmup: bar 3.

```
plot(swma(hl2), "Smoothed midpoint", silver)
```

### `alma(src, len, offset = 0.85, sigma = 6)`

Gaussian weighted mean whose peak `offset` slides between lag and smoothness: 1
puts the peak on the newest bar, 0 puts it on the oldest.
Parameters: `src` `series number` required; `len` `number` required; `offset`
`number` default `0.85`; `sigma` `number` default `6`.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(alma(close, 21, offset = 0.9, sigma = 6), "ALMA", aqua)
```

### `linreg(src, len, offset = 0)`

Value of the least squares line through the last `len` points, read `offset`
bars back along that line.
Parameters: `src` `series number` required; `len` `number` required; `offset`
`number` default `0`.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(linreg(close, 50), "Regression", fuchsia)
```

### `ma(src, len, type = "sma")`

One call whose shape a `select` input can switch, so a user changes the average
from the settings dialog without editing the script.
Parameters: `src` `series number` required; `len` `number` required; `type`
`string` default `"sma"`, one of `"sma"`, `"ema"`, `"wma"`, `"rma"`, `"hma"`,
`"vwma"`.
Returns `series number`. Warmup: the named type's own warmup.

```
plot(ma(close, 20, input("ema", "Type", options = ["sma", "ema", "wma"])), "MA", aqua)
```

### `supertrend(factor = 3, atrLen = 10)`

`[line, direction]`: a trailing band built from average true range. `direction`
is `-1` while the band is protecting a long and `1` while it is protecting a
short.
Parameters: `factor` `number` default `3`; `atrLen` `number` default `10`.
Returns `array<number>`. Warmup: element 0 at bar `atrLen`, element 1 at bar
`atrLen`.

```
st = supertrend(3, 10)
```

### `psar(start = 0.02, step = 0.02, max = 0.2)`

`[sar, direction]`: a stop that accelerates toward price, seeded from bar 0's
range.
Parameters: `start` `number` default `0.02`; `step` `number` default `0.02`;
`max` `number` default `0.2`.
Returns `array<number>`. Warmup: element 0 at bar 1, element 1 at bar 1.

```
plot(psar()[0], "PSAR", silver, style = "lineWithMarkers")
```

### `adx(diLen = 14, adxLen = 14)`

`[adx, plusDI, minusDI]`: trend strength and which side owns it.
Parameters: `diLen` `number` default `14`; `adxLen` `number` default `14`.
Returns `array<number>`. Warmup: elements 1 and 2 at bar `diLen`, element 0 at
bar `diLen + adxLen - 1`.

Missing current or previous high/low values make both directional movements
absent. Direction selection compares the raw differences first; equal positive
movements select zero on both sides. A selected overflowing movement is absent
before smoothing, so a seeded recurrence holds its state and can resume on later
valid observations. The smoothed range must also be available and nonzero for
either directional reading to be present.

```
plot(adx()[0], "ADX", white)
```

### `aroon(len = 14)`

`[up, down]`: how recently the window's high and its low were set, as a
percentage, so 100 means it was set on this bar.
Parameters: `len` `number` default `14`.
Returns `array<number>`. Warmup: both elements at bar `len`.

```
plot(aroon(25)[0] - aroon(25)[1], "Aroon spread", aqua)
```

### `ichimoku(convLen = 9, baseLen = 26, spanLen = 52)`

`[conversion, base, spanA, spanB, lagging]`: a five line trend frame.
Parameters: `convLen` `number` default `9`; `baseLen` `number` default `26`;
`spanLen` `number` default `52`.
Returns `array<number>`. Warmup: element by element at bar `convLen - 1`,
`baseLen - 1`, `baseLen - 1`, `spanLen - 1`, `baseLen - 1`.

```
plot(ichimoku()[2], "Span A", lime, offset = 26)
```

The spans come back undisplaced, at the bar they are computed on. A study draws
them forward with the plot's `offset` argument rather than having the function
shift them, because a series that arrives already shifted cannot be compared
with anything else in the script without shifting it back.

### `kama(src, len, fast = 2, slow = 30)` (planned)

Mean whose smoothing follows how directional the recent move was.
Parameters: `src` `series number` required; `len` `number` required; `fast`
`number` default `2`; `slow` `number` default `30`.
Returns `series number`. Warmup: bar `len`.

```
plot(kama(close, 10), "KAMA", aqua)
```

### `zlema(src, len)` (planned)

Exponential mean with its lag removed by displacement.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(zlema(close, 21), "ZLEMA", orange)
```

### `vidya(src, len)` (planned)

Mean whose smoothing follows relative volatility.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series number`. Warmup: bar `2 * len - 1`.

```
plot(vidya(close, 14), "VIDYA", teal)
```

### `zigzag(src, deviation)` (planned)

Swing points confirmed by a percentage reversal.
Parameters: `src` `series number` required; `deviation` `number` required.
Returns `array<number>`. Warmup: the first confirmed swing.

```
z = zigzag(close, 5)
```

### Why the bands return a direction

`supertrend` and `psar` hand back a direction next to the line because a script
almost always wants both, and deriving the flip by recomputing the line would
double the work on every bar. Direction is a number rather than a bool so that
the flip test reads as a comparison against the previous bar:

```
version 1
study("Supertrend", overlay = true)

st = supertrend(input(3.0, "Factor", min = 0.5), input(10, "ATR length", min = 1))

plot(st[0], "Supertrend", st[1] < 0 ? lime : red, width = 2)

if st[1] != st[1][1]
    signal(st[1] < 0 ? "LONG" : "SHORT")
```

---

## 2. Momentum and oscillators

A function in this section that consumes changes rather than levels carries one
extra bar of warmup, because a change needs two bars. `rsi(close, 14)` needs 14
changes, so its first value is at bar 14 and not at bar 13. Every entry states
the bar rather than leaving you to work it out.

### `rsi(src, len = 14)`

A 0 to 100 reading of how one sided the last `len` changes were.
Parameters: `src` `series number` required; `len` `number` default `14`.
Returns `series number`. Warmup: bar `len`.

```
plot(rsi(close, 14), "RSI", purple)
```

### `stoch(len = 14, smoothK = 1, smoothD = 3)`

`[k, d]`: where the close sits inside the window's range.
Parameters: `len` `number` default `14`; `smoothK` `number` default `1`;
`smoothD` `number` default `3`.
Returns `array<number>`. Warmup: element 0 at bar `len + smoothK - 2`, element 1
at bar `len + smoothK + smoothD - 3`.

```
plot(stoch(14, 3, 3)[0], "%K", aqua)
```

### `stochRsi(src, rsiLen = 14, stochLen = 14, smoothK = 3, smoothD = 3)`

`[k, d]`: the same position test applied to `rsi` instead of to price.
Parameters: `src` `series number` required; `rsiLen` `number` default `14`;
`stochLen` `number` default `14`; `smoothK` `number` default `3`; `smoothD`
`number` default `3`.
Returns `array<number>`. Warmup: element 0 at bar
`rsiLen + stochLen + smoothK - 2`, element 1 `smoothD - 1` bars after element 0.

```
plot(stochRsi(close)[0], "Stoch RSI %K", aqua)
```

### `macd(src, fast = 12, slow = 26, signal = 9)`

`[macd, signal, histogram]`: the gap between a fast and a slow exponential mean.
Parameters: `src` `series number` required; `fast` `number` default `12`; `slow`
`number` default `26`; `signal` `number` default `9`.
Returns `array<number>`. Warmup: element 0 at bar `max(fast, slow) - 1`,
elements 1 and 2 at bar `max(fast, slow) + signal - 2`.

```
plot(macd(close)[2], "Histogram", gray, style = "histogram")
```

### `ppo(src, fast = 12, slow = 26, signal = 9)`

`[ppo, signal, histogram]`: the same gap expressed as a percentage, so two
instruments at different price levels can be compared.
Parameters: `src` `series number` required; `fast` `number` default `12`; `slow`
`number` default `26`; `signal` `number` default `9`.
Returns `array<number>`. Warmup: as `macd`.

```
plot(ppo(close)[0], "PPO", aqua)
```

### `cci(len = 20)`

How far the typical price sits from its mean, in mean deviation units.
Parameters: `len` `number` default `20`.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(cci(20), "CCI", orange)
```

### `mom(src, len = 10)`

`src - src[len]`: the change over a fixed distance.
Parameters: `src` `series number` required; `len` `number` default `10`.
Returns `series number`. Warmup: bar `len`.

```
plot(mom(close, 10), "Momentum", aqua)
```

### `roc(src, len = 9)`

The same change as a percentage of the older value.
Parameters: `src` `series number` required; `len` `number` default `9`.
Returns `series number`. Warmup: bar `len`.

```
plot(roc(close, 9), "Rate of change", lime)
```

### `williamsR(len = 14)`

Position in the window's range, scaled 0 at the top to -100 at the bottom.
Parameters: `len` `number` default `14`.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(williamsR(14), "Williams range", red)
```

### `tsi(src, longLen = 25, shortLen = 13)`

Double smoothed momentum, so the noise that makes `mom` hard to read is gone.
Parameters: `src` `series number` required; `longLen` `number` default `25`;
`shortLen` `number` default `13`.
Returns `series number`. Warmup: bar `longLen + shortLen - 1`.

```
plot(tsi(close), "TSI", teal)
```

### `trix(src, len = 18)`

Rate of change of a triple exponential mean.
Parameters: `src` `series number` required; `len` `number` default `18`.
Returns `series number`. Warmup: bar `3 * len - 2`.

```
plot(trix(close, 18), "TRIX", fuchsia)
```

### `cmo(src, len = 9)`

Up sum minus down sum over their total, scaled -100 to 100.
Parameters: `src` `series number` required; `len` `number` default `9`.
Returns `series number`. Warmup: bar `len`.

```
plot(cmo(close, 9), "CMO", aqua)
```

### `dpo(src, len = 21)`

Price with its displaced mean removed, to expose a cycle rather than a trend.
Parameters: `src` `series number` required; `len` `number` default `21`.
Returns `series number`. Warmup: bar `len + floor(len / 2)`.

```
plot(dpo(close, 21), "Detrended", silver)
```

### `ultimateOsc(len1 = 7, len2 = 14, len3 = 28)`

Buying pressure blended over three windows so that no single length dominates.
Parameters: `len1` `number` default `7`; `len2` `number` default `14`; `len3`
`number` default `28`.
Returns `series number`. Warmup: bar `max(len1, len2, len3)`.

```
plot(ultimateOsc(), "Ultimate", orange)
```

### `awesomeOsc(fast = 5, slow = 34)`

Difference of two simple means of `hl2`, normally drawn as a histogram.
Parameters: `fast` `number` default `5`; `slow` `number` default `34`.
Returns `series number`. Warmup: bar `max(fast, slow) - 1`.

```
plot(awesomeOsc(), "Awesome", gray, style = "histogram")
```

### `fisher(len = 9)` (planned)

`[fisher, trigger]`: range position reshaped so that extremes stand out.
Parameters: `len` `number` default `9`.
Returns `array<number>`. Warmup: bar `len`.

```
plot(fisher(9)[0], "Fisher", aqua)
```

### `rvi(src, len = 10)` (planned)

`[rvi, signal]`: where the close sits inside the bar, smoothed.
Parameters: `src` `series number` required; `len` `number` default `10`.
Returns `array<number>`. Warmup: bar `len + 3`.

```
plot(rvi(close)[0], "RVI", lime)
```

### `coppock(src, roc1 = 14, roc2 = 11, wmaLen = 10)` (planned)

A long horizon momentum turn.
Parameters: `src` `series number` required; `roc1` `number` default `14`; `roc2`
`number` default `11`; `wmaLen` `number` default `10`.
Returns `series number`. Warmup: bar `max(roc1, roc2) + wmaLen - 1`.

```
plot(coppock(close), "Coppock", purple)
```

---

## 3. Volatility and ranges

### `trueRange()`

The bar's range including any gap from the previous close.
Parameters: none.
Returns `series number`. Warmup: bar 0.

```
plot(trueRange(), "True range", silver, style = "histogram")
```

On bar 0 the result is `high - low`. The other two terms of the definition need
the previous close, which does not exist there. Propagating absence would push
`atr` one bar later than every reference implementation while adding nothing
true, since the bar's own range is a correct statement about that bar. This is
the one deliberate exception to absence propagation in the whole library, and it
is written down here rather than left to an engine to decide.

### `atr(len = 14)`

`rma` of `trueRange`: the working measure of how far this instrument moves.
Parameters: `len` `number` default `14`.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(atr(14), "ATR", orange)
```

### `natr(len = 14)`

`atr` as a percentage of close, so two instruments at different prices compare.
Parameters: `len` `number` default `14`.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(natr(14), "ATR percent", orange)
```

### `stdev(src, len, sample = false)`

Standard deviation over the window, population form by default.
Parameters: `src` `series number` required; `len` `number` required; `sample`
`bool` default `false`.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(stdev(close, 20), "Deviation", silver)
```

### `variance(src, len, sample = false)`

The square of the same measure.
Parameters: `src` `series number` required; `len` `number` required; `sample`
`bool` default `false`.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(variance(close, 20), "Variance", silver)
```

Both divide by `len`, the population form, because that is what the band studies
a chart has to reproduce use. Pass `sample = true` for the `len - 1` divisor.
Naming the choice in an argument means neither convention has to write the
correction by hand, and a reader can see which one a study chose.

### `bollinger(src, len = 20, mult = 2)`

`[basis, upper, lower]`: a simple mean with deviation bands.
Parameters: `src` `series number` required; `len` `number` default `20`; `mult`
`number` default `2`.
Returns `array<number>`. Warmup: all elements at bar `len - 1`.

```
b = bollinger(close, 20, 2)
```

### `bbWidth(src, len = 20, mult = 2)`

Band width over the basis, so a squeeze reads as a low rather than as a shape.
Parameters: `src` `series number` required; `len` `number` default `20`; `mult`
`number` default `2`.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(bbWidth(close), "Band width", aqua)
```

### `bbPercent(src, len = 20, mult = 2)`

Where price sits between the bands: 0 at the lower band and 1 at the upper.
Parameters: `src` `series number` required; `len` `number` default `20`; `mult`
`number` default `2`.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(bbPercent(close), "Percent B", aqua)
```

### `keltner(len = 20, mult = 2, atrLen = 10, maType = "ema")`

`[basis, upper, lower]`: the same picture built from `atr` instead of deviation.
Parameters: `len` `number` default `20`; `mult` `number` default `2`; `atrLen`
`number` default `10`; `maType` `string` default `"ema"`.
Returns `array<number>`. Warmup: all elements at bar `max(len, atrLen) - 1`.

```
k = keltner(20, 2, 10)
```

### `donchian(len = 20)`

`[upper, basis, lower]`: the window's outright high, its midpoint and its low.
Parameters: `len` `number` default `20`.
Returns `array<number>`. Warmup: all elements at bar `len - 1`.

```
plot(donchian(20)[0], "Highest", lime)
```

### `chop(len = 14)`

A 0 to 100 reading of whether the window trended or chopped.
Parameters: `len` `number` default `14`.
Returns `series number`. Warmup: bar `len`.

```
plot(chop(14), "Choppiness", silver)
```

### `hv(src, len = 20, periodsPerYear = 252)`

Annualised standard deviation of log returns.
Parameters: `src` `series number` required; `len` `number` default `20`;
`periodsPerYear` `number` default `252`.
Returns `series number`. Warmup: bar `len`.

```
plot(hv(close, 20), "Historical volatility", purple)
```

### `massIndex(len = 25)` (planned)

Range expansion read as a reversal warning.
Parameters: `len` `number` default `25`.
Returns `series number`. Warmup: bar `len + 17`.

```
plot(massIndex(25), "Mass index", orange)
```

### A squeeze study, end to end

```
version 1
study("Squeeze", overlay = true)

len  = input(20, "Length", min = 2, max = 200)
mult = input(2.0, "Deviation multiple", min = 0.5, max = 5)

b = bollinger(close, len, mult)
k = keltner(len, 1.5, 10)

squeezed = b[1] < k[1] and b[2] > k[2]

upper = plot(b[1], "Upper", aqua)
lower = plot(b[2], "Lower", aqua)
fill(upper, lower, fade(aqua, 92))

background(squeezed ? fade(yellow, 90) : none)
```

The bands are compared rather than the widths because the question is whether
one pair sits inside the other, and `none` on either side during warmup makes
the comparison absent, which takes the false branch and leaves the background
alone. That is the behaviour you want: no paint is honest, a painted bar is a
claim.

---

## 4. Volume

Every function in this section returns `none` on every bar when the host
supplies no volume for the instrument. Test `chart.hasVolume` to branch on that
rather than inspecting the result, because an instrument that reports no volume
and a bar on which nobody traded are different facts and only the first one is a
property of the instrument.

### `vwap(src = hlc3)`

Volume weighted average price since the session opened.
Parameters: `src` `series number` default `hlc3`.
Returns `series number`. Warmup: the session's first bar.

```
plot(vwap(), "VWAP", orange, width = 2)
```

`vwap` resets at the start of each trading session as the host defines it, not
at midnight, because the session is what the number means. On a daily or longer
interval, where each bar is its own session, `vwap` equals `src` and the
compiler says so with warning OS8006.

**Not raised yet.** OS8006 is in the catalogue and nothing raises it: the
checker does not compare a session average's call with the chart's interval.

A bar whose price times volume overflows reads `none` and leaves both running
totals as they were, so the next bar carries on from the last one. If a total
itself overflows, the average reads `none` until the next session starts both
totals again.

### `vwapAnchor(src, resetWhen)`

The same average, restarted on any bar the condition is true.
Parameters: `src` `series number` required; `resetWhen` `series bool` required.
Returns `series number`. Warmup: the first bar `resetWhen` is true.

```
plot(vwapAnchor(hlc3, session.isFirstBar and date.dayOfWeek(time) == 1), "Weekly VWAP", aqua)
```

Overflow behaves as in `vwap`: a bar whose price times volume overflows reads
`none` and changes neither total, and an overflowed total reads `none` until the
next bar `resetWhen` is true.

### `obv()`

Running total of volume signed by the close's direction.
Parameters: none.
Returns `series number`. Warmup: bar 0, seeded 0.

```
plot(obv(), "On balance volume", teal)
```

### `ad()`

Running total of volume weighted by where the close sat inside the bar.
Parameters: none.
Returns `series number`. Warmup: bar 0.

```
plot(ad(), "Accumulation", lime)
```

A bar whose high to low span overflows reads `none` and adds nothing, and the
total carries on from the bar before it. A bar whose span is zero adds an exact
0 and keeps its reading. `adOsc` and `cmf` use the same per-bar term, so `cmf`
reads `none` while such a bar is in its window.

### `adOsc(fast = 3, slow = 10)`

The difference of two means of `ad`, which dates its turns.
Parameters: `fast` `number` default `3`; `slow` `number` default `10`.
Returns `series number`. Warmup: bar `max(fast, slow) - 1`.

```
plot(adOsc(), "AD oscillator", lime, style = "histogram")
```

### `mfi(len = 14)`

`rsi` computed on money flow rather than on price.
Parameters: `len` `number` default `14`.
Returns `series number`. Warmup: bar `len`.

```
plot(mfi(14), "Money flow", purple)
```

### `cmf(len = 20)`

Accumulation over the window as a fraction of the window's volume.
Parameters: `len` `number` default `20`.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(cmf(20), "Chaikin money flow", aqua)
```

### `pvt()`

Running total of volume weighted by percentage change.
Parameters: none.
Returns `series number`. Warmup: bar 1, seeded 0.

```
plot(pvt(), "Price volume trend", olive)
```

A bar whose price change, proportion or product with the volume overflows reads
`none` and leaves the total as it was, so the next bar carries on from it. A
total that itself overflows reads `none` from then on.

### `eom(len = 14)`

How far price moved per unit of volume.
Parameters: `len` `number` default `14`.
Returns `series number`. Warmup: bar `len`.

```
plot(eom(14), "Ease of movement", silver)
```

### `forceIndex(len = 13)`

Change times volume, smoothed.
Parameters: `len` `number` default `13`.
Returns `series number`. Warmup: bar `len`.

```
plot(forceIndex(13), "Force", orange)
```

### `relativeVolume(len = 20)`

This bar's volume over its own recent average, so 2 means twice normal.
Parameters: `len` `number` default `20`.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(relativeVolume(20), "Relative volume", gray, style = "column")
```

### `nvi()` (planned)

Cumulative change on bars where volume fell.
Parameters: none.
Returns `series number`. Warmup: bar 1.

```
plot(nvi(), "Negative volume", silver)
```

### `pvi()` (planned)

Cumulative change on bars where volume rose.
Parameters: none.
Returns `series number`. Warmup: bar 1.

```
plot(pvi(), "Positive volume", silver)
```

### `klinger(fast = 34, slow = 55, signal = 13)` (planned)

`[klinger, signal]`: volume force measured against the bar's own trend.
Parameters: `fast` `number` default `34`; `slow` `number` default `55`; `signal`
`number` default `13`.
Returns `array<number>`. Warmup: bar `slow + signal - 2`.

```
plot(klinger()[0], "Klinger", aqua)
```

### `volumeProfile(rows = 24, from = none)` (planned)

Volume by price level, for a histogram drawn sideways.
Parameters: `rows` `number` default `24`; `from` `number` default `none`.
Returns `array<number>`. Warmup: the anchor bar.

```
levels = volumeProfile(24)
```

### `cvd()` (planned)

Cumulative signed volume, once the host supplies intrabar data.
Parameters: none.
Returns `series number`. Warmup: bar 0.

```
plot(cvd(), "Cumulative delta", teal)
```

### A volume confirmed breakout

```
version 1
study("Confirmed breakout", overlay = true)

len   = input(20, "Lookback", min = 2, max = 500)
ratio = input(1.8, "Volume multiple", min = 1, max = 10)

hi = highest(high, len)[1]
rv = relativeVolume(len)

broke = close > hi and rv > ratio

plot(hi, "Breakout level", orange, style = "step")

if broke
    signal("BREAK", color = lime, at = "below", shape = "triangleUp")

if not chart.hasVolume
    background(fade(red, 92))
```

The volume test is written against `chart.hasVolume` rather than against the
value, because on an instrument with no volume `rv` is absent, `rv > ratio` is
absent, the marker never fires, and the study would look merely quiet rather
than inapplicable. Painting the pane says which of the two it is.

## See also

- [series.md](./series.md) for `highest`, `lowest`, `crossUp`, `change` and the rest of the per-bar helpers these studies are built from
- [math.md](./math.md) for rounding, `max`, `abs` and the numeric edge cases
- [drawing.md](./drawing.md) for `plot`, `fill`, `signal` and how a value reaches the chart
- [request.md](./request.md) for running any of these on a higher timeframe
- [strategy.md](./strategy.md) for turning a reading into an order
- [input.md](./input.md) for making the lengths on this page configurable
- [../../../spec/stdlib.md](../../../spec/stdlib.md) for the specification these entries are derived from
