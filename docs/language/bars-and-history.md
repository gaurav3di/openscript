# Bars and history

By the end of this page you will be able to read any past value a script is
allowed to read, know exactly what you get at the start of history, know which
expressions may be looked back through and which may not, and know what a deep
lookback costs before you write one.

## Contents

1. [The history operator](#1-the-history-operator)
2. [What has history, and what does not](#2-what-has-history-and-what-does-not)
3. [At bar 0 there is nothing behind you](#3-at-bar-0-there-is-nothing-behind-you)
4. [Offsets that are not whole, not positive, or not there](#4-offsets-that-are-not-whole-not-positive-or-not-there)
5. [Reading the history of an expression](#5-reading-the-history-of-an-expression)
6. [History through a function parameter](#6-history-through-a-function-parameter)
7. [Series or array: which `[]` is this](#7-series-or-array-which--is-this)
8. [Library functions that read history for you](#8-library-functions-that-read-history-for-you)
9. [What a deep lookback costs](#9-what-a-deep-lookback-costs)
10. [Three mistakes with history](#10-three-mistakes-with-history)

---

## 1. The history operator

A **series** is the per-bar history of a value: one number, one boolean or one
string per bar. Reading a series bare gives the value on the bar being executed.
The history operator `[n]` gives the value `n` bars back from the bar being
executed.

```
close           // this bar's close
close[1]        // the previous bar's close
close[0]        // identical to close
close[20]       // the close twenty bars ago
```

The offset is counted backwards from the current bar, never forwards, and never
from the start of the dataset. On bar 500, `close[3]` is bar 497's close. On bar
501 the same expression is bar 498's close. The window slides with the bar loop.

Three lines that use it, and what each is for:

```
version 1

study("Three reads", overlay = true, precision = 2)

// The overnight gap: this bar's open against the previous bar's close.
gap = open - close[1]

// The change over one bar, which the library also spells change(close).
diff = close - close[1]

// Whether the previous bar's range sits inside the one before it.
inside = high[1] < high[2] and low[1] > low[2]

plot(gap,  "Gap", aqua)
plot(diff, "Change", orange)

if inside
    signal("INSIDE", at = "above")
```

Note the `signal` condition. The script is asking about bars 1 and 2 back
because an inside bar is only knowable after the bar that sits inside has
finished. Reading `high[1]` and `high[2]` on the current bar is the honest way
to write that; reading `high` and `high[1]` would ask a question about a bar
that may still be moving, which is the subject of
[realtime-and-confirmation.md](./realtime-and-confirmation.md).

---

## 2. What has history, and what does not

A value accepts `[]` in exactly four cases:

| Case | Example | Why it has history |
|---|---|---|
| A built-in series | `close[1]`, `volume[3]`, `time[5]` | The engine fills one value per bar from the host's data |
| A name assigned at the top level of the file | `diff = close - open`, then `diff[1]` | The compiler gives it a series register |
| A call to a function declared to return a series | `ema(close, 20)[1]` | Its per-bar values are retained |
| A series parameter of a user function | `fn f(src) => src - src[1]` | The caller's expression is retained for that call site |

Everything else is error OS2004, and the fix the compiler names is always the
same: assign it to a name at the top level of the file first.

```
diff = close - open         // top level: diff[1] is legal
if trending
    inner = close - open    // inside a block: inner[1] is OS2004
```

The restriction is not arbitrary. Retaining history costs memory for every bar
of the dataset, and a language that retained it for every temporary inside every
loop body would not run fifty thousand bars in a browser tab. Naming a value at
the top level is how a script says "keep this one", and it costs one line.

```
// Not allowed: the expression is a temporary.
if (close - open)[1] > 0        // OS2004

// Allowed: it has a name.
body = close - open
if body[1] > 0
    signal("PREVIOUS BAR WAS UP")
```

---

## 3. At bar 0 there is nothing behind you

**`x[n]` where `n` is greater than `bar.index` is absent.** It is not an error,
it is not clamped to the oldest bar, and it is not zero.

```
close[1]        // on bar 0: absent. On bar 1: bar 0's close.
close[100]      // on bar 7: absent. On bar 100: bar 0's close.
```

Here is what one series looks like at the left edge of a dataset whose first
four closes are 100, 102, 101, 104:

| Executing bar | `close` | `close[1]` | `close[2]` | `close[3]` | `close[4]` |
|---|---|---|---|---|---|
| 0 | 100 | absent | absent | absent | absent |
| 1 | 102 | 100 | absent | absent | absent |
| 2 | 101 | 102 | 100 | absent | absent |
| 3 | 104 | 101 | 102 | 100 | absent |

Clamping would be the worst of the available choices, because it invents a value
that looks like data. If `close[1]` on bar 0 were clamped to `close[0]`, then
`close - close[1]` would be exactly zero on bar 0: a plausible change of nothing,
drawn on the chart as a real reading, rather than a gap where there was no
measurement. Absence propagates through the subtraction and the plot draws
nothing, which is the truth about bar 0.

Everything downstream follows the ordinary absence rules, and they are worth
rehearsing here because the left edge of a chart is where you meet them:

```
close - close[1]        // absent on bar 0
close[1] > close[2]     // absent on bars 0 and 1, not false
isNone(close[1])        // true on bar 0: the way to ask
orElse(close[1], close) // the previous close, or this one at the start
```

A comparison against an absent value is absent, not false, so `a > b` being
false does not tell you that `a <= b` is true. During the first bars both are
absent and both branches are skipped. That identity is worth the rule: if a
comparison returned false for an absent operand, a script that branched on one
and assumed the other was its complement would take the wrong path at the left
edge of the chart, where nobody is looking.

---

## 4. Offsets that are not whole, not positive, or not there

| Offset | Result |
|---|---|
| `0` to `bar.index` | The value on that bar |
| Greater than `bar.index` | Absent |
| Not a whole number, for example `2.5` | OS4001, with the fix naming `floor` or `round` |
| Negative, computed at run time | OS4001 |
| Negative, written as a literal | OS3004, caught at compile time |
| Absent | Absent |
| Greater than the retained depth | OS4002, naming the depth and the `limits()` line that raises it |

**A fractional offset is rejected rather than truncated.** A lookback of 2.5
bars is a bug in the script, and truncating it to 2 hides the bug behind a
number that looks right. Say what you mean:

```
back = round(len / 2)
mid  = close[back]
```

**A negative offset is not available at any price.** Reading the future is the
one thing a per-bar language must never make easy, and there is no argument, no
option and no mode that turns it on for `[]`. Where a study genuinely needs a
value drawn ahead of the current bar, it draws it there without reading it:
`plot(..., offset = 26)` shifts where a column is drawn and never what it
contains.

**An absent offset gives an absent result**, by the ordinary propagation rule.
This matters more often than it sounds, because offsets are frequently computed:

```
back = lowestBars(low, 20)      // absent for the first 19 bars
priceThen = close[back]         // therefore absent for the first 19 bars too
```

**OS4002 is an error rather than an absent value, and the distinction is the
point.** By default the engine retains the full history of every series for the
dataset it was given, so OS4002 only appears when a host has set a depth
deliberately. When it does appear, it means the value existed and the engine
threw it away, which is a completely different situation from the value never
having existed. Returning absence for both would hide a real configuration bug
behind a plausible gap at the left edge.

---

## 5. Reading the history of an expression

You cannot write `[]` on an arbitrary expression, so there are two ways to look
back through one.

**Name it at the top level.** This is the everyday answer, it costs one line,
and it usually makes the script easier to read anyway:

```
version 1

study("Range expansion", precision = 2)

// Naming the range is what gives it history.
barRange = high - low
mean     = sma(barRange, 20)

// Now the expression's own past is available.
expanding = barRange > barRange[1] and barRange[1] > barRange[2]

plot(barRange, "Range", aqua)
plot(mean,     "Mean range", orange)

if expanding and barRange > mean
    signal("EXPANDING")
```

**Use `history(expr, n)`.** It is the explicit spelling of `[]`, it reads the
same value, and it exists for the places where `[]` would be ambiguous to a
human reader:

```
prev = history(close - open, 1)     // the previous bar's body
```

`history(src, n)` has a warmup of bar `n`, which is the same statement as
"absent until `n` bars exist", written the way the library writes every other
warmup.

One caution about naming a value to give it history: the name must be at the
**top level**, not inside a block. A name declared inside an `if` is a block
name; it has no history and no life beyond the bar, and `[]` on it is OS2004.
If you need history for something computed conditionally, compute it
unconditionally with a ternary:

```
// No history: inner is a block name.
if trending
    inner = close - open

// History: value is a top-level name, absent on the bars you did not want.
value = trending ? close - open : none
wasPositive = orElse(value[1] > 0, false)
```

---

## 6. History through a function parameter

A user function's parameter can carry history, and it reads the history of the
expression the **caller** passed:

```
version 1

study("Slope", precision = 4)

fn slope(src, n) => (src - src[n]) / n

plot(slope(hlc3, 5),       "Typical price slope", aqua)
plot(slope(ema(close, 20), 5), "Average slope",   orange)
```

Passing an expression to a series parameter causes the engine to retain that
expression's per-bar values **for that call site**. The two calls above retain
two separate series, because they are two call sites, which is the same rule
that gives two calls of a stateful function two independent state slots.

Two things follow, and both are easier to accept once you know why:

- A call site that does not execute on a bar retains nothing for that bar, so
  the parameter's history has a hole in it exactly where the call was skipped.
  This is one more reason to call at the top level and branch on the result.
- Retention is per call site, so calling the same helper in ten places retains
  ten series. That is the cost of the convenience, and section 9 puts numbers on
  it.

---

## 7. Series or array: which `[]` is this

`a[i]` is history when `a` is a series and element access when `a` is an array.
The checker knows which from the type of `a`, so there is no ambiguity at
compile time and no run-time dispatch. There is, however, one shape where a
human reader can be misled: a `var` holding an array.

```
var prices = [0.0]

prices[0]                   // the first element of the array
history(prices, 1)          // the array as it stood one bar ago
element(prices, 0)          // the first element, said explicitly
```

Use the explicit forms in any line that is doing both. The same applies to a
multi-output library call, which returns an `array<number>` holding this bar's
outputs:

```
m = macd(close, 12, 26, 9)

plot(m[0], "MACD", aqua)            // element 0 of this bar's array
plot(m[1], "Signal", orange)
plot(m[2], "Histogram", gray, style = "histogram")

climbing = m[0] > history(m, 1)[0]  // this bar's line against last bar's line
```

The returned array is never absent and never changes length. Each element
carries its own warmup and is absent until it is reached. An array that grew as
warmup completed would make `m[1]` an out-of-range error on early bars, which
would break a script only at the left edge of a chart, which is the worst place
for a script to break.

An array index outside `0` to `size - 1` is an error, OS4004, rather than an
absent value. That is the opposite of the `[]` rule for a series, and
deliberately so: an array has a known extent that the script chose, so an
out-of-range index is a mistake, while a lookback past the start of history is a
measurement that does not exist.

---

## 8. Library functions that read history for you

Most lookbacks you would write by hand already exist, with an exact warmup, a
running implementation, and a name that says what it means.

| You might write | Write instead | Warmup |
|---|---|---|
| `close - close[1]` | `change(close)` | bar 1 |
| `close - close[len]` | `change(close, len)` | bar `len` |
| a loop taking the maximum of `high[i]` | `highest(high, len)` | bar `len - 1` |
| a loop taking the minimum of `low[i]` | `lowest(low, len)` | bar `len - 1` |
| a loop adding `close[i]` | `sum(close, len)` | bar `len - 1` |
| `a > b and a[1] <= b[1]` | `crossUp(a, b)` | bar 1 |
| counting bars since a condition | `barsSince(cond)` | the first bar the condition is true |
| remembering a value from a past condition | `valueWhen(cond, src)` | the first bar the condition is true |
| how far back the window's high was set | `highestBars(high, len)` | bar `len - 1` |

Two of those are worth a comment. `crossUp(a, b)` is defined as "was at or below,
then above" rather than "strictly below, then above", so two series that touch
and separate report one cross rather than none; on an instrument with a coarse
tick, the strict version loses real crossings. And `barsSince` and `valueWhen`
are absent, not zero, before the condition has ever been true, because zero
would read as "it happened on this bar".

---

## 9. What a deep lookback costs

Three separate costs, and it is worth knowing which one you are paying.

**Memory, per retained series.** The compiler allocates a series register for a
top-level name only when the program actually reads that name's history;
otherwise the name gets a plain slot that is discarded at the end of the bar.
So `diff = close - open` costs nothing extra unless some line writes `diff[n]`
somewhere. This changes memory, never numbers.

By default the engine retains the full history of every register for the dataset
it was given. On fifty thousand bars, each retained series is fifty thousand
numbers. A host that wants a bound sets one, and a script that wants a deeper
one than the host's default asks for it:

```
study("Long memory")
limits(history = 20000)
```

`limits()` takes `loops` and `history`, its arguments must be literal numbers,
and it must be the statement immediately after the declaration. A host may
refuse a `limits()` call that exceeds what it is willing to run, and must say so
with OS5003 rather than quietly capping it, because a program that silently gets
a smaller budget than it asked for produces a wrong number instead of a message.

**Iterations, per bar.** A loop that walks back over history pays the per-bar
loop budget: 2,000,000 iterations by default, summed over every loop in the bar.
A lookback of 500 inside a loop that itself runs 500 times is 250,000 iterations
on every bar, which is inside the budget and still an enormous amount of work to
repeat fifty thousand times.

```
// 200 iterations per bar, every bar.
hi = low[0]
for i = 0 to 199
    hi = max(hi, high[i])

// The same number, computed from a running window, with a stated warmup.
hi = highest(high, 200)
```

Prefer the library call. It is not only shorter: its warmup is specified to the
bar, its arithmetic is fixed so two engines agree to the last decimal, and it
does not spend the budget you may need elsewhere.

**Warmup, per composition.** A lookback of `n` means the value cannot exist
before bar `n`, and that absence travels through everything downstream. A study
built from a 200 bar lookback of a 20 bar average is honest only from bar 219,
and [warmup.md](./warmup.md) is the page that shows how to count it and how to
see it on a chart.

A rule of thumb that keeps all three costs in view: **look back as far as the
idea needs, and no further, using a library window function wherever one
exists.** A study that reads `close[1]` and `close[2]` is free. A study that
loops over a thousand bars on every bar is a study you will want to profile.

---

## 10. Three mistakes with history

**Expecting `close[1]` to be a number on the first bar.** It is absent, and the
usual symptom is a plot that starts one bar later than expected, or a condition
that never fires at the left edge. If the first bar genuinely needs a value,
say what it should be: `orElse(close[1], close)`.

**Writing `[]` on a temporary.** OS2004 is telling you that the value has no
retained history, not that the syntax is wrong. Give it a name at the top level.

**Confusing element access with history on a `var` array.** `prices[1]` is the
second element; `history(prices, 1)` is last bar's array. Use the explicit form
in any line where both readings are plausible to a reader.

---

## See also

- [execution-model.md](./execution-model.md) for the bar loop these reads happen
  inside
- [persistence.md](./persistence.md) for the difference between reading the past
  and carrying a value forward
- [warmup.md](./warmup.md) for what absence at the left edge does to everything
  downstream
- [realtime-and-confirmation.md](./realtime-and-confirmation.md) for why
  `high[1]` is a safer question than `high`
- [absent-values.md](./absent-values.md) for the value `close[1]` gives you on
  bar 0, and everything it does afterwards
- [collections.md](./collections.md) for the other meaning of `[]`
- [../README.md](../README.md) for the rest of the documentation
- [../../spec/stdlib.md](../../spec/stdlib.md) for every windowed function and
  its exact warmup
