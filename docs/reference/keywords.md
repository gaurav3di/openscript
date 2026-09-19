# Keywords

By the end of this page you will know all thirty-six reserved words of OpenScript
version 1, what each one does, which of them do nothing yet, and what none of them
may be used for.

## The complete list

These words are reserved in language version 1 and cannot be used as names.

```
and       array     as        bool      break     case      color
continue  default   else      false     fn        for       if
import    in        is        live      map       matrix    none
not       number    or        return    series    step      string
strategy  study     switch    to        true      type      var
while
```

Six of them, `as`, `import`, `is`, `map`, `matrix` and `type`, do nothing in
version 1. They are reserved now because reserving a word costs nothing today and
adding one later would break every script that used it as a variable name. That is
the only way a language can keep the promise that a script which compiles under
version 1 keeps compiling, and keeps producing the same numbers, under every later
release.

## How to read an entry

Each entry gives the form the word appears in, what it does, and one line of code.
Entries are alphabetical. Where a word may not be used for something a reader might
reasonably try, the entry says so.

---

## and

**Form:** `a and b`, a binary operator.

Boolean conjunction over three-valued logic, where `none` means unknown. It
short-circuits: `b` is evaluated only when `a` is `true`, because that is the only
case where `b` can change the answer.

```
if close > open and volume > sma(volume, 20)
    signal("STRONG")
```

`&&` does not exist. The word is the operator. Short-circuiting interacts with
stateful calls: a library call on the right of an `and` that does not run on a bar
leaves that call's series absent for the bar and its state unadvanced.

## array

**Form:** `array<T>`, in a type annotation.

Names the array type. It is not a constructor and not a call: an array is built
with a square bracket literal.

```
var hits: array<number> = []
```

`array<array<number>>` is not in the grammar of version 1, which allows an array of
`number`, `string`, `bool` or `color` only.

## as

**Reserved and unused in version 1.**

Intended for naming an import, alongside the `import` keyword. Nothing in version 1
accepts it, and using it is a syntax error rather than a name.

## bool

**Form:** `bool`, in a type annotation.

Names the boolean type, which holds `true` or `false` and nothing else. A `bool` is
not a number: `0` is not false and `1` is not true, and `if 1` is OS2011.

```
fn isExpanding(cond: bool, len: number) => count(cond, len) > len / 2
```

See the known conflicts at the end of this page: the library also documents a
conversion function spelled `bool(x)`, and a reserved word cannot be called under
the grammar as written.

## break

**Form:** `break`, a statement.

Leaves the innermost `for` or `while` immediately. Outside a loop it is OS1009.

```
for i = 0 to size(zones) - 1
    if element(zones, i) > close
        break
```

`break` is the only way out of a loop early, because a loop's own variable may not
be assigned in its body.

## case

**Form:** `case value` or `case valueA, valueB`, a `switch` arm header.

Introduces one arm of a `switch`. Arms do not fall through: an arm's block ends at
the next `case` or `default`. A `case` may list several values separated by commas,
all of the subject's type.

```
switch method
    case "slow", "verySlow"
        len = 21
```

## color

**Form:** `color`, in a type annotation.

Names the colour type, which holds red, green, blue and alpha. A colour literal is
a bare name such as `aqua`, or hex as `#ff8800` or `#ff880080`.

```
fn zoneTint(hot: bool): color => hot ? red : silver
```

The standard library writes `color` as a named argument on `plot`, `fill`,
`level` and the `draw` calls, and that is correct code. A named argument label is
not a name: it is matched against the callee's parameter list and never looked up
in a scope, so a reserved word is legal there. The rule stops at the label, and
`color` is still not legal as a variable or as a parameter of a user function.

## continue

**Form:** `continue`, a statement.

Skips to the next iteration of the innermost loop. Outside a loop it is OS1009.

```
for i = 0 to 19
    if isNone(close[i])
        continue
```

## default

**Form:** `default`, the last arm of a `switch`.

Runs when no `case` matched. It is optional and must be last. With no `default` and
no match, nothing happens at all, which is why a name the arms set has to be
declared before the `switch`.

```
zone = "mid"
switch
    case rsiValue > 70
        zone = "high"
    default
        zone = "mid"
```

## else

**Form:** `else`, or `else if condition`, a block header.

The alternative branch of an `if`. `else if` is written as two words on one line
and does not increase indentation, so a chain of conditions stays flat on the page
instead of marching to the right.

```
if close > open
    signal("UP")
else if close < open
    signal("DOWN")
```

## false

**Form:** `false`, a literal.

One of the two values of type `bool`. It is not a number and does not compare with
one.

```
useStop = input(false, "Trail the stop")
```

## fn

**Form:** `fn name(parameters) => expression`, or `fn name(parameters) =>` followed
by an indented block whose final expression is the return value.

Declares a user function.

```
fn zscore(src, len) =>
    m = sma(src, len)
    s = stdev(src, len)
    (src - m) / s
```

Four restrictions, all of them consequences of the per-bar model rather than
arbitrary limits:

- A function is declared at the **top level** of a file. Functions may not be
  nested.
- A function may not be assigned to a variable or passed as an argument. There are
  no function values in version 1.
- A function **may not call itself**, directly or through a cycle: OS2005. State
  slots are allocated statically per call site, and recursion would need a dynamic
  stack of them, paid for on every bar of every script.
- A function may be called before its declaration appears, because a declaration is
  not a per-bar statement and the checker collects all of them first.

## for

**Form:** `for i = start to end [step n]`, or `for item in array`.

The two loop forms. `to` is inclusive at both ends.

```
for i = 0 to 9
    total += close[i]
```

If the end is below the start and the step is positive, the body does not run at
all. It does not silently reverse, because a loop that quietly does the opposite of
what it says is worse than a loop that does nothing visible. A `step` of `0` is
OS3004.

The loop variable is scoped to the loop and may not be assigned in the body:
OS2006.

## if

**Form:** `if condition`, a block header.

The conditional. The condition must be `bool` or `none`; any other type is OS2011,
and there is no truthiness rule to remember. **A condition that evaluates to `none`
takes the false branch**, which is the one place in the language where absence is
absorbed rather than propagated, and it is unavoidable because execution has to go
somewhere.

```
if rsi(close, 14) > 70
    signal("OVERBOUGHT")
```

The compiler emits warning OS8004 on an `if` whose condition can be absent and
whose block assigns to a name used outside it, since that is the exact shape where
warmup silently changes an answer.

## import

**Reserved and unused in version 1.**

Intended for importing a user library file, with `as` for naming the import.

## in

**Form:** `for item in array`.

Introduces the array form of `for`. It visits indices `0` to `size - 1` as measured
when the loop is entered, so elements appended during the loop are not visited.

```
for price in levels
    total += price
```

`in` is not a membership test. Use `indexOf(arr, v) != -1` for that.

## is

**Reserved and unused in version 1.**

**The specification does not say what `is` is reserved for.** It appears in the
reserved list and is not named in the list of words held for a later version, and
no construct uses it. Do not plan around either answer.

## live

**Form:** `live var name = initial`.

Declares a persistent value that **does not roll back** when the newest bar is
executed again.

```
live var ticks = 0
ticks = ticks + 1
```

A plain `var` is restored, before each re-execution of the moving bar, to what it
held at the end of the previous bar, so executing that bar ten times gives the same
answer as executing it once. `live var` opts out of that, which is what counting
updates actually needs. It is spelled with an extra word because a script that uses
it produces different numbers live than in a backtest, and the reader should see
that coming from the declaration.

## map

**Reserved and unused in version 1.**

Intended as `map<K, V>` with `string` and `number` keys, with iteration order
defined as insertion order so a script using one stays deterministic across
engines.

## matrix

**Reserved and unused in version 1.**

Intended as a two-dimensional numeric container with the row and column operations
that correlation and regression studies need.

## none

**Form:** `none`, a literal.

The absent value. It has its own type, and that type is a member of every other
type: a `series number` may hold `none` on any bar.

```
plot(ready ? value : none, "Value", aqua)
```

`none` is the whole of warmup, the whole of division by zero, and the whole of
"this bar had no data". It propagates through arithmetic and through `<`, `<=`,
`>`, `>=`, and it does **not** propagate through `==` and `!=`, which are total and
always answer `true` or `false`. That exception exists so a script can ask the
question at all: `x == none` and `isNone(x)` mean the same thing.

## not

**Form:** `not x`, a unary operator.

Boolean negation, right associative, at the same precedence as unary minus.
`not none` is `none`.

```
if not pos.isFlat and session.isLastBar
    close()
```

`!` is not an operator. Writing `!cond` is OS1001 with the fix naming `not cond`.

## number

**Form:** `number`, in a type annotation.

Names the numeric type: an IEEE-754 binary64 value that is always finite. There is
no integer type, so a length, a bar count and a price are all the same type and no
conversion exists to get wrong.

```
fn band(src: series number, len: number = 20, mult: number = 2) =>
    sma(src, len) + mult * stdev(src, len)
```

A function that requires a whole number rejects a fractional one with OS3004
instead of truncating it, because a length of 14.5 is a bug in the script and
rounding it hides the bug. See the known conflicts: the library also documents a
conversion function spelled `number(s)`.

## or

**Form:** `a or b`, a binary operator.

Boolean disjunction over three-valued logic. It short-circuits: `b` is evaluated
only when `a` is not `true`.

```
newDay = bar.isFirst or not date.isSameDay(time, time[1])
```

That line is the short-circuit doing real work: on bar 0, `time[1]` is absent, and
the right operand is never evaluated because `bar.isFirst` already decided the
answer. `||` does not exist.

## return

**Form:** `return expression`, or bare `return`.

Exits a function immediately with that value, or with `none` when bare.

```
fn clampTo(x, lo, hi) =>
    if x < lo
        return lo
    if x > hi
        return hi
    x
```

A function whose last statement is a bare expression returns that expression, so
the explicit form is needed only for an early exit. Both forms exist because the
one-line `fn` needs the implicit version and an early exit needs the explicit one.

`return` outside a function has no meaning and is a syntax error.

## series

**Form:** `series T`, in a type annotation.

Marks a parameter or a declaration as carrying one value per bar. Inside the
function, `[]` on that parameter reads the history of the expression the caller
passed, which is why a helper such as `fn change(src) => src - src[1]` works at all.

```
fn band(src: series number, len: number = 20) => sma(src, len)
```

The specification reserves `series` in any position other than a type annotation
for a later version.

## step

**Form:** `step n`, the third clause of the counted `for`.

Sets the loop's increment. It defaults to `1`, and a descending loop must say so.

```
for i = size(zones) - 1 to 0 step -1
    if aged(i)
        remove(zones, i)
```

Walking a list downwards with `step -1` is the standard shape for removing elements
while iterating, because removing an element shifts everything after it and an
ascending walk would skip the next one. Making a descending loop say `step -1`
costs one word and removes the only shape of `for` loop that can spin forever by
accident. The library also documents `step` as a named argument on a number
input, and that is correct code for the same reason `color = aqua` is: a named
argument label is matched against the callee's parameter list rather than looked
up as a name, so a reserved word is legal there.

## string

**Form:** `string`, in a type annotation.

Names the string type: a sequence of Unicode code points. A string literal is
delimited by double or single quotes, which mean exactly the same thing, so a
string containing one kind of quote needs no escapes.

```
fn tag(prefix: string, value: number) => prefix + " " + text(value, 2)
```

There is no implicit conversion: `"count: " + 5` is OS2003, and the fix is
`"count: " + text(5)`.

## strategy

**Form:** `strategy("Name", options...)`, the file's declaration.

Declares a file that plots and also places orders. It accepts every option `study`
accepts and adds the trading options.

```
strategy("EMA cross", overlay = true, capital = 500000, qty = 1, qtyType = "lots")
```

Exactly one declaration per file, and it is the first statement after the optional
`version` line and any leading comments. A missing declaration is OS2007 and two
declarations are OS2008. One file carries one declaration because two would need a
rule for whose `overlay` wins, and the answer to that question is always that there
should only have been one.

## study

**Form:** `study("Name", options...)`, the file's declaration.

Declares a file that computes and draws but places no orders. Calling an order
function from a `study()` file is OS7001.

```
study("RSI", precision = 2, range = [0, 100])
```

All option values must be compile-time constants: literals, arithmetic over
literals, or a call to `input()`. An option that depends on a bar's data is OS3003,
because a settings dialog and a legend are built before the first bar runs.

## switch

**Form:** `switch subject` or bare `switch`, a block header.

A statement, never an expression. The value form compares a subject against each
`case`; the condition form takes the first arm whose condition is true.

```
switch
    case rsiValue > 70
        zone = "high"
    case rsiValue < 30
        zone = "low"
    default
        zone = "mid"
```

Because a name first assigned inside a block is local to that block, a name the
arms set must be declared before the `switch`. That is deliberate: it makes the
"declared in one arm only" bug impossible to write.

An expression form of `switch` is not in version 1. The ternary covers choosing a
value, and a statement form that is sometimes an expression doubles the grammar for
a small gain.

## to

**Form:** `for i = start to end`.

Separates the bounds of a counted loop. **Both ends are inclusive**, so
`for i = 0 to 9` runs ten times.

```
for i = 1 to 20
    total += close[i]
```

## true

**Form:** `true`, a literal.

The other value of type `bool`.

```
study("Overlay study", overlay = true)
```

## type

**Reserved and unused in version 1.**

Intended for user-declared record types and the field access that goes with them.
Its absence is why `draw.polyline` takes two parallel arrays of times and prices
rather than one array of points.

## var

**Form:** `var name = initial`, optionally `var name: T = initial`.

Declares a value that is initialised once, on the first bar control reaches the
declaration, and then keeps whatever value it holds from bar to bar.

```
var barCount = 0
barCount = barCount + 1
```

Without `var`, a name is recomputed fresh every bar, and
`barCount = barCount[1] + 1` is absent on bar 0 and therefore absent forever
after, because absence propagates through the addition. That is the problem
`var` exists to solve.

Details worth knowing:

- The initialiser runs **once**. If the declaration sits inside an `if` that is
  false for the first hundred bars, the value is absent for those bars and is
  initialised on bar 100.
- `var` may appear at the top level, inside a block or inside a function.
- A `var` inside a block is still scoped to that block. Persistence and scope are
  separate questions: `var` says how long the value lives, the block says where the
  name can be seen.
- `var` obeys the rollback rule on the moving bar. `live var` does not.
- The declaration and the assignment are one statement. `var barCount` with no
  initialiser is OS1011, and the fix names `var barCount = none`.

## while

**Form:** `while condition`, a block header.

Repeats its block while the condition holds, re-evaluated before each iteration,
with the same `bool` or `none` rule as `if`.

```
i = 0
while i < size(prices) and prices[i] < close
    i += 1
```

Every iteration of every loop counts against a per-bar budget of 2,000,000
iterations by default. Exceeding it is OS5001, which stops the bar and marks the
study as errored rather than silently breaking out, because a loop that ran two
million times and then stopped produces a plausible wrong number, and a plausible
wrong number is worse than no number. Raise it deliberately with
`limits(loops = 50_000_000)` on the line immediately after the declaration.

---

## What a keyword may not be used for

A reserved word may not be:

| Used as | Instead of |
|---|---|
| A variable name | `var` and `series` are tempting names for a holding variable. Rename to `state` or `values` |
| A function name | `fn max(a, b)` fails twice: `max` is a built-in as well |
| A parameter name | A parameter named `step` or `color` is a syntax error before the shadowing rule is even reached |
| A field or member name | `x.type` is not available in version 1 |

The specification states the prohibition and does not name a specific error code
for it. Expect a syntax error in the OS1xxx range, reported at the word.

**A named argument label is the one place a reserved word is legal**, and it is
not an exception to the table above: the label in `f(label = value)` is matched
against the callee's parameter list and is never looked up in any scope, so it is
not a name at all and the table does not reach it. `plot(x, "X", color = aqua)`
and `psar(start = 0.02, step = 0.02)` are both ordinary correct code. The rule
stops at the label. A parameter of a user function is an ordinary identifier,
because the body refers to it, so `fn f(color = red)` is OS1019.

Note that this is a **different** error from assigning to a built-in. `close`,
`ema`, `plot` and `aqua` are not reserved words: they are ordinary names in the
global scope. Assigning to one is an attempt to declare a second name of the same
spelling in an inner scope, and the language has no shadowing, so it is OS2002 and
the message names the built-in and suggests another name.

```
version 1

study("Names")

// var    = 1        // syntax error: var is a reserved word
// close  = 5        // OS2002: close is a built-in series
closing  = 5         // fine: an ordinary file-scope name
plot(closing, "Five", silver)
```

---

## Words that are grammar but not keywords

Two words appear in the grammar and are not in the reserved list.

| Word | Form | What it does |
|---|---|---|
| `version` | `version 1`, the first non-blank, non-comment line | Declares the language version the file was written for |
| `limits` | `limits(loops = ..., history = ...)`, immediately after the declaration | Raises the per-bar loop budget or the retained series depth |

`version` is a bare statement rather than a function call, so a host can read it
with a one-line scan and pick a front end before any parsing happens. It is
optional: with no declaration the file is compiled with the newest language version
the compiler implements and the compiler emits warning OS8003 suggesting the line
to add.

`limits()` is optional, appears at most once, and its arguments must be literal
numbers. A host may refuse a `limits()` call that exceeds what it is willing to run
and must say so with OS5003 rather than quietly capping it.

**The specification does not say what happens if a script uses `version` or
`limits` as a variable name.** Neither is reserved, and neither is a global
function that shadowing rules would cover. Avoid both as names until it does.

---

## Known conflicts in the specification

Two reserved words are also spelled as something a script is documented as
writing, and the grammar as published does not allow both. These are recorded here
because a dictionary that quietly picks a side is worse than one that names the
disagreement.

| Word | Reserved as | Also documented as | The problem |
|---|---|---|---|
| `number` | A type name | The conversion function `number(s)` | A call requires an identifier, and a reserved word is not one |
| `bool` | A type name | The conversion function `bool(x)` | The same |

The resolution is a specification change, not a script workaround: either these two
words leave the reserved list, neither being needed as a keyword outside a type
annotation, or the functions are renamed. Until one of those happens, treat any
code that depends on the overlap as unsettled.

**Two words that used to be on this list are not conflicts and never needed to
be.** `color` and `step` appear in the library only as named argument labels, and
a label is settled: `language.md` 3.4 says it is matched against the callee's
parameter list and never looked up in a scope, so a reserved word is legal as one
and the compiler accepts it. Nothing about `color = aqua` or `step = 0.02` is
unsettled, and code using either is code you can write today.

---

## See also

- [variables.md](./variables.md) for the built-in names that are not reserved words
- [constants.md](./constants.md) for the named colours and the fixed string vocabularies
- [operators.md](./operators.md) for `and`, `or` and `not` in their operator form
- [../README.md](../README.md) for the documentation index
- [../../spec/language.md](../../spec/language.md) for the reserved list and the grammar
- [../../examples/README.md](../../examples/README.md) for scripts that use every one of these words
