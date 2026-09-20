# Maths functions

By the end of this page you will be able to do arithmetic, rounding and
statistics in a script and know exactly what each function does at its edges:
where it returns the absent value, where it raises, and where it disagrees with
the operator that looks like it.

## The four rules behind every entry

Read these once and most of the edge cases below stop being surprises.

| Rule | Consequence |
|---|---|
| There is no integer type | A length, a bar count and a price are all `number`, so no conversion exists to get wrong |
| A `number` is always finite | An operation whose real result does not exist or is not finite gives `none`, never infinity and never a not-a-number value |
| Absence propagates through arithmetic | `none + 1` is `none`, and `none * 0` is `none`, not `0` |
| A wrong argument raises, a missing answer does not | `sqrt(-1)` is `none`; a negative length is an error |

The third rule is worth a sentence of why. `none * 0` could defensibly be zero,
since zero times anything is zero, but the operand was not zero: it was unknown,
and an unknown quantity is only zero if it was a number at all. Propagating
uniformly leaves one rule to remember instead of a table of exceptions, and it
means an absent value travels visibly to the plot, where it draws a gap, rather
than being absorbed into a number that looks right.

The fourth rule draws the line between the two kinds of failure. A single bad
bar must not kill a study that is correct over fifty thousand bars, so
`log(0)`, `sqrt(-1)` and a division by zero all return `none` and the script can
test for it. An argument that could never be right, such as a length of `-5` or
a colour channel of `300`, is a defect in the script, so it stops: at compile
time when the value is a literal, at run time when it is not.

None of the functions on this page has a warmup. They read the current bar's
values only, so each one produces a value on bar 0 whenever its arguments do.

---

## 1. Bare functions

These live in the global scope, with no prefix, because a script reaches for
them on most days.

### `abs(x)`

Magnitude without sign.
Parameters: `x` `number` required.
Returns `number`.

```
plot(abs(close - open), "Body size", aqua)
```

### `sign(x)`

`-1`, `0` or `1`.
Parameters: `x` `number` required.
Returns `number`.

```
plot(sign(close - close[1]), "Direction", silver, style = "histogram")
```

### `min(a, b)`

The smaller of two values.
Parameters: `a` `number` required; `b` `number` required.
Returns `number`.

```
floorPrice = min(low, low[1])
```

### `max(a, b)`

The larger of two values.
Parameters: `a` `number` required; `b` `number` required.
Returns `number`.

```
stop = max(stop, lowest(low, 3))
```

`min` and `max` also have an array form, `min(arr)` and `max(arr)`, which is
documented in [collections.md](./collections.md). The checker picks the
signature by arity at compile time; there is no run-time dispatch. Two shapes of
one name exist because `min(a, b)` and `min(arr)` are the same idea, and two
names for one idea is worse than one name with two shapes.

### `clamp(x, lo, hi)`

`x` held inside a range.
Parameters: `x` `number` required; `lo` `number` required; `hi` `number`
required.
Returns `number`.

```
width = clamp(atr(14) * 2, chart.tickSize, close * 0.1)
```

### `floor(x)`

Toward negative infinity.
Parameters: `x` `number` required.
Returns `number`.

```
halfBack = floor(len / 2)
```

### `ceil(x)`

Toward positive infinity.
Parameters: `x` `number` required.
Returns `number`.

```
slices = ceil(size(levels) / 4)
```

### `round(x)`

To the nearest whole number, halves away from zero.
Parameters: `x` `number` required.
Returns `number`.

```
lots = round(qty / chart.lotSize)
```

### `round(x, decimals)`

To a fixed number of decimals, halves away from zero.
Parameters: `x` `number` required; `decimals` `number` required.
Returns `number`.

```
shown = round(rsi(close, 14), 1)
```

Halves go away from zero rather than to even because a price rounded for display
should agree with what a trader would write down, and round-half-to-even
surprises people at exactly the values that matter. The rule is fixed in the
specification so that two engines cannot differ by one tick.

### `trunc(x)`

Toward zero.
Parameters: `x` `number` required.
Returns `number`.

```
wholeLots = trunc(cash / (close * chart.lotSize))
```

### `roundToStep(x, step)`

To the nearest multiple of `step`.
Parameters: `x` `number` required; `step` `number` required.
Returns `number`.

```
band = roundToStep(close, 50)
```

### `roundToTick(price)`

To the instrument's smallest price increment.
Parameters: `price` `number` required.
Returns `number`, or `none` when `chart.tickSize` is absent.

```
limitPrice = roundToTick(close - atr(14))
```

The absent result matters. When the host has not said what the tick size is,
returning the unrounded price would produce an order price that looks rounded
and is not, and the order would be rejected later by something with a worse
error message. An absent price reaching an order function is refused by name
(OS7002), which is where you want to find out.

### `sqrt(x)`

Square root.
Parameters: `x` `number` required.
Returns `number`, or `none` below zero.

```
dev = sqrt(max(meanSquare - mean * mean, 0))
```

The `max(..., 0)` in that line is the standard defence: a second moment about
the mean can come out very slightly negative on a long run of near identical
prices, which is floating point and not data, and without the floor `sqrt` would
put a one bar hole in the plot.

### `pow(x, y)`

`x` to the power `y`.
Parameters: `x` `number` required; `y` `number` required.
Returns `number`, or `none` where the result is not a finite real.

```
compounded = pow(1 + r, periods)
```

There is no `^` operator. It reads as exclusive or to half the people who will
read a script and as power to the other half, and `-2 ^ 2` has two defensible
answers, so the language spells it as a function.

### `exp(x)`

`e` to the power `x`.
Parameters: `x` `number` required.
Returns `number`.

```
projected = exp(log(close) + slope)
```

### `log(x)`

Natural logarithm.
Parameters: `x` `number` required.
Returns `number`, or `none` at or below zero.

```
ret = log(close) - log(close[1])
```

### `log10(x)`

Base ten logarithm, with the same absence rule as `log`.
Parameters: `x` `number` required.
Returns `number`, or `none` at or below zero.

```
decades = log10(volume)
```

### `mod(a, b)`

Remainder that always carries `b`'s sign.
Parameters: `a` `number` required; `b` `number` required.
Returns `number`.

```
minuteOfHour = mod(date.minute(time), 60)
```

`mod` and the `%` operator are different on purpose. `%` is the remainder of
truncated division, so its sign follows the left operand: `-7 % 3` is `-1`.
`mod(-7, 3)` is `2`. Both exist because both are wanted about equally often, and
picking one would leave half of all uses writing the correction by hand.

| Expression | Value |
|---|---|
| `7 % 3` | `1` |
| `-7 % 3` | `-1` |
| `mod(7, 3)` | `1` |
| `mod(-7, 3)` | `2` |

### `isNone(x)`

True when the value is absent.
Parameters: `x` any type.
Returns `bool`.

```
if isNone(rsi(close, 14))
    background(fade(gray, 90))
```

`isNone(x)` and `x == none` mean the same thing. Equality is the one operator
that never returns `none`, which is what makes either form usable directly in an
`if`.

### `orElse(x, fallback)`

`x` when present, `fallback` when absent.
Parameters: `x` any type; `fallback` the same type as `x`.
Returns the same type as `x`.

```
safe = orElse(rsi(close, 14), 50)
```

This is the one line that buys back the behaviour of a language where absence is
zero, and it is explicit, on the line where it happens, rather than being a rule
you have to remember about every line.

### `toBool(x)`

`none` to `false`, a bool to itself.
Parameters: `x` `bool` or `none`.
Returns `bool`.

```
flag = toBool(crossUp(fast, slow)[1])
```

It is spelled `toBool` and not `bool` because `bool` is a reserved word, so a
call could never begin with it. Writing `bool(x)` is OS1019, and the fix names
this spelling.

Numbers are rejected. There is no truthiness in the language: `0` is not false
and `""` is not false, because every silent coercion rule in every language is a
source of bugs that survive review, and a trading script that quietly treats a
zero as a false has a bug nobody finds until it costs money.

---

## 2. The `math` namespace

The long tail: constants, the trigonometric functions and the logarithms a
charting script reaches for rarely. They are namespaced so that the bare global
scope stays small enough to memorise.

### Constants

| Call | Returns | Means |
|---|---|---|
| `math.pi` | `number` | The circle constant |
| `math.e` | `number` | The base of the natural logarithm |

```
plot(math.sin(bar.index / math.pi), "Wave", aqua)
```

### `math.log2(x)`

Base two logarithm.
Parameters: `x` `number` required.
Returns `number`.

```
bits = math.log2(size(levels))
```

### `math.hypot(x, y)`

`sqrt(x * x + y * y)` computed without intermediate overflow.
Parameters: `x` `number` required; `y` `number` required.
Returns `number`.

```
distance = math.hypot(close - close[10], 10)
```

### `math.toDegrees(x)`

Radians to degrees.
Parameters: `x` `number` required.
Returns `number`.

```
angleDegrees = math.toDegrees(math.atan(slope))
```

### `math.toRadians(x)`

Degrees to radians.
Parameters: `x` `number` required.
Returns `number`.

```
phase = math.toRadians(bar.index % 360)
```

### `math.sin(x)`, `math.cos(x)`, `math.tan(x)`

Sine, cosine and tangent of an angle in radians.
Parameters: `x` `number` required.
Returns `number`.

```
cycle = math.sin(math.toRadians(bar.index * 4))
```

### `math.asin(x)`, `math.acos(x)`

Inverse sine and inverse cosine.
Parameters: `x` `number` required.
Returns `number`, or `none` outside -1 to 1.

```
angle = math.asin(clamp(ratio, -1, 1))
```

The `clamp` is worth keeping even when the ratio should be in range by
construction, because a rounding error of one part in ten to the sixteenth
puts it outside and turns the whole plot absent for that bar.

### `math.atan(x)`

Inverse tangent.
Parameters: `x` `number` required.
Returns `number`.

```
slopeAngle = math.atan(linreg(close, 20) - linreg(close, 20)[1])
```

### `math.atan2(y, x)`

The angle of a vector, correct in all four quadrants.
Parameters: `y` `number` required; `x` `number` required.
Returns `number`.

```
heading = math.atan2(close - close[20], 20)
```

### `math.sinh(x)`, `math.cosh(x)`, `math.tanh(x)` (planned)

Hyperbolic sine, cosine and tangent.
Parameters: `x` `number` required.
Returns `number`.

```
squashed = math.tanh(zscore)
```

### There is no random number function

Not in this namespace and not anywhere else. A script that could produce a
different answer on a second run could not be part of a conformance suite, and a
backtest whose numbers move between runs cannot be compared with another
backtest, which is the entire reason for running one. The same rule is why there
is no reading of the wall clock during a bar except the explicitly named
`chart.now()`, whose value the host supplies.

---

## 3. Numeric edge cases in one table

| Expression | Result | Why |
|---|---|---|
| `1 / 0` | `none` | Infinity cannot be plotted, compared usefully, or averaged |
| `0 / 0` | `none` | The same rule, with no special case |
| `none + 1` | `none` | Absence propagates through arithmetic |
| `none * 0` | `none` | The operand was unknown, not zero |
| `none > 5` | `none` | Absence propagates through ordering comparisons |
| `none == none` | `true` | Equality is total, so the question can be asked |
| `sqrt(-1)` | `none` | No finite real result |
| `log(0)` | `none` | The same |
| `pow(10, 400)` | `none` | Overflow is not a finite number |
| `round(2.5)` | `3` | Halves away from zero |
| `round(-2.5)` | `-3` | The same rule on the other side |
| `-7 % 3` | `-1` | Truncated division, sign of the left operand |
| `mod(-7, 3)` | `2` | Always carries the right operand's sign |
| `roundToTick(p)` with no tick size | `none` | Better than a price that looks rounded and is not |
| `sma(close, -5)` | error OS3004 | A wrong argument raises rather than returning absence |

The line between rows that give `none` and the row that raises is the line
between "the answer does not exist" and "the question was malformed". A study
should survive the first and stop on the second.

---

## 4. Three worked examples

### A z-score, with the divide by zero handled

```
version 1
study("Z score", precision = 2, range = [-4, 4])

len = input(50, "Length", min = 2, max = 500)
src = input(close, "Source")

mean = sma(src, len)
dev  = stdev(src, len)

// dev is zero on a perfectly flat window, so the division is absent there
// rather than infinite, and the plot simply breaks for those bars.
z = (src - mean) / dev

plot(z, "Z", aqua)
level(0, "Zero", gray)
level(2, "Two", red)
level(-2, "Minus two", lime)
```

### Sizing a stop in ticks, safely

```
version 1
study("Stop distance", overlay = true)

ticks = input(20, "Stop, in ticks", min = 1, max = 1000)

// chart.tickSize is absent when the host has not supplied one, so the whole
// calculation is absent and nothing is drawn. That is the honest output: a
// distance in ticks means nothing until the tick is known.
distance = chart.tickSize * ticks
stopLong = roundToTick(close - distance)

plot(stopLong, "Stop", red, style = "step")

if isNone(chart.tickSize)
    background(fade(red, 92))
```

### Rounding for display against rounding for arithmetic

```
version 1
study("Two kinds of rounding")

r = rsi(close, 14)

// round changes the number, so anything built on it is built on the rounded
// value. text with decimals changes only the characters shown.
plot(round(r, 1), "Rounded value", aqua)

if bar.isLast
    print("RSI " + text(r, 1) + " raw " + text(r))
```

Round when the rounded number is the thing you mean, such as a quantity in whole
lots or a price on an order. Format with `text(x, decimals)` when only the
display changes, which keeps the full precision in the calculation and avoids a
rounding error that compounds bar after bar.

## See also

- [series.md](./series.md) for statistics across bars: `median`, `percentile`, `correlation`
- [collections.md](./collections.md) for `sum`, `avg`, `min`, `max` and `stdev` over a whole array
- [ta.md](./ta.md) for `stdev` and `variance` over a rolling window
- [string.md](./string.md) for `text(x, decimals)` and turning a string back into a number
- [strategy.md](./strategy.md) for the sizing helpers that round down by default
- [../../../spec/stdlib.md](../../../spec/stdlib.md) for the specification these entries are derived from
