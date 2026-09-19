# Operators

By the end of this page you will be able to read any OpenScript expression the
way the compiler reads it: knowing what binds first, what division gives you,
what a comparison against an absent value returns, and exactly when the right
half of an `and` or an `or` is evaluated at all.

## The precedence table

Highest binding first. Every level is left associative except where the notes say
otherwise.

| Level | Operators | Notes |
|---|---|---|
| 1 | `(expr)`, `f(args)`, `a[i]`, `a.b` | Grouping, call, history or element, member |
| 2 | unary `-`, unary `+`, `not` | Right associative |
| 3 | `*`, `/`, `%` | |
| 4 | `+`, `-` | Binary |
| 5 | `<`, `<=`, `>`, `>=` | At most one per expression, see below |
| 6 | `==`, `!=` | At most one per expression |
| 7 | `and` | Short-circuits |
| 8 | `or` | Short-circuits |
| 9 | `cond ? a : b` | Right associative |

Assignment is not in the table because it is not an operator. It is a statement,
which is why `if x = 5` cannot compile: that is OS1006, with the fix naming `==`.

Worked readings:

```
a + b * c           // a + (b * c)
-x % y              // (-x) % y
not a and b         // (not a) and b
a or b and c        // a or (b and c)
close[1] * 2        // (close[1]) * 2
x > 0 ? "up" : x < 0 ? "down" : "flat"      // nests to the right
```

### The one precedence trap worth memorising

`not` binds tighter than comparison, so `not a > b` parses as `(not a) > b`. Since
ordered comparison compares numbers and strings, and `not a` is a boolean, that
line is a type error rather than the test you meant. Write the parentheses:

```
not (close > open)          // correct
not close > open            // OS2003: a bool is not comparable
```

The same shape appears with `isNone`, and there it is safe by accident because
`isNone(x)` is a call, so the call's parentheses already do the grouping:

```
not isNone(x) and x > 5     // parses as ((not isNone(x)) and (x > 5))
```

That expression is the standard presence guard, and it is worth reading once
against the table above until it is obvious why it needs no parentheses of its
own.

## Arithmetic

`+`, `-`, `*`, `/` and `%` operate on `number`.

There is one numeric type, so there is one division. `/` is real division always:
`7 / 2` is `3.5`, not `3`. There is no integer division operator, no `//`, and no
separate integer type for one to produce. When you want a whole number you say
which way to round, in a call the reader can see.

| Expression | Value | Why |
|---|---|---|
| `7 / 2` | `3.5` | Division is always real |
| `-7 / 2` | `-3.5` | The same |
| `floor(7 / 2)` | `3` | Toward negative infinity |
| `floor(-7 / 2)` | `-4` | Toward negative infinity, so it goes down |
| `trunc(-7 / 2)` | `-3` | Toward zero |
| `round(-7 / 2)` | `-4` | Nearest, halves away from zero |
| `7 % 2` | `1` | Remainder of truncated division |
| `-7 % 3` | `-1` | The sign follows the left operand |
| `mod(-7, 3)` | `2` | The remainder that carries the right operand's sign |
| `7 / 0` | `none` | Division by zero has no answer |
| `0 / 0` | `none` | The same |

The two remainders exist because both are wanted about equally often. `%` is the
remainder of truncated division, so its sign follows the left operand, which is
what a "distance past a multiple" calculation wants. `mod` carries the right
operand's sign, which is what an "index into a cycle" calculation wants. Picking
one and shipping only that would leave half of all uses writing the correction by
hand.

Absence propagates through every arithmetic operator: if either operand is
absent, so is the result, including `none * 0`. Arithmetic with no answer
produces absence rather than infinity or an error, which is the rule covering
division by zero, `sqrt` below zero and `log` at or below zero. The whole of that
subject is on its own page.

```
version 1

study("Rounding a level to the instrument", overlay = true, precision = 2)

steps = input(3, "Distance, in ticks", min = 1, max = 100)

// chart.tickSize is absent when the host has not stated one, so the whole
// expression is absent and the level simply does not draw. That is better than
// a stop placed at a price the exchange will not accept.
offset = isNone(chart.tickSize) ? none : steps * chart.tickSize

// roundToTick is absent on the same terms, for the same reason.
stopLevel = roundToTick(lowest(low, 20) - offset)

plot(stopLevel, "Stop level", red, width = 2, style = "step")
```

## `+` on strings

`+` concatenates two strings. It does nothing else. `"a" + 5` is OS2003, and the
fix is `"a" + text(5)`.

An absent operand makes the whole string absent, so a message with one absent
fragment is not a partial message: it is no message. `text(none)` is the string
`"none"`, which is the escape hatch when you want the absence to appear in the
output rather than erase it.

## Comparison

`<`, `<=`, `>` and `>=` compare two numbers or two strings. String comparison is
by Unicode code point, which is stable in every locale. It is not a human
friendly alphabetical order and is not offered as one.

**A comparison may not be chained.** `a < b < c` is OS1008, and the fix names the
middle value twice:

```
if 30 < r and r < 70            // correct
if 30 < r < 70                  // OS1008
```

Chaining is rejected rather than given the mathematical meaning because two
readings are plausible to a reader, the mathematical one and the one where the
first comparison produces a boolean that is then compared with `c`. A form with
two plausible meanings has no place in a language that places orders.

**Ordered comparison propagates absence.** If either side is absent, the result is
absent, not false. `none < 5` is `none`. This keeps `not (a > b)` equal to
`a <= b` for every input: during warmup both are absent, and both branches are
skipped, rather than both being false and both branches being taken.

A comparison written directly against `none` can only ever be absent, so its
branch is dead. That is warning OS8012, and the fix is `isNone(x)`.

```
if value > none                 // OS8012: absent on every bar
if not isNone(value)            // what was meant
```

## Equality

`==` and `!=` are **total**: they always return `true` or `false` and never
absent. That is the deliberate exception to the propagation rule, because a
question that cannot be answered is not a question worth having.

| Case | Result |
|---|---|
| `none == none` | `true` |
| `none == 5` | `false` |
| `5 != none` | `true` |
| Two `color` values | Equal when all four channels match |
| Two arrays | Equal when they are the same array, not when their contents match |
| Two different types | OS2003, except against `none`, which is always allowed |

`arrayEqual(a, b)` compares contents. `==` on arrays compares identity, because an
array is a reference: assigning one name to another gives two names for one
array, and the language will not pretend otherwise.

Totality has one consequence that catches everyone once. On bar 0 a history read
is absent, so `x != x[1]` is `true`, and a state change marker fires on the first
bar of every chart. Guard it with `bar.isFirst`.

```
version 1

study("Direction flips", overlay = true, precision = 2)

fast = ema(close, 9)
slow = ema(close, 21)

dir = fast > slow ? 1 : -1

// != is total, so on bar 0 dir[1] is absent, the test is true, and the study
// would mark a flip that never happened.
if not bar.isFirst and dir != dir[1]
    signal(dir == 1 ? "TREND UP" : "TREND DOWN")

plot(fast, "Fast", aqua,   width = 2)
plot(slow, "Slow", orange, width = 2)
```

## Boolean operators

The operators are the words `and`, `or` and `not`. There is no `&&`, no `||` and
no `!`. They use three-valued logic, where the absent value means "unknown".

| `a` | `b` | `a and b` | `a or b` |
|---|---|---|---|
| `true` | `true` | `true` | `true` |
| `true` | `false` | `false` | `true` |
| `true` | `none` | `none` | `true` |
| `false` | any | `false` | `b` |
| `none` | `true` | `none` | `none` |
| `none` | `false` | `false` | `none` |
| `none` | `none` | `none` | `none` |

`not none` is `none`.

### The short-circuit rules

**An operand is evaluated only if it can change the result.** Read off the table,
that means:

| Expression | Left is | Right operand evaluated | Result |
|---|---|---|---|
| `a and b` | `false` | No | `false` |
| `a and b` | `true` | Yes | `b` |
| `a and b` | `none` | Yes | `false` when `b` is false, otherwise `none` |
| `a or b` | `true` | No | `true` |
| `a or b` | `false` | Yes | `b` |
| `a or b` | `none` | No | `none` |

The asymmetry in the last row is the one to remember. An `and` with an unknown
left operand can still be settled by a false right operand, so the right operand
is evaluated. An `or` with an unknown left operand is unknown whatever is on the
right, so the right operand is never reached.

The practical rule that falls out of it: **put the total test on the left.**

```
if not isNone(x) and x > 5      // works: the left operand is never absent
if x > 5 and not isNone(x)      // absent when x is absent, so it never fires
if isNone(x) or x > 5           // works
if x > 5 or isNone(x)           // absent when x is absent, so it never fires
```

### Short-circuiting and calls that hold state

Short-circuiting interacts with the per-bar state that library functions keep. If
the right operand contains a stateful call and it is not evaluated on some bar,
that call's state does not advance and its series is absent for that bar.

```
// The average sees only the bars where the input was on, which is not the
// average anybody meant.
if useFilter and rsi(close, 14) > 70
    signal("HIGH")
```

```
version 1

study("Filtered overbought", precision = 2)

useFilter = input(true, "Use the filter")
len       = input(14,   "RSI length", min = 2, max = 200)

// Computed unconditionally at the top level, so it advances on every bar, and
// used inside the guard afterwards.
r = rsi(close, len)

if useFilter and r > 70
    signal("HIGH")

plot(r, "RSI", purple, width = 2)
level(70, "Overbought", fade(red, 50))
```

This is specified behaviour rather than a hazard to avoid, and the compiler warns
with OS8001 when a stateful call sits inside a conditional branch. The rule to
carry is simple: compute at the top level, branch on the result.

## The ternary

`cond ? a : b`. The condition must be a `bool` or absent, and an absent condition
takes the false arm. Both arms must have the same type, or one arm may be `none`.
Only the taken arm is evaluated.

```
tint  = up ? lime : red
value = ready ? computed : none
zone  = r > 70 ? "high" : r < 30 ? "low" : "mid"        // nests to the right
```

The ternary is right associative, so a chain of them reads top to bottom as a
list of cases with the last as the default. Arms of different types are OS2012.

Version 1 has no expression form of `switch`; the ternary is how a value is
chosen, and `switch` is how a block is chosen.

## The history and element operator

`a[i]` is history when `a` is a series and element access when `a` is an array.
The checker knows which from the type of `a`, so there is no ambiguity at compile
time and no dispatch at run time.

```
close[1]        // history: one bar back
prices[1]       // element: the second element, when prices is an array
```

| Situation | Result |
|---|---|
| `x[n]` where `n` is greater than `bar.index` | `none`. Not clamped, not zero, not an error |
| `x[n]` where `n` is not a whole number | OS4001, with the fix naming `floor` or `round` |
| `x[n]` where `n` is negative | OS4001, and a negative literal is OS3004 at compile time |
| `x[n]` where `n` is absent | `none`, by the arithmetic rule |
| `x[n]` deeper than the retained depth | OS4002, naming the depth and the `limits(history = ...)` line that raises it |
| `arr[i]` outside `0` to `size - 1` | OS4004, an error, because the array's extent is one the script chose |

Reading past the start of history is absence and reading past the end of an array
is an error, and the difference is deliberate. In the first case the value never
existed. In the second, the script asked for something it never created.

Where one line uses both meanings, the explicit forms remove the doubt:
`history(expr, n)` always means history and `element(arr, i)` always means element
access.

## Assignment is a statement

```
name = expression
name += expression      // and -= *= /= %=
```

Assignment never appears inside an expression, which is what makes `if x = 5` a
syntax error rather than a condition that is always true. The compound forms
expand exactly as you would expect and obey every rule above, including absence:
`x += none` leaves `x` absent.

A name's type is fixed by its first assignment. Assigning a different type later
is OS2003.

## Operators that do not exist

| You might write | The language has | Why |
|---|---|---|
| `!cond` | `not cond` | One spelling for one idea, and `!` is easy to miss on screen |
| `a && b` | `a and b` | The same |
| `a \|\| b` | `a or b` | The same |
| `a ^ b` | `pow(a, b)` | `^` reads as exclusive or to half its readers, and `-2 ^ 2` has two defensible answers |
| `a ** b` | `pow(a, b)` | The same |
| `i++` | `i += 1` | One form, and no expression with a side effect |
| `a & b`, `a \| b`, `a << b` | nothing | There are no bitwise operators: there is no integer type for them to act on |
| `a; b` | two lines | A statement ends at the end of its line. A `;` is OS1007 |
| `{ ... }` | indentation | A block is written by indenting it |
| `a < b < c` | `a < b and b < c` | Two plausible readings, so neither is allowed |

## Quick reference

| Operator | Operands | Result | Absent operand |
|---|---|---|---|
| unary `-`, unary `+` | `number` | `number` | Absent |
| `not` | `bool` | `bool` | Absent |
| `*`, `/`, `%` | `number`, `number` | `number` | Absent |
| `+` | two numbers, or two strings | the same type | Absent |
| `-` | `number`, `number` | `number` | Absent |
| `<`, `<=`, `>`, `>=` | two numbers, or two strings | `bool` | Absent |
| `==`, `!=` | two values of one type, or anything against `none` | `bool` | Never absent |
| `and`, `or` | `bool` | `bool` | Three-valued, see the table above |
| `? :` | `bool` condition, two arms of one type | that type | Condition absent takes the false arm |
| `[]` | series and a whole number, or array and an index | the element type | Index absent gives absent |
| `.` | a namespace and a member name | the member's type | n/a |

## See also

- [types-and-values.md](./types-and-values.md) for the types these operators accept
- [absent-values.md](./absent-values.md) for why comparison propagates and equality does not
- [control-flow.md](./control-flow.md) for where a condition is evaluated and what an absent one does
- [variables-and-scope.md](./variables-and-scope.md) for assignment, which is a statement rather than an operator
- [bars-and-history.md](./bars-and-history.md) for the history operator in full
- [../README.md](../README.md) for the documentation index
- [../../spec/language.md](../../spec/language.md) section 9 for the specification of expressions
- [../../examples/](../../examples/) for twelve working scripts
