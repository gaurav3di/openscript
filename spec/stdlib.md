# OpenScript standard library specification

Version of this document: draft, tracking language version 1.

`language.md` fixes the syntax, the types, the per-bar execution model and the
shape of the library. This document is the catalogue: every name a script can
call, what it returns, the first bar it can honestly produce a value for, and
what it is for.

The two documents are one specification. Where this one and `language.md`
disagree about a rule of the language, `language.md` wins. Where they disagree
about a function, this one wins. Error codes quoted here are defined in
`errors.md`, which is authoritative for their text.

## Contents

1. [How to read an entry](#1-how-to-read-an-entry)
2. [Rules that apply to the whole library](#2-rules-that-apply-to-the-whole-library)
3. [Bar data and instrument facts](#3-bar-data-and-instrument-facts)
4. [Moving averages and trend](#4-moving-averages-and-trend)
5. [Momentum and oscillators](#5-momentum-and-oscillators)
6. [Volatility and ranges](#6-volatility-and-ranges)
7. [Volume](#7-volume)
8. [Maths and rounding](#8-maths-and-rounding)
9. [Series helpers](#9-series-helpers)
10. [Strings and formatting](#10-strings-and-formatting)
11. [Colour](#11-colour)
12. [Time, session and calendar](#12-time-session-and-calendar)
13. [Inputs](#13-inputs)
14. [Drawing and output](#14-drawing-and-output)
15. [Higher timeframe and other instrument reads](#15-higher-timeframe-and-other-instrument-reads)
16. [Alerts](#16-alerts)
17. [Orders and position](#17-orders-and-position)
18. [The chart contract map](#18-the-chart-contract-map)
19. [What is deliberately not here](#19-what-is-deliberately-not-here)

---

## 1. How to read an entry

Every entry is a row in a table with four columns.

| Column | Holds |
|---|---|
| Call | The name and its parameters, with defaults where they exist |
| Returns | The type of the result |
| Warmup | The first bar the call can produce a value for, counting the oldest bar as 0 |
| For | One line on what it is for |

**Warmup is a promise, not a hint.** A warmup of "bar `n - 1`" means the call
returns `none` on bars `0` to `n - 2` and a value from bar `n - 1` onward, and
that a conforming engine returns `none` on exactly those bars and no others.
"Bar 0" means the call produces a value on the very first bar. Two engines that
disagree about a single warmup bar fail the conformance suite, which is the point
of writing the lengths down rather than saying "after a while".

Warmup is stated in bars of the call's own source. A call whose source is itself
absent on a bar is absent on that bar too, by the propagation rule of
`language.md` section 6.7, so warmups compose: `sma(ema(close, 10), 10)` is
absent until bar 18.

**A call marked `(planned)` is not in the first release.** It is listed so the
surface is legible: a script author can see that the gap is known and named
rather than guess whether it was forgotten. Calling one is OS2001 with a message
saying it is planned, not a message saying the name does not exist.

---

## 2. Rules that apply to the whole library

### 2.1 Bare names and namespaces

Everyday functions are bare, as `language.md` section 15.2 requires:
`ema(close, 9)`, `highest(high, 20)`, `plot(x, "X", aqua)`. The namespaces
`bar`, `chart`, `session`, `date`, `str`, `math`, `pos`, `order`, `draw` and
`req` hold the long tail. A function is bare when a script that does nothing
unusual reaches for it on most days, and namespaced otherwise. There is no third
rule, and the split is settled per function here rather than left to taste.

Every name in this document, bare or namespaced, lives in the global scope, so
assigning to one is OS2002 (`language.md` section 12.4).

### 2.2 Overloads

**A bare name may carry more than one signature, and the signatures must differ
in arity or in argument type.** The checker resolves the call at compile time;
there is no run-time dispatch.

```
sum(prices)             // array<number> -> number, the whole array
sum(close, 20)          // series, length -> series number, a 20 bar window
```

A call that matches no signature is OS3001 when the arity is wrong and OS2003
when an argument's type is wrong, and the message lists every signature the name
has. Overloading is allowed because `min(a, b)` and `min(arr)` are the same idea
and two names for one idea is worse than one name with two shapes; it is limited
to arity and type so the resolution is mechanical and a reader can do it by eye.

### 2.3 Functions with more than one output

**A function with more than one output returns an `array<number>` holding this
bar's outputs, in the order the entry documents.**

```
m = macd(close, 12, 26, 9)
plot(m[0], "MACD", aqua)
plot(m[1], "Signal", orange)
plot(m[2], "Histogram", gray, style = "histogram")
```

**The returned array itself is never absent and never changes length.** Each
element carries its own warmup and is `none` until it is reached. An array whose
length grew as warmup completed would make `m[1]` an out-of-range error on early
bars, which is a worse failure than an absent value, and a script that indexed it
would break at the left edge of the chart only.

The alternative, one named function per output (`macdLine`, `macdSignal`,
`macdHist`), was rejected because three calls are three call sites and therefore
three independent state slots by `language.md` section 11.4, so the shared
smoothing would be computed three times per bar.

A multi-output call assigned to a top-level name has history in the array sense
described in `language.md` section 9.6: `m[0]` is element 0 of this bar's array,
and `history(m, 1)` is the whole array as it stood one bar ago.

### 2.4 Absence

Every windowed function propagates absence: if any bar in the window is absent,
that bar's result is absent. The three functions that deliberately ignore absent
values are `sumSkip`, `avgSkip` and `countPresent`, and they say so in their
names, per `language.md` section 6.7.

A function whose result has no finite real value returns `none` rather than
raising: `log(0)`, `sqrt(-1)`, a division by zero inside a ratio study. A
function whose *arguments* are wrong raises instead: a negative length is OS3004
at compile time when it is a literal and OS4003 at run time when it is not.

### 2.5 Length arguments

A length argument must be a whole number of 1 or more. A fractional length is
OS3004 with the fix naming `round`, never a silent truncation, because a length
of 14.5 is a bug in the script and rounding it hides the bug. A length of 0 or
below is OS3004. A length may be a series, in which case it is read per bar and
the warmup is measured against the largest value the length has taken since the
start of the dataset, which is the only definition that does not require the
engine to see the future.

### 2.6 Rounding and reproducibility

Every function in this document is specified as an exact arithmetic recipe over
binary64 in source order, under the determinism rule of `language.md` section
7.6. Where a smoothing function needs a seed, the seed is stated in the entry.
Where a statistic can be defined two ways, the entry says which one and the other
is available through a named argument. Nothing here is "the usual definition".

### 2.7 Where a call lands in the chart contract

A compiled study is handed to the host chart as a descriptor: a data structure
with fields for the plotted columns, the shaded bands, the levels, the markers,
the table, the free drawings, the pane background, the price bar colours, the
alerts, the fixed pane range and the settings inputs. Sections 13 to 17 name the
field each call lands in, in a **Lands in** column, and section 18 collects the
whole map in one table.

The calculation groups, sections 4 to 11, have no such column. They are pure
computation and reach the contract only through whatever `plot` does with them,
that is as one column of the descriptor's computed values.

---

## 3. Bar data and instrument facts

### 3.1 Built-in series

Available as bare names in every script, one value per bar, with history through
`[]`.

| Call | Returns | Warmup | For |
|---|---|---|---|
| `open` | `series number` | bar 0 | The bar's opening price |
| `high` | `series number` | bar 0 | The bar's highest traded price |
| `low` | `series number` | bar 0 | The bar's lowest traded price |
| `close` | `series number` | bar 0 | The bar's closing price, the last price on a bar still forming |
| `volume` | `series number` | bar 0 | Quantity traded in the bar, absent where the host supplies none |
| `hl2` | `series number` | bar 0 | `(high + low) / 2`, the bar's midpoint |
| `hlc3` | `series number` | bar 0 | `(high + low + close) / 3`, the typical price |
| `ohlc4` | `series number` | bar 0 | `(open + high + low + close) / 4`, the average price |
| `hlcc4` | `series number` | bar 0 | `(high + low + close + close) / 4`, close-weighted average |
| `time` | `series number` | bar 0 | The bar's opening instant, UTC milliseconds |
| `timeClose` (planned) | `series number` | bar 0 | The instant the bar's interval ends |

`volume` is absent, not zero, on an instrument the host has no volume for. Zero
is a real reading that means nobody traded, and an index that never reports
volume at all is a different fact; conflating them would make a volume study
silently draw a flat line. Test with `chart.hasVolume` before branching on it.

### 3.2 `close` is the one name with two roles

`close` read bare is the bar's closing price. `close(...)` written as a call is
the order function of section 17 that flattens the position. The checker tells
them apart by syntax, which is unambiguous at compile time, and both spellings
are the ones a trader expects. The consequence, stated so it is not discovered:
`close` cannot be passed anywhere a function is expected, which costs nothing in
version 1 because there are no function values. In a `study()` file `close(...)`
is OS7001.

### 3.3 The `bar` namespace

Per-bar facts. Defined in `language.md` section 7.2 and repeated here so the
catalogue is complete.

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

These land in the contract's calculation context rather than in any drawn field:
the host supplies four facts about the execution (new, confirmed, realtime and
the update count) and the engine derives the other four from the dataset and the
bar's position in it (`compiled-program.md` section 5.2).

### 3.4 The `chart` namespace

Instrument and chart facts. Every one of these is constant for the whole run
except `chart.now()`, so they are typed as plain values rather than series and
carry no history.

| Call | Returns | Warmup | For |
|---|---|---|---|
| `chart.symbol` | `string` | n/a | The instrument's symbol, or `""` when the host names none |
| `chart.exchange` | `string` | n/a | The exchange the instrument trades on |
| `chart.interval` | `string` | n/a | The chart's interval in canonical form, section 15.2 |
| `chart.intervalMinutes` | `number` | n/a | The interval in minutes, `none` for a non-time interval |
| `chart.isIntraday` | `bool` | n/a | The interval is shorter than one day |
| `chart.timezone` | `string` | n/a | The chart's IANA zone, the calendar its axis is labelled in |
| `chart.tickSize` | `number` | n/a | The instrument's smallest price increment, `none` when the host has not said |
| `chart.lotSize` | `number` | n/a | Units in one lot, `none` when the host has not said |
| `chart.pointValue` | `number` | n/a | Money per one point of price per unit, `none` when unknown |
| `chart.currency` | `string` | n/a | Currency label for money in a report |
| `chart.instrumentType` | `string` | n/a | `"equity"`, `"future"`, `"option"`, `"index"`, `"currency"`, `"commodity"` or `"other"` |
| `chart.hasVolume` | `bool` | n/a | The host supplies volume for this instrument |
| `chart.now()` | `number` | n/a | The chart's wall clock, UTC milliseconds |
| `chart.isReplay` (planned) | `bool` | n/a | The bars are being replayed rather than loaded whole |
| `chart.expiry` (planned) | `number` | n/a | Expiry instant of a derivative instrument |
| `chart.strike` (planned) | `number` | n/a | Strike price of an option instrument |
| `chart.optionType` (planned) | `string` | n/a | `"call"`, `"put"` or `""` |

`chart.tickSize` is `none` rather than a guessed `0.01` when the host has not
supplied it, because a script sizing a stop in ticks has to be able to tell "one
paisa" from "nobody said". The host's instrument record supplies ten facts,
symbol, exchange, interval, timezone, tick size, lot size, point value, currency,
instrument type and whether the instrument has volume, and the engine derives
`chart.intervalMinutes` and `chart.isIntraday` from the interval string rather
than reading them from the host (`compiled-program.md` section 5.2).
`chart.now()` is the only reading of a clock available during a bar, and the
conformance suite fixes its value, so a script that uses it is still
reproducible.

**Count: 36 entries, of which 5 are planned.**

---

## 4. Moving averages and trend

Unless an entry says otherwise, `src` is any `series number` and `len` is a
length under the rules of section 2.5.

| Call | Returns | Warmup | For |
|---|---|---|---|
| `sma(src, len)` | `series number` | bar `len - 1` | Arithmetic mean of the last `len` values |
| `ema(src, len)` | `series number` | bar `len - 1` | Exponential mean, weight `2 / (len + 1)`, seeded on bar `len - 1` with the simple average of those `len` values |
| `wma(src, len)` | `series number` | bar `len - 1` | Linearly weighted mean, newest value weighted `len` |
| `rma(src, len)` | `series number` | bar `len - 1` | Smoothed mean with weight `1 / len`, seeded like `ema`; the smoothing the classic oscillators use |
| `hma(src, len)` | `series number` | bar `len + round(sqrt(len)) - 2` | Weighted mean tuned to lag less than `wma` at the same length |
| `dema(src, len)` | `series number` | bar `2 * len - 2` | Double exponential mean, an `ema` with its own lag subtracted once |
| `tema(src, len)` | `series number` | bar `3 * len - 3` | Triple exponential mean, the same correction applied twice |
| `vwma(src, len)` | `series number` | bar `len - 1` | Mean weighted by each bar's volume |
| `swma(src)` | `series number` | bar 3 | Fixed four bar symmetric mean, weights 1, 2, 2, 1 divided by 6 |
| `alma(src, len, offset = 0.85, sigma = 6)` | `series number` | bar `len - 1` | Gaussian weighted mean whose peak `offset` slides between lag and smoothness |
| `linreg(src, len, offset = 0)` | `series number` | bar `len - 1` | Value of the least squares line through the last `len` points, `offset` bars back along it |
| `ma(src, len, type = "sma")` | `series number` | the named type's | One call whose shape a `select` input can switch: `"sma"`, `"ema"`, `"wma"`, `"rma"`, `"hma"`, `"vwma"` |
| `supertrend(factor = 3, atrLen = 10)` | `array<number>` | element 0 at bar `atrLen`, element 1 at bar `atrLen` | `[line, direction]`; a trailing band from average true range, `direction` is `-1` long or `1` short |
| `psar(start = 0.02, step = 0.02, max = 0.2)` | `array<number>` | element 0 at bar 1, element 1 at bar 1 | `[sar, direction]`; a stop that accelerates toward price, seeded from bar 0's range |
| `adx(diLen = 14, adxLen = 14)` | `array<number>` | element 1 and 2 at bar `diLen`, element 0 at bar `diLen + adxLen - 1` | `[adx, plusDI, minusDI]`; trend strength and which side owns it |
| `aroon(len = 14)` | `array<number>` | both elements at bar `len` | `[up, down]`; how recently the window's high and low were set, as a percentage |
| `ichimoku(convLen = 9, baseLen = 26, spanLen = 52)` | `array<number>` | element by element at bar `convLen - 1`, `baseLen - 1`, `baseLen - 1`, `spanLen - 1`, `baseLen - 1` | `[conversion, base, spanA, spanB, lagging]`; a five line trend frame, displaced with `plot(..., offset = ...)` |
| `kama(src, len, fast = 2, slow = 30)` (planned) | `series number` | bar `len` | Mean whose smoothing follows how directional the move is |
| `zlema(src, len)` (planned) | `series number` | bar `len - 1` | Exponential mean with its lag removed by displacement |
| `vidya(src, len)` (planned) | `series number` | bar `2 * len - 1` | Mean whose smoothing follows relative volatility |
| `zigzag(src, deviation)` (planned) | `array<number>` | first confirmed swing | Swing points confirmed by a percentage reversal |

`supertrend` and `psar` return a direction alongside the line because a script
almost always wants both and recomputing the line to derive the flip would double
the work. Direction is `-1` for long and `1` for short, matching the sign of the
side the band is protecting against, and it is a number rather than a bool so
that `direction != direction[1]` reads as the flip test.

`ichimoku` returns the spans undisplaced, at the bar they are computed on. A
study draws them forward with the plot's `offset` argument rather than having the
function shift them, because a shifted series cannot be compared with anything
else in the script without shifting it back.

**Count: 21 entries, of which 4 are planned.**

---

## 5. Momentum and oscillators

| Call | Returns | Warmup | For |
|---|---|---|---|
| `rsi(src, len = 14)` | `series number` | bar `len` | 0 to 100 reading of how one-sided the last `len` changes were |
| `stoch(len = 14, smoothK = 1, smoothD = 3)` | `array<number>` | element 0 at bar `len + smoothK - 2`, element 1 at bar `len + smoothK + smoothD - 3` | `[k, d]`; where the close sits inside the window's range |
| `stochRsi(src, rsiLen = 14, stochLen = 14, smoothK = 3, smoothD = 3)` | `array<number>` | element 0 at bar `rsiLen + stochLen + smoothK - 2` | `[k, d]`; the same position test applied to `rsi` instead of price |
| `macd(src, fast = 12, slow = 26, signal = 9)` | `array<number>` | element 0 at bar `slow - 1`, elements 1 and 2 at bar `slow + signal - 2` | `[macd, signal, histogram]`; the gap between a fast and a slow mean |
| `ppo(src, fast = 12, slow = 26, signal = 9)` | `array<number>` | as `macd` | `[ppo, signal, histogram]`; the same gap as a percentage, so two instruments compare |
| `cci(len = 20)` | `series number` | bar `len - 1` | How far the typical price sits from its mean in mean-deviation units |
| `mom(src, len = 10)` | `series number` | bar `len` | `src - src[len]`, change over a fixed distance |
| `roc(src, len = 9)` | `series number` | bar `len` | The same change as a percentage of the older value |
| `williamsR(len = 14)` | `series number` | bar `len - 1` | Position in the window's range, scaled 0 to -100 |
| `tsi(src, longLen = 25, shortLen = 13)` | `series number` | bar `longLen + shortLen - 1` | Double smoothed momentum, so the noise of `mom` is gone |
| `trix(src, len = 18)` | `series number` | bar `3 * len - 2` | Rate of change of a triple exponential mean |
| `cmo(src, len = 9)` | `series number` | bar `len` | Up sum minus down sum over their total, -100 to 100 |
| `dpo(src, len = 21)` | `series number` | bar `len + floor(len / 2)` | Price with its displaced mean removed, to expose a cycle |
| `ultimateOsc(len1 = 7, len2 = 14, len3 = 28)` | `series number` | bar `max(len1, len2, len3)` | Buying pressure blended over three windows so one length cannot dominate |
| `awesomeOsc(fast = 5, slow = 34)` | `series number` | bar `slow - 1` | Difference of two simple means of `hl2`, drawn as a histogram |
| `fisher(len = 9)` (planned) | `array<number>` | bar `len` | `[fisher, trigger]`; range position reshaped so extremes stand out |
| `rvi(src, len = 10)` (planned) | `array<number>` | bar `len + 3` | `[rvi, signal]`; where the close sits inside the bar, smoothed |
| `coppock(src, roc1 = 14, roc2 = 11, wmaLen = 10)` (planned) | `series number` | bar `max(roc1, roc2) + wmaLen - 1` | Long horizon momentum turn |

`rsi` needs `len` changes and a change needs two bars, so its first value is at
bar `len` and not at bar `len - 1`. Every entry in this section that consumes
changes rather than levels carries the same extra bar, and the warmup column
states it rather than leaving the reader to work it out.

**Count: 18 entries, of which 3 are planned.**

---

## 6. Volatility and ranges

| Call | Returns | Warmup | For |
|---|---|---|---|
| `trueRange()` | `series number` | bar 0 | The bar's range including any gap from the previous close |
| `atr(len = 14)` | `series number` | bar `len - 1` | `rma` of `trueRange`, the working measure of how far this instrument moves |
| `natr(len = 14)` | `series number` | bar `len - 1` | `atr` as a percentage of close, so two instruments compare |
| `stdev(src, len, sample = false)` | `series number` | bar `len - 1` | Standard deviation over the window, population by default |
| `variance(src, len, sample = false)` | `series number` | bar `len - 1` | The square of the same |
| `bollinger(src, len = 20, mult = 2)` | `array<number>` | all elements at bar `len - 1` | `[basis, upper, lower]`; a mean with deviation bands |
| `bbWidth(src, len = 20, mult = 2)` | `series number` | bar `len - 1` | Band width over the basis, a squeeze reads as a low |
| `bbPercent(src, len = 20, mult = 2)` | `series number` | bar `len - 1` | Where price sits between the bands, 0 at the lower and 1 at the upper |
| `keltner(len = 20, mult = 2, atrLen = 10, maType = "ema")` | `array<number>` | all elements at bar `max(len, atrLen) - 1` | `[basis, upper, lower]`; the same picture built from `atr` instead of deviation |
| `donchian(len = 20)` | `array<number>` | all elements at bar `len - 1` | `[upper, basis, lower]`; the window's outright high, midpoint and low |
| `chop(len = 14)` | `series number` | bar `len` | 0 to 100 reading of whether the window trended or chopped |
| `hv(src, len = 20, periodsPerYear = 252)` | `series number` | bar `len` | Annualised standard deviation of log returns |
| `massIndex(len = 25)` (planned) | `series number` | bar `len + 17` | Range expansion as a reversal warning |

`trueRange()` on bar 0 is `high - low`. The other two terms of the definition
need the previous close, which is absent there, and propagating absence would
make `atr` start one bar later than every reference implementation while adding
nothing: the bar's own range is a true statement about that bar. This is the one
deliberate exception to absence propagation in the library, and it is written
here rather than left to the engine.

`stdev` and `variance` divide by `len`, the population form, because that is what
the band studies a chart must reproduce use. Pass `sample = true` for the `len -
1` divisor. Naming the choice in an argument means neither camp has to write the
correction by hand.

**Count: 13 entries, of which 1 is planned.**

---

## 7. Volume

Every function here returns `none` on every bar when the host supplies no volume
for the instrument. Test `chart.hasVolume` to branch on that rather than
inspecting the result.

| Call | Returns | Warmup | For |
|---|---|---|---|
| `vwap(src = hlc3)` | `series number` | the session's first bar | Volume weighted average price since the session opened |
| `vwapAnchor(src, resetWhen)` | `series number` | the first bar `resetWhen` is true | The same average, restarted on any bar the condition is true |
| `obv()` | `series number` | bar 0, seeded 0 | Running total of volume signed by the close's direction |
| `ad()` | `series number` | bar 0 | Running total of volume weighted by where the close sat in the bar |
| `adOsc(fast = 3, slow = 10)` | `series number` | bar `slow - 1` | The difference of two means of `ad`, to date its turns |
| `mfi(len = 14)` | `series number` | bar `len` | `rsi` computed on money flow rather than price |
| `cmf(len = 20)` | `series number` | bar `len - 1` | Accumulation over the window as a fraction of its volume |
| `pvt()` | `series number` | bar 1, seeded 0 | Running total of volume weighted by percentage change |
| `eom(len = 14)` | `series number` | bar `len` | How far price moved per unit of volume |
| `forceIndex(len = 13)` | `series number` | bar `len` | Change times volume, smoothed |
| `relativeVolume(len = 20)` | `series number` | bar `len - 1` | This bar's volume over its own recent average |
| `nvi()` (planned) | `series number` | bar 1 | Cumulative change on bars where volume fell |
| `pvi()` (planned) | `series number` | bar 1 | Cumulative change on bars where volume rose |
| `klinger(fast = 34, slow = 55, signal = 13)` (planned) | `array<number>` | bar `slow + signal - 2` | `[klinger, signal]`; volume force against the bar's trend |
| `volumeProfile(rows = 24, from = none)` (planned) | `array<number>` | the anchor bar | Volume by price level, for a histogram drawn sideways |
| `cvd()` (planned) | `series number` | bar 0 | Cumulative signed volume, once the host supplies intrabar data |

`vwap` resets at the start of each trading session as the host defines it, not at
midnight, because the session is what the number means. On a daily or longer
interval, where each bar is its own session, `vwap` equals `src` and the compiler
emits warning OS8006 saying so.

**Count: 16 entries, of which 5 are planned.**

---

## 8. Maths and rounding

### 8.1 Bare functions

None of these has a warmup: they read the current bar's values only, so they
produce a value on bar 0 whenever their arguments do.

| Call | Returns | For |
|---|---|---|
| `abs(x)` | `number` | Magnitude without sign |
| `sign(x)` | `number` | `-1`, `0` or `1` |
| `min(a, b)` | `number` | The smaller of two |
| `max(a, b)` | `number` | The larger of two |
| `clamp(x, lo, hi)` | `number` | `x` held inside a range |
| `floor(x)` | `number` | Toward negative infinity |
| `ceil(x)` | `number` | Toward positive infinity |
| `round(x)` | `number` | To the nearest whole number, halves away from zero |
| `round(x, decimals)` | `number` | To a fixed number of decimals, halves away from zero |
| `trunc(x)` | `number` | Toward zero |
| `roundToStep(x, step)` | `number` | To the nearest multiple of `step` |
| `roundToTick(price)` | `number` | To the instrument's tick, `none` when `chart.tickSize` is absent |
| `sqrt(x)` | `number` | Square root, `none` below zero |
| `pow(x, y)` | `number` | `x` to the power `y`, `none` where the result is not a finite real |
| `exp(x)` | `number` | `e` to the power `x` |
| `log(x)` | `number` | Natural logarithm, `none` at or below zero |
| `log10(x)` | `number` | Base ten logarithm, same absence rule |
| `mod(a, b)` | `number` | `a - b * floor(a / b)`, the floored remainder, whose sign follows `b`; `none` when `b` is zero |
| `isNone(x)` | `bool` | True when the value is absent |
| `orElse(x, fallback)` | same as `x` | `x` when present, `fallback` when absent |
| `bool(x)` | `bool` | `none` to `false`, a bool to itself; numbers are rejected |

`round(x)` rounds halves away from zero rather than to even, because a price
rounded for display should agree with what a trader would write down, and
round-half-to-even surprises people at exactly the values that matter. The rule
is fixed so two engines cannot differ on a tick.

`roundToTick` returns `none` rather than the unrounded price when the host has
not supplied a tick size. Returning the input would produce an order price that
looks rounded and is not.

`mod` is the floored remainder and `%` is the truncated one, and that is the
whole difference between them: `mod(-7, 3)` is `2` where `-7 % 3` is `-1`, and
`mod(7, -3)` is `-2` where `7 % -3` is `1`. The formula is written out rather
than described because "the modulo" names two different functions in common use
and an engine that picked the other one would disagree with every other engine at
every negative argument. The two agree for every positive `b`, which is every use
that wraps an index, a bar count or a session offset. `mod(a, 0)` is `none`, on
the rule of section 2.4 that a result with no finite real value is absent, and it
is the answer `a % 0` gives as well. `mod` is a library call and compiles to one;
the `MOD` instruction of `compiled-program.md` section 4.5 is the `%` operator,
not this function.

### 8.2 The `math` namespace

| Call | Returns | For |
|---|---|---|
| `math.pi` | `number` | The circle constant |
| `math.e` | `number` | The base of the natural logarithm |
| `math.log2(x)` | `number` | Base two logarithm |
| `math.hypot(x, y)` | `number` | `sqrt(x * x + y * y)` without intermediate overflow |
| `math.toDegrees(x)` | `number` | Radians to degrees |
| `math.toRadians(x)` | `number` | Degrees to radians |
| `math.sin(x)` | `number` | Sine of an angle in radians |
| `math.cos(x)` | `number` | Cosine |
| `math.tan(x)` | `number` | Tangent |
| `math.asin(x)` | `number` | Inverse sine, `none` outside -1 to 1 |
| `math.acos(x)` | `number` | Inverse cosine, same range rule |
| `math.atan(x)` | `number` | Inverse tangent |
| `math.atan2(y, x)` | `number` | Angle of a vector, correct in all four quadrants |
| `math.sinh(x)` (planned) | `number` | Hyperbolic sine |
| `math.cosh(x)` (planned) | `number` | Hyperbolic cosine |
| `math.tanh(x)` (planned) | `number` | Hyperbolic tangent |

There is no random number function, in this namespace or anywhere else. A script
that could produce a different answer on a second run could not be part of a
conformance suite, and a backtest whose numbers move between runs cannot be
compared with another backtest, which is the whole purpose of running one.

**Count: 37 entries, of which 3 are planned.**

---

## 9. Series helpers

The functions that work across bars rather than within one. `cond` is a
`series bool`.

| Call | Returns | Warmup | For |
|---|---|---|---|
| `highest(src, len)` | `series number` | bar `len - 1` | Largest value in the last `len` bars |
| `lowest(src, len)` | `series number` | bar `len - 1` | Smallest value in the last `len` bars |
| `highestBars(src, len)` | `series number` | bar `len - 1` | How many bars back the window's high was set, 0 for this bar |
| `lowestBars(src, len)` | `series number` | bar `len - 1` | How many bars back the window's low was set |
| `change(src)` | `series number` | bar 1 | `src - src[1]` |
| `change(src, len)` | `series number` | bar `len` | `src - src[len]` |
| `rising(src, len)` | `series bool` | bar `len` | True when each of the last `len` changes was positive |
| `falling(src, len)` | `series bool` | bar `len` | True when each of the last `len` changes was negative |
| `crossUp(a, b)` | `series bool` | bar 1 | `a` was at or below `b` and is now above |
| `crossDown(a, b)` | `series bool` | bar 1 | `a` was at or above `b` and is now below |
| `cross(a, b)` | `series bool` | bar 1 | Either direction |
| `barsSince(cond)` | `series number` | first bar `cond` is true | Bars since the condition last held, 0 on the bar itself |
| `valueWhen(cond, src, occurrence = 0)` | same as `src` | the `occurrence + 1` th true bar | `src` as it stood the last time the condition held, or the one before that |
| `cum(src)` | `series number` | bar 0 | Running total from the first bar |
| `sum(src, len)` | `series number` | bar `len - 1` | Total over the window |
| `count(cond, len)` | `series number` | bar `len - 1` | How many of the last `len` bars the condition held on |
| `sumSkip(src, len)` | `series number` | bar `len - 1` | Total over the window, ignoring absent bars |
| `avgSkip(src, len)` | `series number` | bar `len - 1` | Mean over the window, ignoring absent bars |
| `countPresent(src, len)` | `series number` | bar `len - 1` | How many bars of the window had a value |
| `history(src, n)` | same as `src` | bar `n` | `src` as it stood `n` bars ago, the explicit form of `src[n]` |
| `pivotHigh(src, left, right)` | `series number` | bar `left + right` | The value of a local high, reported `right` bars after it formed |
| `pivotLow(src, left, right)` | `series number` | bar `left + right` | The value of a local low, on the same terms |
| `median(src, len)` | `series number` | bar `len - 1` | Middle value of the window |
| `percentile(src, len, p)` | `series number` | bar `len - 1` | The value at percentile `p` of the window, linearly interpolated |
| `percentRank(src, len)` | `series number` | bar `len - 1` | What percentage of the window this bar's value exceeds |
| `correlation(a, b, len)` | `series number` | bar `len - 1` | Linear correlation of two series over the window, -1 to 1 |
| `covariance(a, b, len)` | `series number` | bar `len - 1` | Covariance over the window, population form |

`crossUp` uses "at or below, then above" rather than "strictly below, then
above", so two series that touch and separate report one cross rather than none.
The alternative loses the case where the values are briefly equal, which is
common on instruments with a coarse tick.

`pivotHigh` and `pivotLow` report on the bar `right` bars *after* the pivot,
which is the first bar on which the pivot is knowable. A study that wants the
marker drawn back at the pivot passes `offset = -right` to `plot` or anchors a
drawing at `time[right]`. Returning it at the pivot bar would be a lookahead: the
value would appear on history at a bar where no script could have had it.

`barsSince` and `valueWhen` are absent, not zero, before the condition has ever
been true. Zero would read as "it happened on this bar".

**Count: 27 entries, of which 0 are planned.**

---

## 10. Strings and formatting

| Call | Returns | For |
|---|---|---|
| `text(x)` | `string` | Any value to a string; `text(none)` is `"none"` |
| `text(x, decimals)` | `string` | A number to a string with fixed decimals, halves away from zero |
| `number(s)` | `number` | A string to a number, `none` when it does not parse |
| `str.length(s)` | `number` | Count of Unicode code points |
| `str.upper(s)` | `string` | Upper case, invariant, not locale dependent |
| `str.lower(s)` | `string` | Lower case, on the same terms |
| `str.trim(s)` | `string` | Leading and trailing spaces removed |
| `str.contains(s, part)` | `bool` | Whether one string appears in another |
| `str.startsWith(s, part)` | `bool` | Prefix test |
| `str.endsWith(s, part)` | `bool` | Suffix test |
| `str.indexOf(s, part)` | `number` | First position of `part`, or `-1` |
| `str.substring(s, from, to = none)` | `string` | `from` inclusive, `to` exclusive, to the end when `to` is absent |
| `str.replace(s, find, with)` | `string` | First occurrence only |
| `str.replaceAll(s, find, with)` | `string` | Every occurrence |
| `str.split(s, separator)` | `array<string>` | Split into parts |
| `str.join(parts, separator)` | `string` | Join an array back into one string |
| `str.padLeft(s, width, fill = " ")` | `string` | Pad to a width, for a table column that must line up |
| `str.padRight(s, width, fill = " ")` | `string` | The same from the other side |
| `str.repeat(s, n)` | `string` | `n` copies, for a bar drawn out of characters in a table cell |
| `str.format(template, values)` (planned) | `string` | Substitution into a template |
| `str.match(s, pattern)` (planned) | `bool` | Pattern matching, once a pattern syntax is specified |

None of these has a warmup: a string operation on a present string produces a
value on bar 0.

Case conversion is invariant rather than locale aware. A script whose output
changed because the machine running it was configured for a different locale
would break the determinism rule of `language.md` section 7.6, and the cases
where a locale-aware conversion differs are not cases a trading script needs.

`str.format` is planned rather than shipped because version 1 has no variadic
call form, and the array-of-strings workaround reads worse than concatenating
with `text()`. It arrives with the call form, not before.

**Count: 21 entries, of which 2 are planned.**

---

## 11. Colour

### 11.1 Named colours

Nineteen bare names, as `language.md` section 3.8 fixes them:

```
aqua     black   blue    brown   fuchsia  gray     green   lime
maroon   navy    olive   orange  pink     purple   red     silver
teal     white   yellow
```

Each is an ordinary global of type `color` with full opacity. Their exact channel
values are fixed in the library manifest and are part of the conformance suite,
so a study looks the same on every engine.

### 11.2 Construction

| Call | Returns | For |
|---|---|---|
| `rgb(r, g, b)` | `color` | Channels 0 to 255, fully opaque |
| `rgba(r, g, b, a)` | `color` | The same with alpha 0 to 1, where 1 is opaque |
| `fade(color, percent)` | `color` | The same colour at `percent` transparency, where 100 is invisible |
| `mix(a, b, weight)` | `color` | Blend of two colours, `weight` 0 gives `a` and 1 gives `b` |
| `alpha(color)` | `number` | Read a colour's alpha, 0 to 1 |
| `withAlpha(color, a)` | `color` | The same colour at a stated alpha |
| `hsl(h, s, l)` (planned) | `color` | Hue, saturation, lightness construction |
| `gradient(value, from, to, colorFrom, colorTo)` (planned) | `color` | Position a value between two colours |

**Every call that computes a colour rounds red, green and blue to a whole number
before it returns**, with the language's own rounding, halves away from zero, the
`round` of section 8.1. `mix` is the call that produces fractional channels, so
`mix` is where the rule bites: `mix(a, b, weight)` rounds each of the three
channels before returning, and the value model's invariant, whole channels and a
binary64 alpha from 0 to 1, then holds of every colour and not only of a literal
(`compiled-program.md` section 3.1). Alpha is not rounded here.

**At the contract boundary the alpha becomes a byte as `round(alpha * 255)`**,
the same rounding, and that byte is the `aa` of the `#rrggbbaa` spelling the
conformance suite compares. The conversion is one way and is not a round trip:
`fade(aqua, 88)` is an alpha of 0.12, which serialises as `round(0.12 * 255)`,
that is 31, written `1f`, and `1f` read back is 31 divided by 255, which is not
0.12. Nothing in the language observes the difference, because a script reads
alpha with `alpha()` from the machine value and never from the wire form.

`fade` takes transparency, not opacity, and the argument is a percentage. Both
choices follow the way a chart's own style controls are labelled, and the entry
says so here because the two conventions are opposites and a script that guesses
wrong draws something invisible. `withAlpha` exists for the other convention and
takes 0 to 1. `fade(c, p)` is `withAlpha(c, (100 - p) / 100)` exactly, which sets
the alpha rather than scaling it, whatever alpha `c` already carried, so nesting
two fades replaces the inner call's alpha with the outer one's and
`fade(fade(aqua, 50), 50)` is `fade(aqua, 50)`.

A channel argument outside its range is OS3004, not a clamp, because a colour
computed from data and landing at 300 is a bug in the computation.

**Lands in:** a colour reaches the contract as a colour string on whatever field
carries it: a plot's style colour, a per-bar plot colour, a band's up or down
colour, a level's colour, a drawing's line, fill or text colour, a table cell's
text or background, a pane background entry, a price bar colour. An alpha below 1
is carried in the string's alpha channel.

**Count: 8 functions and 19 named colours, of which 2 functions are planned.**

---

## 12. Time, session and calendar

### 12.1 The zone every calendar field is read in

**Every function in this section reads a timestamp in the chart's timezone
(`chart.timezone`) unless a `zone` argument names another.** A session study that
disagreed with the labels on the chart's own axis would be wrong in the way that
is hardest to see, so the default is the axis, not UTC.

A zone is an IANA name, never a fixed offset. A fixed offset is silently wrong
for half the year anywhere that observes daylight saving. An unknown zone name is
OS6005.

### 12.2 The `date` namespace

`t` is a timestamp in UTC milliseconds, usually `time`. None of these has a
warmup.

| Call | Returns | For |
|---|---|---|
| `date.year(t, zone = chart.timezone)` | `number` | Calendar year |
| `date.month(t, zone = ...)` | `number` | Month, 1 to 12 |
| `date.day(t, zone = ...)` | `number` | Day of the month, 1 to 31 |
| `date.dayOfWeek(t, zone = ...)` | `number` | 1 for Monday through 7 for Sunday |
| `date.dayOfYear(t, zone = ...)` | `number` | 1 to 366 |
| `date.hour(t, zone = ...)` | `number` | 0 to 23 |
| `date.minute(t, zone = ...)` | `number` | 0 to 59 |
| `date.second(t, zone = ...)` | `number` | 0 to 59 |
| `date.weekOfYear(t, zone = ...)` | `number` | Week number, weeks starting Monday |
| `date.from(year, month, day, hour = 0, minute = 0, second = 0, zone = ...)` | `number` | Build a timestamp from calendar fields |
| `date.startOfDay(t, zone = ...)` | `number` | Midnight at the start of `t`'s day |
| `date.startOfWeek(t, zone = ...)` | `number` | Midnight at the start of `t`'s Monday |
| `date.startOfMonth(t, zone = ...)` | `number` | Midnight on the first of `t`'s month |
| `date.isSameDay(a, b, zone = ...)` | `bool` | Whether two timestamps fall on one calendar day |
| `date.format(t, pattern, zone = ...)` | `string` | Render a timestamp, section 12.3 |
| `date.add(t, unit, count, zone = ...)` (planned) | `number` | Calendar arithmetic that respects month lengths and daylight saving |

`date.dayOfWeek` numbers Monday as 1 so that a weekday test reads
`date.dayOfWeek(time) <= 5` and a trading week is a contiguous range. Numbering
Sunday as 1, which some calendars do, splits the trading week across the ends of
the range.

### 12.3 The format pattern

`date.format` accepts these placeholders and copies every other character
through. The set is small and closed so that two engines cannot differ.

```
yyyy  four digit year        MM  two digit month     dd  two digit day
HH    two digit hour, 24     mm  two digit minute    ss  two digit second
MMM   three letter month     EEE three letter weekday
```

Month and weekday abbreviations are English and invariant, for the same
determinism reason as `str.upper`.

### 12.4 The `session` namespace

The session is the instrument's trading session as the host defines it, not a
window the script invents. Everything here is a per-bar fact.

| Call | Returns | Warmup | For |
|---|---|---|---|
| `session.isOpen` | `series bool` | bar 0 | This bar falls inside the instrument's trading session |
| `session.isFirstBar` | `series bool` | bar 0 | This is the session's first bar |
| `session.isLastBar` | `series bool` | bar 0 | This is the session's last bar |
| `session.startTime` | `series number` | the session's first bar | When this bar's session opened |
| `session.endTime` | `series number` | the session's first bar | When this bar's session is scheduled to close |
| `session.barIndex` | `series number` | bar 0 | This bar's position within its session, first is 0 |
| `session.isIn(spec, zone = chart.timezone)` | `series bool` | bar 0 | Whether the bar falls in a stated window, section 12.5 |
| `session.isHoliday(t)` (planned) | `bool` | n/a | Whether a date is a trading holiday, once a calendar is supplied |
| `session.nextOpen` (planned) | `series number` | bar 0 | When the next session opens |

`session.isLastBar` is known only because the host states the session's scheduled
close, so it is true on the last bar of the schedule even if trading stopped
early. A strategy that must be flat by the close acts on this rather than on the
appearance of a new bar, which arrives too late.

### 12.5 The session window spec

`session.isIn` takes a string of the form `"HHMM-HHMM"` with an optional day
list: `"0915-1530"`, `"0915-1530:12345"`. Days are 1 for Monday through 7 for
Sunday, matching `date.dayOfWeek`. A window whose end is before its start crosses
midnight and is read that way, which is what an overnight session needs. A
malformed spec is OS3008 at compile time when it is a literal.

**Count: 25 entries, of which 3 are planned.**

---

## 13. Inputs

An input is how a study becomes configurable: each call declares one tunable
value and builds one row of the settings dialog the host generates. `input()`
appears only at the top level of a file, never inside a block or a function
(OS3007), because the dialog is built once before the first bar runs.

### 13.1 The one function and its kinds

There is one function, `input()`, and the kind of control is decided by the type
of the default value. Two kinds are both spelled with a string default, so a
`kind` argument separates them.

```
len   = input(14,     "Length", min = 1, max = 500)
src   = input(close,  "Source")
on    = input(true,   "Show the band")
tint  = input(aqua,   "Colour")
mode  = input("fast", "Mode", options = ["fast", "slow"])
tf    = input("60",   "Higher timeframe", kind = "interval")
```

| Call | Returns | Lands in | For |
|---|---|---|---|
| `input(n: number, title, min = none, max = none, step = none, ...)` | `number` | a `number` input | A length, a multiplier, a threshold |
| `input(b: bool, title, ...)` | `bool` | a `bool` input | A switch for an optional part of the study |
| `input(s: string, title, ...)` | `string` | a `string` input | Free text: a label, a note on a drawing |
| `input(s: string, title, options = [...], ...)` | `string` | a `select` input | A choice from a fixed list, rendered as a menu |
| `input(c: color, title, ...)` | `color` | a `color` input | A colour the user can restyle without editing the script |
| `input(src: series, title, ...)` | `series number` | a `source` input | Which price the study reads: one of `open`, `high`, `low`, `close`, `hl2`, `hlc3`, `ohlc4`, `volume` |
| `input(s: string, title, kind = "interval", ...)` | `string` | an `interval` input | A timeframe code, rendered as a menu over the intervals the host can serve |
| `input(s: string, title, kind = "time", ...)` | `number` | a `time` input | An instant the user picks by date, for an anchor |
| `input(s: string, title, kind = "symbol", ...)` (planned) | `string` | a `string` input | Another instrument, rendered as a picker |
| `input(n: number, title, kind = "price", ...)` (planned) | `number` | a `number` input | A price the user sets by clicking the chart |
| `input(s: string, title, kind = "session", ...)` (planned) | `string` | a `string` input | A session window, rendered as two clock fields |

### 13.2 Arguments every kind accepts

| Argument | Type | Default | Means |
|---|---|---|---|
| first positional | the value's type | required | The default value, which fixes the input's type |
| `title` | `string` | the variable's name | The label in the settings dialog. Second positional |
| `group` | `string` | `""` | A heading the dialog groups rows under |
| `tooltip` | `string` | `""` | Help text beside the label, for what a label is too short to say |
| `inline` | `string` (planned) | `""` | Rows sharing a value sit on one line |
| `confirm` | `bool` (planned) | `false` | Ask for this value when the study is added |

The default comes first, before the title, because the default fixes the type and
a reader scanning a column of inputs wants the value. An `input()` whose default
is not a compile-time constant is OS3003.

### 13.3 The kind arguments that only some kinds accept

| Argument | Kinds | Means |
|---|---|---|
| `min`, `max` | number, price | Range the dialog enforces; a value outside it is OS3004 |
| `step` | number, price | Increment of the dialog's stepper |
| `options` | string | The list a menu offers; makes the input a `select` |
| `kind` | string, number | Names the control where the type alone cannot: `"interval"`, `"time"`, `"symbol"`, `"price"`, `"session"` |

An `input` of kind `"time"` returns a number, a timestamp, although its stored
value is a wall clock string in the chart's zone. Storing the string is what lets
a saved layout restore to the same wall clock in another timezone; returning the
timestamp is what a script actually wants to compare against `time`. The
conversion happens once, before bar 0.

### 13.4 Style inputs a script does not write

The host generates a colour, opacity, thickness, line style and plot style row
for every `plot`, without the script declaring any of them. A script that wants a
colour under its own name declares a `color` input and passes it to the plot,
which takes over that row rather than adding a second one.

**Count: 11 input kinds and 6 shared arguments, of which 3 kinds and 2 arguments
are planned.**

---

## 14. Drawing and output

### 14.1 What may appear where

`plot`, `plotCandles`, `fill`, `level` and `table` are top level only (OS3006),
and `input` is top level only under a code of its own (OS3007). They declare the
fixed shape of the study: the set of columns, bands, levels and grids must be
known before bar 0 so the legend, the axis and the settings dialog can exist.
Hide one on a bar by giving it `none`, never by wrapping it in an `if`.

`signal`, `alert`, `barColor`, `background`, `cell`, `clear`, `print`, the whole
`draw` namespace and every order function of section 17 may appear anywhere,
because they are per-bar events, per-bar paint or per-bar decisions. This is the
same split as `language.md` section 15.3, stated with both lists complete.

The two lists are not two halves of one idea. `plot`, `plotCandles`, `fill` and
`level` return a **declaration handle**, a compile-time value; `table()` returns
a **runtime object** although its call site is fixed at the top level; and
`draw.line()` and its siblings return runtime objects a script keeps, mutates
and deletes.
`language.md` section 5.4 defines both kinds and lists exactly what each one
admits. In short: a handle may be named at the top level and passed to `fill`,
and nothing else; an object is an ordinary value and may be held in a `var`, put
in an array and passed to a function.

### 14.2 Plots, bands and levels

| Call | Returns | Lands in | For |
|---|---|---|---|
| `plot(value, title, color = none, width = 1.5, style = "line", offset = 0, overlay = none, precision = none, format = none, scale = "right")` | `plot` | one entry of the contract's plotted columns | Draw a column of numbers |
| `plotCandles(open, high, low, close, title, colorUp = lime, colorDown = red, wickColor = none, borderColor = none)` | `plot` | a plotted column with its four named source columns | Draw bar-shaped output: a smoothed or higher timeframe candle |
| `fill(plotA, plotB, color = none, colorUp = none, colorDown = none, opacity = 1, overlay = none)` | `fill` | one entry of the contract's shaded bands | Shade the region between two declared plots |
| `level(price, title = "", color = gray, style = "dashed", width = 1)` | `level` | one entry of the contract's horizontal levels | A fixed reference line in the study's pane |

**`fill`'s first two arguments are plot handles, not series.** They name the two
declared columns the band is drawn between. The compiled program carries them as
the two plot keys of `outputs.fills[].between` (`compiled-program.md` section
2.8), and the chart's own band spec holds the same pair of keys, so there is
nothing in the contract for a bare expression to become and a script cannot shade
between a column it never declared. An expression in either position is OS3020,
with the fix naming the plot to declare.

```
upper = plot(basis + dev, "Upper", aqua)
lower = plot(basis - dev, "Lower", aqua)
fill(upper, lower, color = fade(aqua, 88))
```

`plot`, `plotCandles`, `fill` and `level` each return a declaration handle of
type `plot`, `plot`, `fill` and `level` (`language.md` section 5.4). A handle may
be assigned to a name at the top level and passed to a declaration call that
takes one; it may not be stored in a `var`, put in an array, passed to a user
function or read with `[]`. `fill` is the only call in version 1 that takes one,
so a `fill` or `level` result is normally discarded; naming it is legal and does
nothing. A handle from `plotCandles` is a `plot`, and a band drawn to one follows
its `close` column, which is the column the contract keeps as that plot's
identity.

**The colour arguments.** `color` sets both sides of the band. `colorUp` sets the
side where `plotA` is above `plotB` and `colorDown` the side where `plotB` is
above `plotA`; a band that reads differently depending on which line leads is the
reason the contract carries two. Giving `color` together with either of the other
two is OS3010, because reconciling them would need a rule and every rule for it
surprises somebody. With none of the three given, the band is `plotA`'s colour
faded to twelve percent, which is the chart's own default for a band and is faint
enough not to drown what is behind it.

**Opacity multiplies the colour's alpha, and defaults to 1.** A colour carries
its own alpha everywhere in this language, and `fade(aqua, 88)` is how a script
says "twelve percent" for a pane background, a box fill or a band alike. So
`opacity` is not a second way to say the same thing: it is a dimmer over whatever
the colours already are, it reaches the contract as the band's own `opacity`
field, and a script that never touches it gets exactly the colour it wrote. As on
a plot, a constant colour lands on the band's style and a `series color` lands on
the contract's per-bar colour channel instead.

`style` accepts `"line"`, `"lineWithMarkers"`, `"step"`, `"area"`, `"histogram"`
and `"column"`. These are the styles that make sense for a single column of
values, and they are the same set the host's own plot style menu offers, so a
user can change the style of any plot after the fact without editing the script.

**A constant colour and a per-bar colour are the same argument.** Pass a `color`
and it lands on the plot's style; pass a `series color` and it lands on the
contract's per-bar colour callback instead. One argument covers both because a
script that starts with one colour and later wants two should not have to move to
a different function.

```
plot(macdHist, "Histogram", color = macdHist > 0 ? lime : red, style = "histogram")
```

An omitted colour is the same thing as an explicit `none`, and it leaves the
plot's colour to the host: the compiled program carries null in that plot's
`color` field (`compiled-program.md` section 2.8) and the host assigns one from
the same palette it already uses to fill the generated style row of section 13.4.
That is why the default is `none` rather than a named colour, which would draw
every undecorated column of a three plot study in one colour.

`level(price, ...)` takes a value that may be data-derived, such as the previous
day's high, because the contract recomputes levels after every calculation.

`offset` shifts only where the column is drawn, never what it contains. A
positive offset puts the last values in the margin past the newest bar, which is
what a displaced cloud or a projected channel wants.

`precision` and `format` on a plot set the formatting of the *price scale* the
plot maps to, so setting them on a plot drawn over the price pane reformats the
instrument's own axis. That is almost never wanted, and the compiler emits
warning OS8007 when a script does it.

### 14.3 Markers, paint and grids

| Call | Returns | Lands in | For |
|---|---|---|---|
| `signal(text, color = none, at = "above", shape = "label")` | nothing | one entry of the contract's markers | A named marker on this bar |
| `barColor(color)` | nothing | the contract's price bar colours | Recolour the instrument's own candles on this bar |
| `background(color)` | nothing | the contract's pane background | Shade the whole height of this bar's column behind everything else |
| `table(title, rows, cols, position = "topRight", textColor = none, bgColor = none, borderWidth = 0)` | `table` | the contract's summary grid | Declare a grid pinned to a corner of the pane |
| `cell(t, row, col, text, textColor = none, bgColor = none, align = "left")` | nothing | one cell of that grid | Write one cell on this bar |
| `clear(t)` | nothing | that grid | Empty every cell, so a table can be rebuilt from scratch |
| `print(value)` | nothing | nothing drawn | Write a value to the script's log with the bar's time |

`signal` is the whole of shape plotting, as `language.md` section 15.3 states.
`at` takes `"above"`, `"below"` or `"price"`, and `shape` takes `"label"`,
`"arrowUp"`, `"arrowDown"`, `"triangleUp"`, `"triangleDown"`, `"circle"`,
`"square"`, `"diamond"`, `"cross"` and `"flag"`. `at`, `shape` and `color` are
part of the marker's declaration and are fixed before bar 0, so each must be a
compile-time constant, a literal or an `input()`; a bar-dependent one is OS3003.
Only the text is read per bar. The compiled field carries the same three
spellings (`compiled-program.md` section 2.8).

`signal` does not fire on a bar that is still moving unless the declaration sets
`onUnconfirmed = true` (`language.md` section 7.5).

`background(none)` and `barColor(none)` leave the bar alone, which is how a
conditional paint switches itself off. Passing an absent colour is not an error.

`print` writes to the per-script log, not to the chart. It is rate limited by the
host rather than by the language, and a host that drops lines must say how many
it dropped rather than truncating silently.

`table()` is top level only, as a plot is, because the grid's size and corner are
part of the study's fixed shape. What it returns is a **runtime object**, not a
declaration handle: `cell()` and `clear()` take it as an argument and write to it
per bar, so it is an ordinary value that can be named, kept and passed to a
function (`language.md` section 5.4). One call site returns the same object on
every bar. A table is never deleted; `clear(t)` empties its cells and the grid
lives as long as the study. `clear` is one overloaded name: `clear(arr)` is the
array operation of `language.md` section 14.1 and `clear(t)` is this one, told
apart by the argument's type under section 2.2.

### 14.4 The `draw` namespace

Objects a script creates and then mutates over time, rather than a column of one
value per bar. They are anchored to a time and a price, so an object stays where
it was put when more history is loaded and every bar index shifts.

**An object persists until the script deletes it.** There is no cap on how many
a script may create; the only budget is memory, and a host that cannot hold them
must say so rather than dropping the oldest. This is a deliberate difference from
the platforms this language exists to replace.

The four creation calls return a value of type `line`, `label`, `box` and
`polyline`. These are runtime objects and ordinary values: a script assigns one
to a name inside a block, keeps it in a `var`, holds a set of them in an
`array<box>`, passes one to a user function and compares one against `none`
(`language.md` section 5.4). That is what a drawing needs and a plot handle is
denied, because the set of drawings is unbounded and changes as bars arrive while
the set of plots is fixed before bar 0.

Dropping the last name that refers to an object does not delete it: the chart
holds it and it keeps drawing until `draw.delete` says otherwise. A handle to a
deleted object is stale rather than absent, so a script assigns `none` to the
name when it deletes the object, and a script holding objects in an array deletes
the object and then removes the element.

Creation:

| Call | Returns | Lands in | For |
|---|---|---|---|
| `draw.line(t1, p1, t2, p2, color = gray, width = 1, style = "solid", extendLeft = false, extendRight = false)` | `line` | one line in the contract's free drawings | A trendline between two points |
| `draw.label(t, p, text, color = none, textColor = white, align = "center", tooltip = "")` | `label` | one label in the same field | A plate of text at a point |
| `draw.box(t1, p1, t2, p2, color = none, fillColor = none, opacity = 0.12, width = 1, text = "", textColor = white, tooltip = "")` | `box` | one box in the same field | A zone: supply, demand, an opening range |
| `draw.polyline(times, prices, color = gray, width = 1, closed = false, fillColor = none, opacity = 0.12)` | `polyline` | one polyline in the same field | A path or a closed shape through many points |

`draw.polyline` takes two parallel arrays rather than an array of points because
version 1 has no record type. It arrives in its natural shape when `type` does.

Mutation, deletion and counting:

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

A setter given an object that has been deleted is OS4005 rather than a silent no
operation, because a script mutating a deleted object has lost track of its own
state and will keep doing so.

An object created on a bar that is then re-executed is subject to the rollback
rule of `language.md` section 7.5: the object set is restored to what it was at
the end of the previous bar before the moving bar runs again, so a live chart
does not accumulate a duplicate line per tick.

**Count: 31 entries, of which 0 are planned.**

---

## 15. Higher timeframe and other instrument reads

### 15.1 The two reads and the mode they declare

| Call | Returns | Warmup | Lands in | For |
|---|---|---|---|---|
| `req.timeframe(timeframe, expr, mode = "confirmed")` | series of `expr`'s type | first bar the mode allows, section 15.3 | the study's own calculation, folded from the chart's bars | Read an expression computed on a coarser interval |
| `req.symbol(symbol, timeframe, expr, exchange = chart.exchange, mode = "confirmed")` | series of `expr`'s type | as above, plus the host's answer | the contract's request for another instrument's bars, its attach lifecycle and its data status | Read an expression computed on another instrument |
| `req.isReady(read)` | `series bool` | bar 0 | the same | Whether the host has answered yet |
| `req.error(read)` | `series string` | bar 0 | the contract's data status | The reason a read failed, or `""` |
| `req.candle(timeframe, mode)` (planned) | `array<number>` | as above | a plotted column with four named sources | The whole higher timeframe bar at once, for drawing it |
| `req.events(kind)` (planned) | `series number` | host dependent | the same request path | Dividends, splits and other scheduled events |

### 15.2 Timeframe strings

A timeframe is a count and a unit: `"1m"`, `"5m"`, `"15m"`, `"1h"`, `"4h"`,
`"1D"`, `"1W"`, `"1M"`. The unit letters are case sensitive, so `"1M"` is one
month and `"1m"` is one minute. A bare number is read as minutes, so `"60"` and
`"1h"` are the same timeframe, because that is the form an interval input
supplies. An unrecognised timeframe is OS6001, and a timeframe finer than the
chart's own is OS6002, since folding cannot invent bars that were never loaded.

### 15.3 The mode, which is the whole point of this section

**`mode` decides what the read is allowed to know, and it is the argument that
makes a repainting study impossible to write by accident.**

| Mode | What it reads | Repaints | Warmup |
|---|---|---|---|
| `"confirmed"` | Only higher timeframe bars that have closed | Never | Absent until the first higher timeframe bar has closed, then the value changes only when the next one closes |
| `"developing"` | Includes the higher timeframe bar currently forming | On the newest bars only, within the current higher timeframe period | Absent until the first higher timeframe bar has begun |
| `"lookahead"` | A higher timeframe bar's final value from its first lower timeframe bar | On history, permanently and by design | Absent only where the higher timeframe bar does not exist |

`"confirmed"` is the default, and it is the only mode that never repaints. The
other two must be written out. That is the whole mechanism: a script that
repaints says so on the line that causes it, in a word a reader will see during
review, and a script that says nothing cannot repaint.

The compiler emits warning OS8002 on a `"developing"` read and warning OS8005 on
a `"lookahead"` read, each naming the line and what the study will now do. A
`"lookahead"` read also marks the compiled study as repainting, and the host
shows that mark in the legend, because a warning in an editor nobody opens again
is not a disclosure.

`"lookahead"` exists at all because drawing the completed higher timeframe candle
across history is a legitimate picture, and a language that refused it would push
people to the same thing done worse. It is named so that nobody reaches it
without meaning to.

### 15.4 What an expression means inside a read

The `expr` argument is compiled as a separate program over the requested bars.
Inside it, the built-in series of section 3.1 are the requested instrument's, at
the requested timeframe.

```
dayHigh   = req.timeframe("1D", high)
dayRsi    = req.timeframe("1D", rsi(close, 14))
indexTrend = req.symbol("INDEX", "1D", ema(close, 20) > ema(close, 50))
```

A name from the file scope may be read inside `expr` only when it is a
compile-time constant: a literal, arithmetic over literals, or an `input()`.
Reading a per-bar name is OS6003, because a value computed on this chart's bars
has no counterpart on the requested bars and there is no honest answer for what
it would mean there.

An order function inside `expr` is OS7003. Drawing and alert calls inside `expr`
are OS3006.

### 15.5 Waiting for the host

A `req.symbol` read cannot complete until the host supplies the other
instrument's bars, which is not instant. The read is absent until the answer
arrives, the study reports itself as loading through the contract's data status,
and the engine recalculates when the bars land. A refusal, an unknown symbol or a
host with no provider at all surfaces as OS6002 with the reason in
`req.error(...)` and a retry the host can offer. The study keeps drawing
everything that does not depend on the read.

**Count: 6 entries, of which 2 are planned.**

---

## 16. Alerts

| Call | Returns | Lands in | For |
|---|---|---|---|
| `alert(message, id = "", title = "", frequency = "oncePerBar")` | nothing | one entry of the contract's watched conditions | Raise a named alert on this bar |
| `notify(message, channel)` (planned) | nothing | the host's routing, not the chart | Send an alert somewhere the host has configured |

`alert()` is the only function in this group. That is not an omission: a
condition is an ordinary `if` in the language, so an alert needs nothing beyond a
way to say what to send.

```
if crossUp(fast, slow)
    alert("Fast crossed above slow at " + text(close, 2), id = "cross-up")
```

### 16.1 How a call becomes a declared condition

The compiler lifts each `alert()` call site into one entry of the contract's
watched conditions. The entry's predicate is the chain of guards that reaches the
call, and its message is the argument, evaluated for the bar the predicate
accepted. The host's runtime then watches the study rather than the script
polling anything.

This is why `id` matters: it is the stable name of that entry, so a user's alert
subscription survives an edit to the script. With no `id` the compiler derives
one from the call's position, which changes when a line is inserted above it, and
emits warning OS8008 saying so.

### 16.2 When an alert fires

An alert follows the rule of `language.md` section 7.5: it does not fire on a bar
that is still moving unless the declaration sets `onUnconfirmed = true`. The
deferred call fires when the bar closes, and if the condition is no longer true
by then it never fires at all. That is the behaviour that makes an alert worth
acting on.

`frequency` takes:

| Value | Means |
|---|---|
| `"oncePerBar"` | At most one alert per bar, the default |
| `"once"` | The first time only, for the life of this study instance |
| `"everyUpdate"` | On every execution of the bar; requires `onUnconfirmed = true`, or OS3009 |

Adding a study to a chart that already holds history fires nothing for those
bars. An alert is a statement about now, and a study added at noon that emitted
four hundred historical alerts would be useless.

**Count: 2 entries, of which 1 is planned.**

---

## 17. Orders and position

Everything in this section is available only in a `strategy()` file. Calling one
from a `study()` file is OS7001, with the fix naming the declaration to change.

### 17.1 The position model

A strategy holds **one net position** in the instrument the chart is showing.
`buy(qty)` adds to it, `sell(qty)` subtracts from it, and an order that crosses
zero is reported as one exit and one entry. `close()` flattens it.

One net position rather than independent long and short books, because a net
position is what a broker actually gives back, and a language whose model
disagreed with the account would produce a backtest that cannot be reconciled
with a statement.

**No order function takes a symbol.** A strategy trades the instrument on its
chart and nothing else, so a position built from more than one instrument is
written as one leg traded, the others read with `req.symbol` of section 15, and
the decision routed by the host from an `alert`. Version 1 stops there rather
than half-defining a per-leg order, because a per-leg order needs per-leg
position facts and a fill model for bars that are not the chart's, and a fill
model that guessed would report a backtest fill at a price the leg never traded.
The boundary is stated here so that a multi-leg script is written to it on
purpose rather than discovering it in a backtest.

An order is filled according to the declaration's `fillOn` option, which defaults
to the next bar's open (`language.md` section 13.3), with the declared slippage
and commission applied.

An order function given an absent price or quantity is OS7002 and places nothing,
per `language.md` section 6.8.

### 17.2 Placing orders

| Call | Returns | Lands in | For |
|---|---|---|---|
| `buy(qty = the declaration's, limit = none, stop = none, tag = "")` | nothing | the host's order interface; the fill reaches the chart as a marker | Enter or add to a long position |
| `sell(qty = ..., limit = none, stop = none, tag = "")` | nothing | the same | Enter or add to a short position |
| `close(tag = none, qty = none)` | nothing | the same | Flatten the position, or the part carrying one tag |
| `exit(tag = "", qty = none, limit = none, stop = none, trail = none, trailOffset = none, profit = none, loss = none)` | nothing | the same | Attach a bracket: a target, a stop, or a trailing stop |
| `cancel(tag)` | nothing | the same | Cancel a working order that has not filled |
| `cancelAll()` | nothing | the same | Cancel every working order this strategy placed |

With neither `limit` nor `stop`, `buy` and `sell` place a market order. With
`limit` alone they place a limit order, with `stop` alone a stop order, and with
both a stop-limit order. One function with optional prices rather than six named
functions, because the trader's decision is direction and the price is a
qualifier.

`exit` prices may be given as absolute prices (`limit`, `stop`) or as distances
from the entry (`profit`, `loss`, in the instrument's own price units). Giving
both an absolute and a distance for the same side is OS3010, because the two
would have to be reconciled and any rule for that would surprise somebody.

### 17.3 The `order` namespace

| Call | Returns | For |
|---|---|---|
| `order.place(side, qty, type = "market", price = none, trigger = none, tag = "")` | nothing | The general form, for a script that computes its side |
| `order.reverse(qty = none, tag = "")` | nothing | Flatten and open the same size the other way, in one decision |
| `order.bracket(tag = "", profit = none, loss = none, trail = none, trailOffset = none)` | nothing | Attach or replace a bracket on the open position |
| `order.working(tag)` | `series bool` | Whether an order with that tag is live and unfilled |
| `order.pending` | `series number` | How many orders are live and unfilled |
| `order.qtyForCash(cash, price = close)` | `number` | Size from an amount of money |
| `order.qtyForRisk(risk, entry, stop)` | `number` | Size so that being stopped out costs `risk` |
| `order.qtyForEquityPercent(percent, price = close)` | `number` | Size from a percentage of current equity |
| `order.roundToLot(qty, direction = "down")` | `number` | Round to a whole multiple of `chart.lotSize` |
| `order.modify(tag, ...)` (planned) | nothing | Change a working order's price or quantity in place |
| `order.oco(tagA, tagB)` (planned) | nothing | Cancel one order when the other fills |

The sizing helpers round down to a whole number of units by default, and
`order.roundToLot` rounds down unless told otherwise, because a size rounded up
is a position larger than the script asked for and the error compounds with
every entry.

`order.qtyForRisk` returns `none` when `entry` and `stop` are equal, rather than
raising, because that is a real state during warmup and the order function that
receives the absent quantity will refuse it with OS7002 anyway, naming the
argument.

### 17.4 The `pos` namespace

What is readable about the position and the run so far. Every entry is a per-bar
fact and reflects fills, not intentions: an order placed on this bar and filled
on the next bar's open does not change any of these until that fill happens.

| Call | Returns | Warmup | For |
|---|---|---|---|
| `pos.size` | `series number` | bar 0, `0` when flat | Net position in units, positive long and negative short |
| `pos.isLong` | `series bool` | bar 0 | `pos.size > 0` |
| `pos.isShort` | `series bool` | bar 0 | `pos.size < 0` |
| `pos.isFlat` | `series bool` | bar 0 | `pos.size == 0` |
| `pos.avgPrice` | `series number` | absent while flat | Average price of the open position |
| `pos.entryTime` | `series number` | absent while flat | When the current position was opened |
| `pos.barsHeld` | `series number` | absent while flat | Bars since it was opened, 0 on the entry bar |
| `pos.entries` | `series number` | bar 0 | How many entries make up the current position, for a pyramiding rule |
| `pos.openProfit` | `series number` | absent while flat | Unrealised profit in money, at this bar's close |
| `pos.openProfitPercent` | `series number` | absent while flat | The same as a percentage of the position's cost |
| `pos.maxProfit` | `series number` | absent while flat | Best unrealised profit this position has seen |
| `pos.maxLoss` | `series number` | absent while flat | Worst unrealised loss this position has seen |
| `pos.equity` | `series number` | bar 0 | Starting capital plus realised and unrealised profit |
| `pos.netProfit` | `series number` | bar 0 | Realised profit since the run began |
| `pos.tradeCount` | `series number` | bar 0 | Closed trades so far |
| `pos.winRate` (planned) | `series number` | bar 0 | Share of closed trades that made money |
| `pos.profitFactor` (planned) | `series number` | bar 0 | Gross profit over gross loss |
| `pos.maxDrawdown` (planned) | `series number` | bar 0 | Largest peak to trough fall in equity so far |

`pos.avgPrice` is absent while flat rather than zero, because zero is a price and
a script comparing against it would take a branch that looks correct. `pos.size`
is `0` while flat rather than absent, because zero is the true size and a script
adding it to something should get the right answer.

`pos.openProfit` is marked to this bar's close. A strategy that marks to
something else, such as a bid or an ask, is not expressible in version 1 and the
entry says so rather than leaving the reader to assume.

### 17.5 Where orders land in the chart contract

Nothing in this section corresponds to a field of the descriptor a study becomes.
Orders go to the host's order interface, on paper by default. What reaches the
chart is their consequence: each fill becomes one marker, and a strategy that
wants its stop or target drawn plots them or draws them like any other value.
That separation is deliberate. The chart shows what happened; the broker decides
what happens.

**Count: 35 entries, of which 5 are planned.**

---

## 18. The chart contract map

Every call that creates something the host draws, and the descriptor field it
lands in. The field names are the contract's own.

| Call | Contract field |
|---|---|
| `study(overlay = ...)`, `strategy(overlay = ...)` | the descriptor's placement: the price pane or its own pane |
| `study(title = ...)`, `group` | the descriptor's name and its category in a picker |
| `study(range = [min, max])` | the fixed pane range |
| `study(precision = ...)`, `format` | the plot style's precision and the price scale's format |
| `input(...)` | one entry of the declared inputs, with its kind, label, group and tooltip |
| `plot(...)` | one plotted column, plus the computed values it reads |
| `plot(..., color = a series)` | that column's per-bar colour callback |
| `plot(..., offset = ...)` | that column's draw offset |
| `plot(..., scale = ...)` | that column's price scale |
| `plotCandles(...)` | one plotted column naming four source columns, plus the split colour callback for wick and border |
| `fill(...)` | one shaded band between two named columns |
| `level(...)` | one entry of the recomputed horizontal levels |
| `signal(...)` | one entry of the bar-anchored markers |
| `barColor(...)` | the price bar colours, one entry per bar |
| `background(...)` | the pane background, one entry per bar |
| `table(...)`, `cell(...)` | the summary grid, its rows and its options |
| `draw.line`, `draw.label`, `draw.box`, `draw.polyline` | the free drawings, one entry per live object |
| `alert(...)` | one watched condition, with its id, title, message and predicate |
| `req.timeframe(...)` | folding of the chart's own bars, inside the calculation |
| `req.symbol(...)` | the request for another instrument's bars, the attach lifecycle that holds the answer, and the data status the host shows |
| `bar.isNew`, `bar.isConfirmed`, `bar.isRealtime`, `bar.updates` | the calculation context's bar state |
| `chart.timezone`, `chart.now()`, `chart.tickSize`, `chart.symbol`, `chart.interval` | the calculation context's chart facts |
| every calculation in sections 4 to 11 | the computed values, one column per plot, aligned to the bars, absent where the warmup says |
| every order function in section 17 | no contract field; the host's order interface |

An absent value reaching any of these is a gap, never a zero: a line breaks, a
band stops, a level is not drawn, a bar keeps its own colour, a cell is blank.

---

## 19. What is deliberately not here

- **Arrays.** `size`, `push`, `pop`, `slice`, `sort` and the rest are specified
  in `language.md` section 14.1, because an array is part of the language rather
  than a library of market functions. They are not repeated here.
- **Operators and conversions.** `text`, `number` and `bool` appear here because
  a script calls them, but the conversion rules behind them are in `language.md`
  section 5.3 and are not restated.
- **Maps and matrices.** Reserved and unimplemented, `language.md` section 14.2.
  Nothing in this document depends on them.
- **Per-function formulas.** Each entry states the arguments, the result, the
  warmup and the purpose. The exact arithmetic, the seeding and the worked
  example live in the library manifest, which the compiler, the editor's
  autocomplete and the generated reference all read, so there is one source and
  it cannot drift from the implementation.
- **An alphabetical index.** It is generated from the same manifest rather than
  maintained by hand here, for the same reason.
