# The absent value

By the end of this page you will be able to predict every bar on which your
script holds the absent value, follow it through arithmetic, comparison and
boolean logic without guessing, test for it and replace it deliberately, and
recognise the specific mistakes it causes before they put a wrong number on a
chart.

In a per-bar language, the absent value is the single largest source of silent
wrong numbers. Silent is the operative word: the bars where it bites are the
first bars of the dataset, which sit off the left edge of the screen, so a study
can be wrong for a month before anyone scrolls back far enough to see it.

## Why the language has one

A per-bar language has to have an answer for "there is no value here". The
situations are ordinary, not exotic:

- The first thirteen bars of a fourteen bar average.
- `close[1]` on the first bar of the dataset.
- A division whose denominator happened to be zero on one bar.
- A higher timeframe bar that has not closed yet.
- A second instrument that has no bar at this moment.

Three designs were available: return a plausible number such as zero, raise an
error and stop, or have a value that means "nothing here" and specify exactly
what it does. OpenScript takes the third. The first produces charts that look
right and are not, and the second kills a study that is otherwise correct over
fifty thousand bars because one bar had no volume.

The value is written `none`. Its type is `none`, and that type is a member of
every other type: a `series number` may hold `none` on any bar, and so may a
`string` or a `color`.

## Where it comes from

| Source | Example | Absent on |
|---|---|---|
| Warmup | `sma(close, 20)` | Bars 0 to 18 |
| Warmup that consumes changes | `rsi(close, 14)` | Bars 0 to 13, one more than you expect, because a change needs two bars |
| History past the start | `close[1]` | Bar 0. `close[100]` on bar 7 |
| Division by zero | `up / down` | Any bar where `down` is zero, including `0 / 0` |
| No finite real answer | `sqrt(-1)`, `log(0)`, an overflow | Whenever the argument says so |
| A window containing an absent bar | `sma(src, 20)` where `src` had a gap | Every bar whose window touches the gap |
| Data the host does not supply | `volume` on an instrument with none | Every bar. Test `chart.hasVolume` |
| An instrument fact the host has not stated | `chart.tickSize`, `chart.lotSize` | The whole run |
| A higher timeframe read before its first bar closes | `req.timeframe("1D", high)` | Until the first daily bar has closed |
| Another instrument, before the host answers | `req.symbol(...)` | Until the bars arrive. Test with `req.isReady` |
| A condition that has never held | `barsSince(cond)`, `valueWhen(cond, src)` | Every bar before the first true one |
| A position fact while flat | `pos.avgPrice`, `pos.openProfit` | Every bar with no position |
| A string that does not parse | `toNumber("12.5%")` | That call |
| A stateful call in a branch that did not run | `ema` inside an `if` | Every bar the branch was skipped |
| Your own ternary | `ready ? value : none` | Whatever you said |

That last row matters as much as the rest. Writing `none` deliberately is how a
script says "draw nothing here", and it is the supported way to hide a plot on
some bars.

## Rule 1: arithmetic propagates absence

**If any operand of an arithmetic operator is absent, the result is absent.**

```
none + 1        // none
none * 0        // none, not 0
none - none     // none
-none           // none
(none + 1) * 2  // none
"a" + none      // none
```

`none * 0` is absent rather than zero even though zero times anything is zero,
because the operand was not zero. It was unknown, and an unknown quantity
multiplied by zero is only zero if the unknown was a number at all. One rule that
always holds is easier to carry in your head than a table of special cases, and
it has a practical payoff: an absent value travels visibly all the way to the
plot, where it draws a gap, instead of being absorbed into a number that looks
plausible.

String concatenation follows the same rule. `text(none)` is the string `"none"`,
so converting is safe, but `"a" + none` is absent, so a message built out of one
absent part is an absent message rather than a partial one. Convert
deliberately, or guard the whole string.

Arithmetic with no answer produces absence for the same reason: division by zero
including `0 / 0`, `sqrt` below zero, `log` at or below zero, and anything that
would overflow to infinity. Infinity is not a value in this language. It cannot
be plotted, it cannot be compared usefully, and it poisons every average it
enters, so it does not exist.

```
version 1

study("Ratio with a zero denominator", precision = 4)

up   = sum(close > open ? volume : 0, 20)
down = sum(close < open ? volume : 0, 20)

// On a window with no down bars, down is zero and the ratio is absent, so the
// line breaks rather than spiking to a number the chart cannot scale.
ratio = up / down

plot(ratio, "Up over down", aqua, width = 2)
```

## Rule 2: ordered comparison propagates absence

**If either operand of `<`, `<=`, `>` or `>=` is absent, the result is absent,
not false.**

```
none < 5        // none
5 > none        // none
none <= none    // none
```

This is the decision that most repays understanding. Returning `false` would be
convenient and is a trap: it makes `a > b` and `a <= b` both false at the same
time, so a script that branches on one and assumes the other is its complement
takes the wrong path during warmup and nobody notices. Propagating absence keeps
the identity intact: `not (a > b)` equals `a <= b` for every input, including
absent ones, because both are absent together.

The practical consequence is that **a false branch is not proof of the
opposite.** When an `if` does not fire, the condition was false or it was absent,
and those are different facts. If your script needs to tell them apart, ask.

A comparison written directly against `none` is always absent, so its branch is
dead. The compiler says so with warning OS8012 and names the operator.

## Rule 3: equality does not propagate

**`==` and `!=` are total. They always return `true` or `false`, never absent.**

```
none == none    // true
none == 5       // false
5 != none       // true
```

Equality is the deliberate exception, because a comparison that can itself be
absent would leave the script with no way to ask the question at all. `x == none`
and `isNone(x)` mean exactly the same thing, and both can be used directly in an
`if`.

The flip side is that equality is total for ordinary values too, which produces
one specific bug worth naming here: on bar 0, `x[1]` is absent, so `x != x[1]` is
`true`, and a script that marks a change of state will mark one on the very first
bar of every chart. Guard it with `bar.isFirst`.

## Rule 4: boolean operators use three-valued logic

`and`, `or` and `not` treat the absent value as "unknown".

| `a` | `b` | `a and b` | `a or b` |
|---|---|---|---|
| `true` | `true` | `true` | `true` |
| `true` | `false` | `false` | `true` |
| `true` | `none` | `none` | `true` |
| `false` | any | `false` | `b` |
| `none` | `true` | `none` | `true` |
| `none` | `false` | `false` | `none` |
| `none` | `none` | `none` | `none` |

`not none` is `none`.

One sentence generates every row: **absence is absorbed exactly when the other
operand decides the answer on its own.** Under `and` that is a `false`, under
`or` it is a `true`. Everywhere else the unknown operand leaves the result
unknown, because the answer really does depend on a value nobody has.

**Both operators are commutative.** `a or b` is `b or a` and `a and b` is
`b and a`, for every pair in the table, absent operands included, so operand
order never changes the answer. Each of these pairs is one value on every bar:

```
if isNone(x) or x > 5           // "absent or above five"
if x > 5 or isNone(x)           // the same answer, on every bar

if not isNone(x) and x > 5      // "present and above five"
if x > 5 and not isNone(x)      // the same answer, on every bar
```

That matters more than it looks. The two lines of each pair read as the same
English sentence, and a guard that worked or failed depending on a word order
the reader cannot hear is the kind of bug nobody finds by re-reading the source.
It also means De Morgan's laws hold with absent operands: `not (a and b)` is
`not a or not b` for every combination of `true`, `false` and `none`.

What operand order still decides is which operand runs. The right operand of
`or` is skipped only when the left one is `true`, and the right operand of `and`
only when the left one is `false`. An absent left operand skips nothing, because
the right operand can still settle the answer on its own. So order is worth a
thought for two reasons, neither of them correctness: a stateful call on the
right does not advance on the bars where it is skipped (mistake 6 below), and a
cheap test on the left saves the work of an expensive one.

## Rule 5: an absent condition takes the false branch

**A condition that evaluates to absent takes the false branch.** This applies to
`if`, to `else if`, to `while`, to the ternary, and to a `case` arm of the
condition form of `switch`.

```
if rsi(close, 14) > 70          // during warmup this is absent, so it is skipped
    signal("OVERBOUGHT")
```

This is the one place absence is absorbed rather than propagated, and it is
unavoidable: execution has to go somewhere. It is safe here in a way that
returning `false` from a comparison is not, because the absorbing happens at the
branch, where a reader can see it, rather than inside an expression three lines
earlier.

The compiler helps with the one shape where this quietly changes an answer. If an
`if` whose condition can be absent assigns to a name that is read after the
block, that is warning OS8004, and the fix is to decide what warmup means: give
the name a starting value above the `if`, or test `isNone` explicitly.

**Not raised yet.** OS8004 is in the catalogue and nothing raises it: the
checker does not follow which names a branch on a possibly absent condition
assigns.

## Testing for absence

| Call | Returns | Use it for |
|---|---|---|
| `isNone(x)` | `bool`, never absent | The direct question |
| `x == none` | `bool`, never absent | The same question, for readers who prefer it |
| `not isNone(x)` | `bool`, never absent | The left half of a guard |
| `chart.hasVolume` | `bool` | Whether volume is absent because the instrument has none |
| `req.isReady(read)` | `series bool` | Whether another instrument's bars have arrived yet |

`isNone` and `== none` are interchangeable. Both are total, both are usable
directly in a condition, and neither can surprise you.

```
version 1

study("Warmup made visible", precision = 2)

r = rsi(close, 14)

level(70, "Overbought", fade(red, 50))
level(30, "Oversold", fade(lime, 50))
plot(r, "RSI", purple, width = 2)

// Shading the warmup rather than leaving it blank. A reader who can see where
// the study starts does not have to count bars to find out.
background(isNone(r) ? fade(gray, 90) : none)
```

## Replacing absence

`orElse(x, fallback)` gives `x` when it is present and `fallback` when it is not.
It is the right tool in exactly one situation: when the fallback is a genuine
answer rather than an invented one.

```
r    = rsi(close, 14)
safe = orElse(r, 50)        // 50 is the neutral reading, not a made up number
```

It is the wrong tool when the fallback is a price, a quantity or anything a
comparison will later treat as data. `orElse(stop, 0)` turns "we have no stop" into
"our stop is zero", and every `close > stop` after that line is true.

Three library functions ignore absence deliberately, and they say so in their
names, which is the whole convention: `sumSkip`, `avgSkip` and `countPresent`.
Everything else that reads a window propagates, so if any bar in the window is
absent, that bar's result is absent.

```
sma(close, 20)          // absent until 20 bars exist, and absent after any gap
avgSkip(values, 20)     // ignores absent bars and averages the rest
countPresent(values, 20)// how many of the 20 had a value at all
```

The honest order of preference:

1. Let it propagate. A gap in a line is the truth and costs nothing.
2. Guard it with `isNone` and take a different path.
3. Replace it with `orElse` where the fallback is a real answer.
4. Use a `Skip` function where the window is genuinely sparse.

## Absence where it leaves the script

**On a drawing surface, absence is a gap, never a zero.** A plot breaks its line,
a fill stops, a bar colour leaves the bar its own colour, a pane background
leaves the bar unshaded, a table cell is blank, and a level is not drawn. This is
why hiding a plot on some bars is done by plotting `none`:

```
plot(trending ? ema20 : none, "EMA while trending", aqua)   // correct
if trending
    plot(ema20, "EMA while trending", aqua)                 // OS3006
```

**On an order, absence is refused loudly.** An order function given an absent
price or an absent quantity does not place a malformed order and does not
substitute a value. It stops with OS7002, naming the argument that was absent. An
order is the one place in the language where doing nothing quietly is worse than
stopping visibly.

## The mistakes, and the fix for each

### 1. Treating a skipped branch as proof of the opposite

```
// The bug. During warmup both comparisons are absent, neither branch runs, and
// zone keeps whatever it held on the previous bar.
if r > 70
    zone = "high"
else if r < 30
    zone = "low"
```

The fix is to give the name a value before the branch, so that "we do not know
yet" has a name of its own:

```
zone = "unknown"
if not isNone(r)
    zone = r > 70 ? "high" : (r < 30 ? "low" : "mid")
```

This is the shape the compiler warns about as OS8004.

**Not raised yet.** OS8004 is in the catalogue and nothing raises it: the
checker does not follow which names a branch on a possibly absent condition
assigns.

### 2. A self-referencing series that is absent for ever

```
seen = seen[1] + 1      // absent on bar 0, and absent on every bar after it
```

On bar 0 there is no previous bar, `seen[1]` is absent, the addition propagates,
and the series is absent from then on because every later bar reads an absent
predecessor. One absent bar at the start poisons the whole run.

The fix is `var`, which is what it exists for:

```
var seen = 0
seen = seen + 1         // 1, 2, 3, ...
```

Where the recurrence genuinely needs its own previous value, seed it with
`orElse`:

```
version 1

study("Trailing stop", overlay = true, precision = 2)

mult = input(3.0, "Band width, in ATR", min = 0.5, max = 20)

raw = low - mult * atr(14)

var trail = none

// A var still holds the previous bar's value at this point in the file, so
// prev is the band as it stood one bar ago without a [] read.
prev = trail

// orElse is doing real work: on the first bar with an ATR the previous band is
// absent, the comparison is absent, the false branch is taken, and the band
// seeds from the raw value instead of staying absent for ever.
trail = close[1] > orElse(prev, raw) ? max(raw, orElse(prev, raw)) : raw

plot(trail, "Trailing stop", lime, width = 2)
```

### 3. Guarding with the wrong operator

```
if isNone(x) and x > 5          // never true, whether x is present or absent
if not isNone(x) or x > 5       // true on every bar, so it guards nothing
```

The two that work are `not isNone(x) and x > 5`, "present and above five", and
`isNone(x) or x > 5`, "absent or above five". Operand order is not what breaks
the two above: both operators are commutative, so writing either of them the
other way round gives the same wrong answer. It is the operator that has to
match the sentence you meant.

### 4. Replacing a price with zero

```
stop = orElse(rawStop, 0)
if close > stop                 // true on every bar where the stop was absent
```

Zero is a price. Use absence and a guard:

```
if not isNone(rawStop) and close > rawStop
```

### 5. Expecting `none * 0` to be zero

A weight of zero does not neutralise an absent factor. If you are building a
weighted sum where some terms should drop out, drop them out explicitly:

```
contribution = isNone(value) ? 0 : value * weight
```

### 6. A stateful call inside a branch

```
if trending
    e = ema(close, 20)          // advances only on trending bars, absent on the rest
```

A call site that does not execute on a bar leaves its series absent for that bar
and its state untouched. The average is then computed from a subset of the bars
and is not the average anyone meant. This is warning OS8001. Compute it
unconditionally and use the result inside the branch:

```
e = ema(close, 20)
plot(trending ? e : none, "EMA while trending", aqua)
```

### 7. Marking a state change on bar 0

```
if dir != dir[1]                // true on bar 0, because dir[1] is absent
    signal("FLIP")
```

Equality is total, so an absent operand does not make the test absent. It makes
it true. Guard it:

```
if not bar.isFirst and dir != dir[1]
    signal("FLIP")
```

### 8. Reading a counter as zero before it has ever counted

`barsSince(cond)` and `valueWhen(cond, src)` are absent, not zero, before the
condition has ever been true. Zero would read as "it happened on this bar", which
is the opposite of the truth.

```
since = barsSince(crossUp(fast, slow))
fresh = not isNone(since) and since <= 3
```

### 9. Building a message out of an absent part

```
if decay >= target
    alert("decayed " + text(decay, 1) + " percent")
```

That one is fine, because `text()` turns an absent number into the string
`"none"` rather than propagating, and the guard is a comparison that is absent
during warmup, so the branch is skipped. This is the version that is not fine:

```
message = "entry at " + text(entryPrice, 2) + ", stop " + stopText
```

If `stopText` is itself absent, the whole message is absent, and an absent
message is not a partial message. Guard the string as a whole, or convert each
fragile part with `text()`.

### 10. Confusing "no volume" with "zero volume"

`volume` is absent, not zero, on an instrument the host has no volume for. Zero is
a real reading that means nobody traded. Conflating them makes a volume study
draw a confident flat line. Test the fact, not the value:

```
version 1

study("Relative volume", precision = 2)

len = input(20, "Average length", min = 2, max = 500)

// chart.hasVolume answers the question "does this instrument report volume at
// all", which is not the same question as "was this bar's volume zero".
ratio = chart.hasVolume ? volume / sma(volume, len) : none

level(1, "Average", gray)
plot(ratio, "Volume against average", aqua, width = 2, style = "histogram")
```

### 11. Sending an absent quantity to an order

`order.qtyForRisk(risk, entry, stop)` returns absence when `entry` and `stop` are
equal, which is a real state during warmup. The order function then refuses with
OS7002 and places nothing. That is the designed behaviour, not a failure, but a
strategy that never checks will look like it is not trading. Guard the entry:

```
qty = order.qtyForRisk(riskPerTrade, close, stopPrice)
if not isNone(qty) and crossUp(fast, slow)
    buy(qty = qty)
```

### 12. Hiding a gap instead of reading it

```
plot(orElse(value, 0), "Value", aqua)
```

The line now runs along zero during warmup and dives to zero on every absent bar,
which looks like data and is not. Plot the value itself and let the gap show.

## A short discipline that prevents most of this

- Assume every library value is absent until its warmup is over, and look up the
  warmup rather than guessing it.
- Write a guard as `not isNone(x) and ...` or `isNone(x) or ...`, and check the
  operator rather than the operand order: both operators are commutative, so the
  side a test sits on never changes the answer.
- Give a name a starting value above any `if` that assigns to it.
- Never fall back to zero for a price, a quantity or a level. Fall back only to a
  value that is genuinely the answer.
- Treat every compiler warning in the OS8xxx range as a real finding. Several of
  them exist for exactly the bugs on this page.
- When a plot has a hole, read the hole. It is telling you which bars had no
  value, which is usually faster than reasoning about it.

## See also

- [types-and-values.md](./types-and-values.md) for why absence is a member of every type
- [operators.md](./operators.md) for the precedence and short-circuit rules the guards on this page rely on
- [variables-and-scope.md](./variables-and-scope.md) for `var`, which is the fix for a self-referencing series
- [control-flow.md](./control-flow.md) for what an absent condition does to each control form
- [warmup.md](./warmup.md) for how many bars each study needs before it can draw
- [../README.md](../README.md) for the documentation index
- [../../spec/language.md](../../spec/language.md) section 6 for the specification of the absent value
- [../../examples/](../../examples/) for twelve working scripts, several built around this rule
