# Series and per-bar functions

By the end of this page you will be able to read any bar's own data, ask what
the chart and the instrument are, and use every helper that works across bars:
window extremes, changes, crossings, counters, pivots and window statistics.

## What a series is, in one paragraph

A series is the per-bar history of a value. Reading a name bare gives this bar's
value; `name[n]` gives the value `n` bars back. `close[0]` and `close` are the
same thing. `close[1]` on bar 0 is `none`, not `close[0]`: nothing is clamped to
the start of history, because a clamped value looks like data. A clamped
`close[1]` would make `close - close[1]` exactly zero on bar 0, which reads as a
real change of nothing, while absence propagates through the subtraction and the
plot draws a gap, which is the truth.

Four kinds of value accept `[]`: a built-in series, a name assigned at the top
level of the file, a call to a function that returns a series, and a parameter
of a user function whose type is a series. A temporary inside an `if` block does
not, because retaining history costs memory per bar and a language that retained
it for every temporary inside every loop body would not run fifty thousand bars
in a browser tab.

---

## 1. Built-in series

One value per bar, available bare in every script, all with history through
`[]`.

| Call | Returns | Warmup | For |
|---|---|---|---|
| `open` | `series number` | bar 0 | The bar's opening price |
| `high` | `series number` | bar 0 | The bar's highest traded price |
| `low` | `series number` | bar 0 | The bar's lowest traded price |
| `close` | `series number` | bar 0 | The bar's closing price, and the last price on a bar still forming |
| `volume` | `series number` | bar 0 | Quantity traded in the bar, absent where the host supplies none |
| `hl2` | `series number` | bar 0 | `(high + low) / 2`, the bar's midpoint |
| `hlc3` | `series number` | bar 0 | `(high + low + close) / 3`, the typical price |
| `ohlc4` | `series number` | bar 0 | `(open + high + low + close) / 4`, the average price |
| `hlcc4` | `series number` | bar 0 | `(high + low + close + close) / 4`, close weighted average |
| `time` | `series number` | bar 0 | The bar's opening instant, UTC milliseconds |
| `timeClose` (planned) | `series number` | bar 0 | The instant the bar's interval ends |

```
plot(hlc3, "Typical price", aqua)
plot(close - open, "Body", gray, style = "histogram")
```

`volume` is absent, not zero, on an instrument the host has no volume for. Zero
is a real reading that means nobody traded, and an instrument that never reports
volume at all is a different fact; conflating them would make a volume study
silently draw a flat line that looks like data. Test `chart.hasVolume` before
branching on it.

`close` is the one name with two roles. Read bare it is the bar's closing price.
Written as a call, `close(...)` is the order function that flattens a position,
documented in [strategy.md](./strategy.md). The checker tells them apart by
syntax, which is unambiguous, and both spellings are the ones a trader expects.
The consequence, stated so it is not discovered: `close` cannot be passed
anywhere a function is expected, which costs nothing because there are no
function values in version 1.

---

## 2. The `bar` namespace

Per-bar facts about the run rather than about the price.

| Call | Returns | Warmup | For |
|---|---|---|---|
| `bar.index` | `series number` | bar 0 | Position of this bar in the dataset, oldest is 0 |
| `bar.count` | `series number` | bar 0 | `bar.index + 1`, bars seen so far |
| `bar.isFirst` | `series bool` | bar 0 | This is the oldest bar supplied |
| `bar.isLast` | `series bool` | bar 0 | This is the newest bar supplied |
| `bar.isConfirmed` | `series bool` | bar 0 | This bar's interval has elapsed and it will not change again |
| `bar.isRealtime` | `series bool` | bar 0 | A live feed is driving updates, rather than a one-off history load |
| `bar.isNew` | `series bool` | bar 0 | The last update appended a bar rather than replacing one |
| `bar.updates` | `series number` | bar 0 | How many times this bar has been executed |

```
if bar.isLast
    cell(panel, 0, 0, "Bars: " + text(bar.count, 0))
```

`bar.index` is a position in the data the engine was given, not a universal
address. Loading more history shifts every index, so a script that stores an
index and compares it after more bars arrive is comparing against something that
moved underneath it. Store `time` instead, which does not move.

`bar.isConfirmed` is the flag a script uses to refuse to act on a bar that is
still moving. It is true for every historical bar and for the newest bar once
its interval has elapsed.

---

## 3. The `chart` namespace

Instrument and chart facts. Every one of these is constant for the whole run
except `chart.now()`, so they are plain values rather than series and carry no
history.

| Call | Returns | For |
|---|---|---|
| `chart.symbol` | `string` | The instrument's symbol, or `""` when the host names none |
| `chart.exchange` | `string` | The exchange the instrument trades on |
| `chart.interval` | `string` | The chart's interval in canonical form |
| `chart.intervalMinutes` | `number` | The interval in minutes, `none` for a non-time interval |
| `chart.isIntraday` | `bool` | The interval is shorter than one day |
| `chart.timezone` | `string` | The chart's IANA zone, the calendar its axis is labelled in |
| `chart.tickSize` | `number` | The smallest price increment, `none` when the host has not said |
| `chart.lotSize` | `number` | Units in one lot, `none` when the host has not said |
| `chart.pointValue` | `number` | Money per one point of price per unit, `none` when unknown |
| `chart.currency` | `string` | Currency label for money in a report |
| `chart.instrumentType` | `string` | `"equity"`, `"future"`, `"option"`, `"index"`, `"currency"`, `"commodity"` or `"other"` |
| `chart.hasVolume` | `bool` | The host supplies volume for this instrument |
| `chart.now()` | `number` | The chart's wall clock, UTC milliseconds |
| `chart.isReplay` (planned) | `bool` | The bars are being replayed rather than loaded whole |
| `chart.expiry` (planned) | `number` | Expiry instant of a derivative instrument |
| `chart.strike` (planned) | `number` | Strike price of an option instrument |
| `chart.optionType` (planned) | `string` | `"call"`, `"put"` or `""` |

```
if chart.isIntraday and chart.instrumentType == "option"
    background(fade(navy, 95))
```

`chart.tickSize` is `none` rather than a guessed `0.01` when the host has not
supplied it, because a script sizing a stop in ticks has to be able to tell the
smallest increment from nobody having said what it is. `chart.now()` is the only
reading of a clock available during a bar, and the conformance suite fixes its
value, so a script that uses it is still reproducible.

---

## 4. Window extremes

`src` is any `series number` and `len` is a whole number of 1 or more.

### `highest(src, len)`

Largest value in the last `len` bars, this bar included.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(highest(high, 20), "20 bar high", lime)
```

### `lowest(src, len)`

Smallest value in the last `len` bars.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(lowest(low, 20), "20 bar low", red)
```

### `highestBars(src, len)`

How many bars back the window's high was set, `0` when it was set on this bar.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series number`. Warmup: bar `len - 1`.

```
freshHigh = highestBars(high, 50) == 0
```

### `lowestBars(src, len)`

How many bars back the window's low was set.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(lowestBars(low, 50), "Bars since low", silver)
```

A breakout study almost always wants `highest(high, len)[1]`, the window
excluding this bar, because comparing this bar's close against a window that
already contains this bar's high makes the test nearly impossible to pass.

---

## 5. Change, direction and crossings

### `change(src)`

`src - src[1]`.
Parameters: `src` `series number` required.
Returns `series number`. Warmup: bar 1.

```
plot(change(close), "Change", gray, style = "histogram")
```

### `change(src, len)`

`src - src[len]`.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series number`. Warmup: bar `len`.

```
weekly = change(close, 5)
```

### `rising(src, len)`

True when each of the last `len` changes was positive.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series bool`. Warmup: bar `len`.

```
if rising(ema(close, 20), 3)
    barColor(lime)
```

### `falling(src, len)`

True when each of the last `len` changes was negative.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series bool`. Warmup: bar `len`.

```
if falling(ema(close, 20), 3)
    barColor(red)
```

### `crossUp(a, b)`

`a` was at or below `b` and is now above.
Parameters: `a` `series number` required; `b` `series number` required.
Returns `series bool`. Warmup: bar 1.

```
if crossUp(ema(close, 9), ema(close, 21))
    signal("BUY")
```

### `crossDown(a, b)`

`a` was at or above `b` and is now below.
Parameters: `a` `series number` required; `b` `series number` required.
Returns `series bool`. Warmup: bar 1.

```
if crossDown(rsi(close, 14), 70)
    signal("EXIT")
```

### `cross(a, b)`

Either direction.
Parameters: `a` `series number` required; `b` `series number` required.
Returns `series bool`. Warmup: bar 1.

```
if cross(close, vwap())
    alert("Price crossed VWAP", id = "vwap-cross")
```

The crossing tests use "at or below, then above" rather than "strictly below,
then above", so that two series which touch and then separate report one
crossing rather than none. The strict form loses the case where the values are
briefly equal, which is common on an instrument with a coarse tick and is
exactly the case a trader would call a crossover.

---

## 6. Counters and remembered values

### `barsSince(cond)`

Bars since the condition last held, `0` on the bar itself.
Parameters: `cond` `series bool` required.
Returns `series number`. Warmup: the first bar `cond` is true.

```
plot(barsSince(close > highest(high, 20)[1]), "Bars since breakout", silver)
```

### `valueWhen(cond, src, occurrence = 0)`

`src` as it stood the last time the condition held, or the time before that.
Parameters: `cond` `series bool` required; `src` any series; `occurrence`
`number` default `0`, where `0` is the most recent true bar and `1` the one
before it.
Returns the same type as `src`. Warmup: the `occurrence + 1` th true bar.

```
lastBreakout = valueWhen(crossUp(close, upper), close)
```

Both are absent, not zero, before the condition has ever been true. Zero would
read as "it happened on this bar", which is the single most expensive wrong
answer either function could give.

### `cum(src)`

Running total from the first bar.
Parameters: `src` `series number` required.
Returns `series number`. Warmup: bar 0.

```
plot(cum(volume), "Cumulative volume", teal)
```

### `sum(src, len)`

Total over the last `len` bars.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(sum(volume, 20), "20 bar volume", teal)
```

`sum` has a second signature, `sum(arr)`, which totals a whole array and is
documented in [collections.md](./collections.md).

### `count(cond, len)`

How many of the last `len` bars the condition held on.
Parameters: `cond` `series bool` required; `len` `number` required.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(count(close > open, 20), "Up bars in 20", lime, style = "column")
```

---

## 7. The three functions that ignore absence

Every other windowed function in the library propagates absence: one absent bar
in the window makes the whole result absent. These three do not, and they are
named for it so that a reader can see the exception on the line rather than
having to remember a list.

### `sumSkip(src, len)`

Total over the window, ignoring absent bars.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(sumSkip(gapSize, 20), "Gap total", orange)
```

### `avgSkip(src, len)`

Mean over the window, ignoring absent bars.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(avgSkip(spread, 50), "Average spread", silver)
```

### `countPresent(src, len)`

How many bars of the window had a value.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series number`. Warmup: bar `len - 1`.

```
coverage = countPresent(otherClose, 100) / 100 * 100
```

A pair worth knowing: `avgSkip(src, len)` with `countPresent(src, len)` beside
it tells you both the average and how much of the window it was computed from,
which is the difference between a number you can trust and a number computed
from three bars out of fifty.

---

## 8. History, pivots and window statistics

### `history(src, n)`

`src` as it stood `n` bars ago: the explicit form of `src[n]`.
Parameters: `src` any series; `n` `number` required.
Returns the same type as `src`. Warmup: bar `n`.

```
previousArray = history(readings, 1)
```

Use it where a line is doing two things at once. On a name holding an array,
`readings[0]` is the first element and `history(readings, 1)` is the whole array
as it stood one bar ago, and writing both explicitly saves the reader from
having to work out which reading applies.

### `pivotHigh(src, left, right)`

The value of a local high: a bar whose value is higher than `left` bars before
it and `right` bars after it.
Parameters: `src` `series number` required; `left` `number` required; `right`
`number` required.
Returns `series number`. Warmup: bar `left + right`.

```
ph = pivotHigh(high, 5, 5)
```

### `pivotLow(src, left, right)`

The value of a local low, on the same terms.
Parameters: `src` `series number` required; `left` `number` required; `right`
`number` required.
Returns `series number`. Warmup: bar `left + right`.

```
pl = pivotLow(low, 5, 5)
```

Both report on the bar `right` bars after the pivot, which is the first bar on
which the pivot is knowable. A study that wants the marker drawn back at the
pivot passes `offset = -right` to `plot`, or anchors a drawing at `time[right]`.
Returning the value at the pivot bar itself would be a lookahead: the number
would appear on history at a bar where no script could have had it, and the
study would look far better in the past than it can ever be in the present.

### `median(src, len)`

Middle value of the window.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(median(close, 21), "Median", orange)
```

### `percentile(src, len, p)`

The value at percentile `p` of the window, linearly interpolated.
Parameters: `src` `series number` required; `len` `number` required; `p`
`number` required, 0 to 100.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(percentile(atr(14), 100, 80), "Busy day threshold", red)
```

### `percentRank(src, len)`

What percentage of the window this bar's value exceeds.
Parameters: `src` `series number` required; `len` `number` required.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(percentRank(volume, 100), "Volume rank", teal)
```

### `correlation(a, b, len)`

Linear correlation of two series over the window, -1 to 1.
Parameters: `a` `series number` required; `b` `series number` required; `len`
`number` required.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(correlation(close, benchmark, 60), "Correlation", aqua)
```

### `covariance(a, b, len)`

Covariance over the window, population form.
Parameters: `a` `series number` required; `b` `series number` required; `len`
`number` required.
Returns `series number`. Warmup: bar `len - 1`.

```
plot(covariance(close, benchmark, 60), "Covariance", aqua)
```

---

## 9. Three worked examples

### An opening range, kept in persistent values

```
version 1
study("Opening range", overlay = true)

minutes = input(15, "Range length, in minutes", min = 1, max = 240)

var rangeHigh = none
var rangeLow  = none

if session.isFirstBar
    rangeHigh = high
    rangeLow  = low

// session.barIndex counts bars inside the session, so this works on any
// intraday interval without the script knowing which one it is running on.
inRange = session.barIndex * orElse(chart.intervalMinutes, 1) < minutes

if inRange and not session.isFirstBar
    rangeHigh = max(rangeHigh, high)
    rangeLow  = min(rangeLow, low)

plot(rangeHigh, "Range high", lime, style = "step")
plot(rangeLow, "Range low", red, style = "step")

if not inRange and crossUp(close, rangeHigh)
    signal("BREAK UP", at = "below", shape = "triangleUp")
```

### How long has this condition been true

```
version 1
study("Streaks", precision = 0)

up = close > close[1]

// count answers "how many of the last 20", barsSince answers "when last".
plot(count(up, 20), "Up bars in 20", lime, style = "column")
plot(barsSince(not up), "Consecutive up bars", aqua)
```

`barsSince(not up)` is absent until the first down bar exists, so the second
plot starts a bar or two into the chart. That is correct: before any down bar
has happened, the length of the current run is not known, only bounded.

### A pivot marker drawn back where the pivot is

```
version 1
study("Pivots", overlay = true)

left  = input(5, "Left bars", min = 1, max = 50)
right = input(5, "Right bars", min = 1, max = 50)

ph = pivotHigh(high, left, right)
pl = pivotLow(low, left, right)

// offset shifts only where the column is drawn, never what it holds, so the
// dot lands on the pivot bar while the value is still computed on the bar
// where it first became knowable.
plot(ph, "Pivot high", red, style = "lineWithMarkers", offset = -right)
plot(pl, "Pivot low", lime, style = "lineWithMarkers", offset = -right)
```

## See also

- [ta.md](./ta.md) for the indicators built on these helpers
- [math.md](./math.md) for `abs`, `round`, `isNone` and the numeric edge cases
- [time.md](./time.md) for reading `time` as a calendar and for the session helpers
- [drawing.md](./drawing.md) for `plot`, `offset`, `signal` and `barColor`
- [collections.md](./collections.md) for the array forms of `sum`, `min` and `max`
- [request.md](./request.md) for the same helpers computed on another timeframe
- [../../../spec/stdlib.md](../../../spec/stdlib.md) for the specification these entries are derived from
