# Operators

By the end of this page you will know every operator in OpenScript, what it binds
tighter than, which way it associates, what types it accepts, and what it does when
an operand is absent.

## The precedence table

Highest binding first. Every level is left associative except where the table says
otherwise.

| Level | Operators | Associativity | Notes |
|---|---|---|---|
| 1 | `(expr)`, `f(args)`, `a[i]`, `a.b` | Left | Grouping, call, history or element, member |
| 2 | unary `-`, unary `+`, `not` | Right | |
| 3 | `*`, `/`, `%` | Left | |
| 4 | binary `+`, binary `-` | Left | `+` also concatenates strings |
| 5 | `<`, `<=`, `>`, `>=` | Left | Not chainable |
| 6 | `==`, `!=` | Left | Not chainable |
| 7 | `and` | Left | Short-circuits |
| 8 | `or` | Left | Short-circuits |
| 9 | `cond ? a : b` | Right | Only the taken arm is evaluated |

```
a + b * c           // a + (b * c)
-x % y              // (-x) % y
not a and b         // (not a) and b
a or b and c        // a or (b and c)
x > 0 ? "up" : x < 0 ? "down" : "flat"      // nests to the right
```

**Assignment is not on this table.** `=`, `+=` and the rest are statements, not
operators, and they are catalogued near the end of this page.

Nine levels is a short table by the standards of this family of languages, and it
is short on purpose: there are no bitwise operators to slot between comparison and
logic, and no exponent operator to argue about above multiplication. A reader can
hold the whole table in their head, which is the only way precedence ever stops
being a source of bugs.

---

## Level 1: postfix and grouping

### `(expr)` grouping

**Types:** any. **Result:** the type of `expr`.

Overrides precedence. It has no other effect, and it costs nothing at run time.

```
mid = (high + low) / 2
```

### `f(args)` call

**Result:** the function's return type.

Arguments may be positional, named, or positional followed by named. A named
argument may not repeat a positional one.

```
band(close, mult = 3)
```

| Mistake | Error |
|---|---|
| Wrong argument count | OS3001 |
| A named argument that does not exist | OS3002, and the message lists the names that do |
| A positional argument after a named one | OS3005 |
| An argument of the wrong type | OS3011 |

A bare name may carry more than one signature, differing in arity or in argument
type, and the checker resolves the call at compile time. There is no run-time
dispatch, so `sum(prices)` over an array and `sum(close, 20)` over a window are
picked apart before the first bar runs.

### `a[i]` history or element

**Types:** `series T` with a whole `number`, giving `T`; or `array<T>` with a whole
`number`, giving `T`.

One bracket, two meanings, decided at compile time from the type of `a`. The
checker always knows which, so there is no ambiguity in the language and no dispatch
in the engine.

```
close[1]        // history: the previous bar's close
prices[1]       // element: the second element, if prices is an array
```

**As history**, `a[n]` is the value `n` bars back, and `a[0]` is the same as `a`.
A value has history, and therefore accepts `[]`, in exactly four cases:

1. It is a built-in series such as `close` or `bar.index`.
2. It is a name declared at the **top level** of the file.
3. It is a call to a function declared to return a series.
4. It is a parameter of a user function whose type is a series, in which case `[]`
   reads the history of the expression the caller passed.

Anything else is OS2004, with the fix "assign it to a name at the top level of the
file first". Retaining history costs memory per bar, and a language that retained
it for every temporary inside every loop body would not run fifty thousand bars in
a browser tab.

| Case | Result |
|---|---|
| `n` greater than `bar.index` | `none`. Not an error, not clamped, not zero |
| `n` not a whole number | OS4001, with the fix naming `floor` or `round` |
| `n` negative | OS4001 at run time, OS3004 when the literal is negative |
| `n` is `none` | `none`, by ordinary absence propagation |
| `n` beyond the retained depth | OS4002, naming the depth and the `limits(history = ...)` line that raises it |

Absence past the start of history rather than clamping matters more than it looks.
`close[1]` clamped to `close[0]` would make `close - close[1]` exactly zero on bar
0, which is a plausible-looking change of zero rather than a visible gap. OS4002 is
an error rather than absence because the value existed and the engine threw it
away, which is a different situation from the value never having existed.

**As element access**, `a[i]` reads element `i` of an array, counting from 0. An
index outside `0` to `size - 1` is OS4004, naming the index and the size. It is an
error rather than absence because an array has a known extent the script chose, so
an out-of-range index is a mistake rather than a missing measurement.

The one line a reader can misread is a `var` holding an array, where `[]` indexes
the array and the reader might have expected the previous bar's array. Two explicit
functions cover it: `history(expr, n)` always means history and `element(arr, i)`
always means element access.

### `a.b` member access

**Types:** a namespace and a member name. **Result:** the member's type.

```
if bar.isConfirmed
    signal("CLOSE")
```

Version 1 has ten namespaces and no user record types, so the only valid left
operand is one of `bar`, `chart`, `session`, `date`, `str`, `math`, `pos`, `order`,
`draw` and `req`. **The specification does not name an error code for an unknown
member**, so expect a name error in the OS2xxx range.

---

## Level 2: unary operators

### unary `-`

**Types:** `number` to `number`, `none` to `none`.

```
drop = -change(close)
```

A negative number literal is this operator applied to a literal, not part of the
literal. That matters in exactly one place, an argument list, and `f(-2)` parses as
you expect.

### unary `+`

**Types:** `number` to `number`, `none` to `none`.

Does nothing to the value. It exists so that a line of aligned constants can be
written with signs on both.

### `not`

**Types:** `bool` to `bool`, `none` to `none`.

Right associative, so `not not x` is legal and means what it says.

```
if not pos.isFlat
    close()
```

`not none` is `none`, which keeps the identity `not (a > b) == (a <= b)` true for
every input including absent ones. That identity is the reason comparisons
propagate absence in the first place.

`!` is not an operator. `!cond` is OS1001 with the fix naming `not cond`.

---

## Level 3: multiplication, division, remainder

| Operator | Types | Result |
|---|---|---|
| `*` | `number * number` | `number` |
| `/` | `number / number` | `number`, or `none` when the divisor is zero |
| `%` | `number % number` | `number`, the remainder of truncated division |

```
atrPercent = atr(14) / close * 100
```

**Division by zero is `none`, including `0 / 0`.** It is absence rather than an
error because a single bad bar must not kill a study that is otherwise correct over
fifty thousand bars, and it is absence rather than infinity because infinity cannot
be plotted, cannot be compared usefully and poisons every average it enters.

**`%` takes its sign from the left operand**, because it is the remainder of
truncated division: `-7 % 3` is `-1`. For the other convention the library has
`mod(a, b)`, which returns a remainder carrying `b`'s sign, so `mod(-7, 3)` is `2`.
Both exist because both are wanted about equally often, and picking one leaves half
of all uses writing the correction by hand.

**The specification does not state what `x % 0` produces.** Division by zero is
specified as `none`, and the remainder case is not written down. Guard it.

There is no exponent operator. `pow(x, y)` is the power function, because `^` reads
as exclusive or to half the people who will read this language and as power to the
other half, and `-2 ^ 2` has two defensible answers.

---

## Level 4: addition, subtraction and concatenation

| Operator | Types | Result |
|---|---|---|
| `+` | `number + number` | `number` |
| `+` | `string + string` | `string`, concatenated |
| `-` | `number - number` | `number` |

```
message = "entry at " + text(close, 2)
```

`+` does those two things and nothing else. `"a" + 5` is OS2003, because there is
no implicit conversion anywhere in the language: every silent coercion rule in
every language is a source of bugs that survive review, and a trading script that
quietly treats a zero as a false has a bug nobody will find until it costs money.
The conversions are explicit and short: `text(x)`, `text(x, decimals)`, `number(s)`
and `bool(x)`.

Concatenation follows the absence rule like everything else: `"a" + none` is
`none`, not `"anone"`. To print an absent value deliberately, convert it first:
`"a" + text(none)` is `"anone"`.

---

## Level 5: ordering comparisons

| Operator | Types | Result |
|---|---|---|
| `<`, `<=`, `>`, `>=` | `number` against `number`, or `string` against `string` | `bool`, or `none` when either operand is absent |

```
if close > highest(high, 20)[1]
    signal("BREAKOUT")
```

String comparison is by Unicode code point, which is stable across locales. It is
not a human-friendly alphabetical sort and is not offered as one.

**If either operand is `none`, the result is `none`, not `false`.** This is the
decision on this page that most repays reading twice. Returning `false` looks
convenient and is a trap: it makes `a > b` and `a <= b` both false, so a script
that branches on one and assumes the other is its complement takes the wrong path
during warmup and nobody notices, because warmup bars are off the left edge of the
screen.

**A comparison may not be chained.** `a < b < c` is OS1008, with the fix
`a < b and b < c`. Chaining is rejected rather than given the mathematical meaning
because the reading from the C family, `(a < b) < c`, and the mathematical reading
are both plausible to a reader, and a form with two plausible meanings has no place
in a language that places orders.

---

## Level 6: equality

| Operator | Types | Result |
|---|---|---|
| `==`, `!=` | Two values of the same type, or any value against `none` | `bool`, always |

```
if direction != direction[1]
    signal("FLIP")
```

**`==` and `!=` are total. They always return `true` or `false`, never `none`.**

```
none == none    // true
none == 5       // false
5 != none       // true
```

Equality is the deliberate exception to absence propagation, because a comparison
that can itself be absent gives the script no way to ask the question at all.
`x == none` and `isNone(x)` mean the same thing, and both are usable directly in an
`if`.

| Comparison | Rule |
|---|---|
| Two values of different types | OS2003 |
| Anything against `none` | Always allowed |
| Two `color` values | Equal when all four channels match |
| Two arrays | Equal when they are the **same array**, not when they hold equal elements. `arrayEqual` compares contents |

Equality is not chainable either. The grammar allows at most one equality operator
in an expression, so `a == b == c` is a syntax error rather than a comparison
against a boolean.

---

## Levels 7 and 8: `and`, `or`

Three-valued logic, where `none` means unknown. Both short-circuit: the right
operand is evaluated only when it can change the result.

| `a` | `b` | `a and b` | `a or b` |
|---|---|---|---|
| `true` | `true` | `true` | `true` |
| `true` | `false` | `false` | `true` |
| `true` | `none` | `none` | `true` |
| `false` | any | `false` | `b` |
| `none` | `true` | `none` | `none` |
| `none` | `false` | `false` | `none` |
| `none` | `none` | `none` | `none` |

Read the table carefully at the `or` column: `true or none` is `true`, and
`none or true` is `none`. **`or` is the one operator in the language whose result
depends on which side the absent operand sits.** It follows from the evaluation
order, the left operand deciding first, and the practical consequence is that the
operand you are sure about belongs on the left.

```
newDay = bar.isFirst or not date.isSameDay(time, time[1])
```

That line works because `bar.isFirst` is never absent and is checked first. On bar
0 it is `true`, the right operand is never evaluated, and `time[1]` being absent
never matters.

Short-circuiting interacts with stateful calls, and the interaction is specified
rather than accidental. If the right operand contains a call that holds per-bar
state, such as `ema` or a user function containing a `var`, and it is not evaluated
on some bar, that call's state does not advance and its series holds `none` for
that bar. The same rule governs a stateful call inside an `if`, and the compiler
emits warning OS8001 when it sees one, naming the call and suggesting the fix:
compute it unconditionally at the top level and use the result inside the branch.

```
e = ema(close, 20)          // computed on every bar
if trending
    barColor(close > e ? lime : red)
```

`&&` and `||` do not exist. The operators are the words.

---

## Level 9: the ternary

**Form:** `cond ? a : b`. **Types:** `cond` is `bool` or `none`; `a` and `b` must
have the same type, or one of them may be `none`. **Result:** that type.

Right associative, so a chain nests to the right and reads as a sequence of
fallbacks.

```
color = up ? lime : down ? red : silver
```

Only the taken arm is evaluated, which is what makes the ternary safe as a guard:

```
ratio = down > 0 ? up / down : none
```

**A `none` condition takes the false arm**, the same rule as `if`. That is the one
place absence is absorbed rather than propagated, and it is unavoidable because
execution has to go somewhere. It is safe here in a way that returning `false` from
a comparison is not, because the absorbing happens at the branch, where a reader
can see it, rather than inside an expression three lines earlier.

The ternary is also how a plot is hidden, since `plot` is top level only:

```
plot(trending ? ema20 : none, "EMA 20", aqua)
```

Plotting `none` leaves a gap. Wrapping the `plot` in an `if` is OS3006.

---

## Assignment: statements, not operators

| Form | Means |
|---|---|
| `name = expression` | Declare the name in this scope, or update it if it already exists in an enclosing one |
| `name += expression` | `name = name + expression` |
| `name -= expression` | `name = name - expression` |
| `name *= expression` | `name = name * expression` |
| `name /= expression` | `name = name / expression` |
| `name %= expression` | `name = name % expression` |

Assignment is a statement and never an expression, so `if x = 5` is OS1006 with the
fix "write `==` to compare". That one rule removes the single most common typo in
every language that allows assignment inside a condition.

A name's type is fixed by its first assignment, and assigning a different type
later is OS2003. The compound forms are shorthand for the obvious expansion and
obey every rule the long form does, including absence: `x += none` leaves `x`
absent.

```
version 1

study("Rolling total")

var total = 0.0
total += orElse(volume, 0)      // orElse, or one absent bar makes total absent forever

plot(total, "Cumulative volume", silver, style = "area")
```

---

## What each operator does with an absent operand

One table, because this is the question a reader comes back for.

| Operator group | With `none` |
|---|---|
| unary `-`, unary `+` | `none` |
| `*`, `/`, `%`, binary `+`, binary `-` | `none` if either operand is absent |
| `+` on strings | `none` if either operand is absent |
| `<`, `<=`, `>`, `>=` | `none` if either operand is absent |
| `==`, `!=` | Never absent. `none == none` is `true` |
| `not` | `none` |
| `and`, `or` | See the three-valued table above |
| `? :` as a condition | Takes the false arm |
| `? :` as an arm | Whatever the taken arm evaluates to, absent included |
| `a[n]` where `n` is absent | `none` |

`none * 0` is `none` rather than zero, even though zero times anything is zero,
because the operand was not zero: it was unknown, and an unknown quantity
multiplied by zero is only zero if the unknown was a number at all. Propagating
uniformly means one rule to remember instead of a table of special cases, and it
means an absent value travels visibly to the plot, where it draws a gap, instead of
being quietly absorbed into a number that looks right.

---

## Operators that do not exist

| Written | Instead |
|---|---|
| `!x` | `not x`. OS1001 names the fix |
| `a && b` | `a and b` |
| `a \|\| b` | `a or b` |
| `x ^ y` | `pow(x, y)` |
| `x ** y` | `pow(x, y)` |
| `x++`, `x--` | `x += 1`, `x -= 1` |
| `a & b`, `a \| b`, `~a`, `a << b`, `a >> b` | Nothing. There are no bitwise operators in version 1 |
| `a < b < c` | `a < b and b < c`. OS1008 names the fix |
| `stmt; stmt` | One statement per line. OS1007 names the fix |
| `{ ... }` | Indentation. There is no brace form and no `end` keyword |

---

## The explicit function forms

Where an operator is ambiguous to a **reader**, even though it is unambiguous to
the compiler, the library has a named function that says which meaning was meant.

| Function | Always means |
|---|---|
| `history(src, n)` | History, `n` bars back |
| `element(arr, i)` | Element `i` of an array |
| `pow(x, y)` | `x` to the power `y` |
| `mod(a, b)` | Remainder carrying `b`'s sign, unlike `%` |
| `arrayEqual(a, b)` | Contents equal, unlike `==` on two arrays |
| `isNone(x)` | The same question as `x == none` |
| `orElse(x, fallback)` | `x` when present, `fallback` when absent |

```
var prices = [0.0]
prices[0]                   // the first element
history(prices, 1)          // the array as it stood one bar ago
```

---

## Three worked examples

### Precedence, written out

```
version 1

study("Precedence")

body   = close - open
weight = body + body[1] * 2         // body + (body[1] * 2)
heavy  = not (close > open) and volume > sma(volume, 20)

plot(weight, "Weighted body", aqua)
plot(heavy ? 1 : 0, "Down bar on heavy volume", orange, style = "histogram")
```

The last line is worth a second look. `heavy` is absent for the first nineteen
bars, because `sma(volume, 20)` is, so the comparison is absent and `and` reports
absence. The ternary then takes the false arm and plots a confident zero. If the
gap should be visible, say so: `heavy ? 1 : isNone(heavy) ? none : 0`.

### What absence does to a comparison

```
version 1

study("Warmup is visible", precision = 2, range = [0, 100])

r = rsi(close, 14)

// Both conditions are absent until bar 14, so neither branch runs and the pane
// keeps its own background. Returning false from the comparison would have made
// the second branch run for fourteen bars and mean it.
if r > 70
    background(fade(red, 92))
if r <= 30
    background(fade(lime, 92))

level(70, "Overbought", red)
level(30, "Oversold", lime)
plot(r, "RSI", purple)
plot(orElse(r, 50), "RSI, floored during warmup", silver)
```

### One bracket, two meanings

```
version 1

study("History and elements", overlay = true)

var recent: array<number> = []
push(recent, close)
if size(recent) > 20
    shift(recent)

barChange = close - close[1]        // history: one bar back
oldest    = recent[0]               // element: the first item in the array

plot(oldest, "Oldest retained close", silver)
plot(close - oldest, "Span over the window", aqua)
plot(barChange, "Change since the last bar", orange)
```

`close[1]` and `recent[0]` are the same token doing two different jobs, and the
checker knows which from the type of the thing on the left. Where a line does both,
`history(recent, 1)` and `element(recent, 0)` spell it out.

---

## Index of symbols

| Symbol | Level | Means |
|---|---|---|
| `(` `)` | 1 | Grouping, or a call's arguments |
| `[` `]` | 1 | History on a series, element on an array, or an array literal |
| `.` | 1 | Member of a namespace |
| `-` unary | 2 | Negation |
| `+` unary | 2 | Identity |
| `not` | 2 | Boolean negation |
| `*` | 3 | Multiplication |
| `/` | 3 | Division, absent on a zero divisor |
| `%` | 3 | Remainder, sign of the left operand |
| `+` binary | 4 | Addition, or string concatenation |
| `-` binary | 4 | Subtraction |
| `<` `<=` `>` `>=` | 5 | Ordering, absent if either operand is |
| `==` `!=` | 6 | Equality, never absent |
| `and` | 7 | Conjunction, short-circuits |
| `or` | 8 | Disjunction, short-circuits |
| `?` `:` | 9 | The ternary |
| `=` | none | Assignment, a statement |
| `+=` `-=` `*=` `/=` `%=` | none | Compound assignment, statements |
| `,` | none | Separates arguments, array elements and `case` values |
| `//` | none | A comment to the end of the line |
| `\` | none | Line continuation |

---

## See also

- [keywords.md](./keywords.md) for `and`, `or`, `not` and the reserved words they sit among
- [variables.md](./variables.md) for the series these operators are applied to
- [constants.md](./constants.md) for the colour and string values that appear as operands
- [../README.md](../README.md) for the documentation index
- [../../spec/language.md](../../spec/language.md) for the precedence table and the grammar
- [../../spec/stdlib.md](../../spec/stdlib.md) for `pow`, `mod`, `history` and `element`
