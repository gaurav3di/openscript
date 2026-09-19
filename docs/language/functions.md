# Functions

By the end of this page you can write your own function, give its parameters
types and defaults, return more than one value from it, and predict exactly what
a function that remembers something between bars will do at every place you call
it.

A function in OpenScript is a name for a computation. It is not a value, it is
not an object, and it cannot be passed around. It is a way of saying a thing
once and reading it in several places, and of putting a fix in one line instead
of four.

## On this page

- [The two forms](#the-two-forms)
- [Where a function may appear](#where-a-function-may-appear)
- [Parameters, defaults and named arguments](#parameters-defaults-and-named-arguments)
- [Series parameters, and history inside a function](#series-parameters-and-history-inside-a-function)
- [Returning a value](#returning-a-value)
- [Returning more than one value](#returning-more-than-one-value)
- [Scope inside a function](#scope-inside-a-function)
- [A function that remembers: state is per call site](#a-function-that-remembers-state-is-per-call-site)
- [The bug this causes](#the-bug-this-causes)
- [A call inside a loop is still one call site](#a-call-inside-a-loop-is-still-one-call-site)
- [A call site that does not run](#a-call-site-that-does-not-run)
- [Recursion is not allowed](#recursion-is-not-allowed)
- [The errors you will meet](#the-errors-you-will-meet)

## The two forms

A function is declared with `fn`. There is a single-line form, where everything
after `=>` is the value, and a multi-line form, where the body is indented under
the header and the last bare expression is the value.

```
fn typicalPrice() => (high + low + close) / 3

fn zscore(src, len) =>
    m = sma(src, len)
    s = stdev(src, len)
    (src - m) / s
```

Both forms exist because most helpers are one line, and a one-line helper that
had to be written across three lines would not get written at all.

Here is a whole study built on one helper.

```
version 1

study("Z score", precision = 2)

len  = input(50, "Length", min = 5, max = 500)
band = input(2,  "Band", min = 1, max = 5)

// How many standard deviations the source sits from its own mean. Worth a
// function because the script asks the question of two different sources, and
// because the name says what the arithmetic means.
fn zscore(src, n) =>
    m = sma(src, n)
    s = stdev(src, n)
    (src - m) / s

level(0, "Mean", gray)
level(band, "Upper", fade(red, 50))
level(0 - band, "Lower", fade(lime, 50))

plot(zscore(close, len), "Close", aqua, width = 2)
plot(zscore(hlc3, len), "Typical price", orange)
```

Two things in that script are worth noticing now, because they come up again
further down. The two calls to `zscore` are two independent call sites, each
with its own copy of everything `sma` and `stdev` remember. And on a window
where price never moved, `s` is zero, the division produces the absent value
rather than an error or an infinity, and the plot draws a gap on exactly those
bars. Neither of those is an accident; both are explained below and in
[the absent value](../../spec/language.md#6-the-absent-value).

## Where a function may appear

| Rule | Code when broken | Why the rule exists |
|---|---|---|
| A function is declared at the top level of the file | OS1003 or OS2001 | The set of functions is fixed before bar 0, like the set of plots |
| Functions may not be nested | OS1003 | A nested function would capture names from an enclosing bar-local scope, and there is no rule that would make that readable |
| A function may be called before its declaration | not an error | Declarations are collected before bodies are checked, so helpers may sit at the bottom of the file |
| A function name may be declared once | OS2017 | Two bodies under one name means a reader cannot tell which one a call reaches |
| A function is not a value | OS2014 | Version 1 has no function values, so `src = ema` is an error with a fix, not a silent handle |
| A function may not call itself | OS2005 | State is allocated per call site before the first bar, so a recursive call has nowhere to put its state |

The one that surprises people is the third. This compiles:

```
version 1

study("Helper below", overlay = true)

plot(smoothed(close), "Smoothed", aqua)

fn smoothed(src) => ema(src, 9)
```

Put your helpers wherever the file reads best. Per-bar statements run in source
order, so a name must be assigned before it is read; a function declaration is
not a per-bar statement, so it does not have to be.

## Parameters, defaults and named arguments

Parameters may carry a type annotation, a default value, both, or neither.

```
fn band(src: series number, len: number = 20, mult: number = 2) =>
    basis = sma(src, len)
    dev = mult * stdev(src, len)
    basis + dev
```

An annotation is optional and is checked when it is there. Without one, the type
is inferred from how the parameter is used and from what the call sites pass.
Write annotations on anything another person will call, because the annotation
is the only part of a function a reader sees before the body, and leave them off
a three-line private helper if they add nothing.

The types you can write are `number`, `string`, `bool`, `color` and
`array<T>`, with `series` in front where a per-bar value is meant. There is no
integer type, so a length is a `number` like everything else; writing `int` is
OS2016 with a fix naming `number`.

At a call site, arguments may be positional, named, or positional followed by
named.

| Call | Legal | Means |
|---|---|---|
| `band(close)` | yes | `len` is 20, `mult` is 2 |
| `band(close, 50)` | yes | `len` is 50, `mult` is 2 |
| `band(close, mult = 3)` | yes | `len` stays 20, `mult` is 3 |
| `band(src = close, len = 50, mult = 3)` | yes | Every argument named |
| `band(close, len = 20, 3)` | no, OS3005 | A positional argument after a named one |
| `band(close, 50, 2, 1)` | no, OS3001 | Wrong argument count |
| `band(close, multiple = 3)` | no, OS3002 | Unknown name; the message lists the names that exist |
| `band(close, 50, len = 30)` | no, OS3013 | `len` given twice |

Named arguments after the first one or two positional arguments are how a call
stays readable when a function grows a third and fourth option. Defaults live in
the signature rather than in the body, so the options a caller may leave out are
visible without opening the function.

## Series parameters, and history inside a function

A parameter whose type is a series accepts the caller's expression, and `[]`
inside the function reads the real history of that expression.

```
fn barChange(src) => src - src[1]

plot(barChange(hlc3), "Change", aqua)
```

The engine retains the per-bar values of `hlc3` for that call site, so `src[1]`
inside the body is the previous bar's typical price and nothing has to be
precomputed by hand. On bar 0 there is no previous bar, `src[1]` is absent, the
subtraction propagates absence and the plot starts at bar 1.

Two limits are worth learning now, because both produce an error that reads
strangely if you do not know the rule.

**A local name inside a function body has no history.** `[]` works on a built-in
series, on a name declared at the top level of the file, on a call to a function
that returns a series, and on a series parameter. A name first assigned inside
a block or a function body is none of those, and `[]` on it is OS2004.

```
fn wrong(src) =>
    mid = (src + src[1]) / 2
    mid - mid[1]                    // OS2004: mid has no history

fn right(src) =>
    mid = (src + src[1]) / 2
    mid - (src[1] + src[2]) / 2     // the history comes from the parameter
```

History costs memory for every bar of the dataset. Retaining it for every
temporary inside every function body would mean a script that cannot run fifty
thousand bars in a browser tab, so the language retains it where a script asked
for it by name and nowhere else. When a function really needs the history of
something it computed, compute it at the top level of the file, give it a name
there, and pass it in.

**A plain value is broadcast into a series parameter.** Passing `9` where a
`series number` is expected means nine on every bar, so a function written for
series works with literals, with inputs and with per-bar lengths without three
signatures.

## Returning a value

If the last statement of the body is a bare expression, that expression is the
return value. A `return expression` statement exits immediately with that value,
and a bare `return` exits with the absent value.

```
fn positionStop(side, entry, distance) =>
    if isNone(entry) or isNone(distance)
        return none
    if side > 0
        return entry - distance
    entry + distance
```

Use the implicit form for the ordinary path and `return` for a guard at the top.
A function whose body ends in something other than an expression, and which
never reaches a `return`, returns the absent value, which is usually a bug the
plot will show you as a line that never starts.

## Returning more than one value

A function with more than one output returns an `array<number>` holding this
bar's outputs, in a documented order. The standard library does exactly this:
`macd` returns `[macd, signal, histogram]` and `bollinger` returns
`[basis, upper, lower]`. Your own functions should follow the same convention,
because a reader who has met one has met all of them.

```
version 1

study("Deviation bands", overlay = true, precision = 2)

len  = input(20, "Length", min = 2, max = 500)
mult = input(2,  "Deviation multiple", min = 1, max = 5)

// Returns [basis, upper, lower]. The order is documented here and does not
// change, because callers read these by index and an index has no name.
fn bands(src, n, k) =>
    basis = sma(src, n)
    dev   = k * stdev(src, n)
    [basis, basis + dev, basis - dev]

// Read the elements into names at the top level immediately. Names are what
// the rest of the file should use, and a top-level name has history.
b     = bands(close, len, mult)
basis = b[0]
upper = b[1]
lower = b[2]

top = plot(upper, "Upper", aqua)
bottom = plot(lower, "Lower", aqua)
plot(basis, "Basis", orange, width = 2)
fill(top, bottom, fade(aqua, 90))

// Widening or narrowing, computed from a name that has history.
plot(upper - lower, "Width", purple, scale = "left")
```

Three rules make this convention safe.

**The array is never absent and never changes length.** The three elements exist
on bar 0, each holding the absent value until its own warmup completes. An array
that grew as warmup finished would make `b[2]` an out-of-range error at the left
edge of the chart only, which is the worst place for a bug to live.

**One function, not three.** Three separate functions would be three call sites,
each with its own copy of the smoothing state, so the shared work would be
computed three times per bar for one picture.

**`b[1]` is an element, not a bar.** On an array, `[]` is element access; on a
series it is history. When a line is doing both, write the explicit forms:
`element(b, 1)` is always element 1, and `history(b, 1)` is always the whole
array as it stood one bar ago.

## Scope inside a function

A function body is a block scope, nested inside the file scope, which is nested
inside the global scope where the standard library lives. Two rules follow, and
together they are the whole of scoping.

A name first assigned inside the body belongs to the body and cannot be read
outside it. And a name that already exists in an enclosing scope may not be
declared again in an inner one: that is OS2002, and it applies to a parameter
just as much as to a local.

```
len = 20

fn helper(src) =>
    len = 9                 // OS2002: len is declared at line 1
    sma(src, len)
```

Shadowing is banned rather than allowed because the most expensive bug in a
per-bar script is a value that is right in one place and stale in another, and
two variables sharing one name is the shortest road to it. The fix is to rename,
which the error message suggests.

A function body can read a file-scope name, since the file scope encloses it.
Prefer not to. A function that reads only its parameters can be moved, tested
and later lifted into a library without carrying the rest of the file with it,
and a reader can understand it from its own text. A function that reaches out to
a file-scope name is a function whose answer depends on where in the file it is
called from.

## A function that remembers: state is per call site

A function body may declare `var`, and may call library functions that keep
state of their own, such as `ema`, `rma`, `barsSince` or `cum`. Either makes the
function stateful.

**State is allocated per call site, not per function. Two calls in two places
are two independent pieces of state.**

```
fn since(cond) =>
    var n = none
    if cond
        n = 0
    else if not isNone(n)
        n = n + 1
    n

sinceUp   = since(close > open)         // its own counter
sinceHigh = since(high > high[1])       // a separate counter
```

This is what makes a stateful helper reusable at all. If the two calls shared
one `n`, the second call would corrupt the first and the function could be used
exactly once per script.

The mechanism is worth knowing, because it explains every consequence below. The
compiler walks the source once and gives each call site its own base offset into
the program's table of persistent cells and its own base offset into the table
of library state regions. Nothing is allocated while a bar runs. That is why
this rule is cheap, and it is also why recursion cannot be allowed: a recursive
call would need a stack of state regions whose size is not known until the bar
runs.

## The bug this causes

The rule bites when a reader assumes the opposite: that a function holding a
counter holds one counter for the whole script.

```
version 1

strategy("Tagged entries", overlay = true)

fastLen = input(9,  "Fast", min = 1, max = 500)
slowLen = input(21, "Slow", min = 2, max = 500)

fast = ema(close, fastLen)
slow = ema(close, slowLen)

// This looks like one counter for the file. It is not.
fn nextTag() =>
    var n = 0
    n += 1
    "T" + text(n, 0)

if crossUp(fast, slow)
    buy(qty = 1, tag = nextTag())       // counts 1, 2, 3, ...

if crossDown(fast, slow)
    sell(qty = 1, tag = nextTag())      // also counts 1, 2, 3, ...
```

The first long entry is tagged `T1`. So is the first short entry. The second of
each is `T2`, and so on, for as long as the strategy runs. Tags are how a script
names one part of a position later, so `close(tag = "T1")` is now ambiguous, and
`exit(tag = "T2", ...)` attaches a bracket to whichever leg happens to carry
that tag. Nothing errors. The backtest report simply shows exits landing on
positions they were not meant for, and the cause is four lines away from the
symptom.

The compiler does warn here, twice, with OS8001: each `nextTag()` sits inside a
branch, so each counter advances only on the bars its branch runs. That warning
is the thread to pull, but the tag collision is the real defect and the warning
does not name it.

The fix is to decide, deliberately, where the state belongs.

```
version 1

strategy("Tagged entries", overlay = true)

fastLen = input(9,  "Fast", min = 1, max = 500)
slowLen = input(21, "Slow", min = 2, max = 500)

fast = ema(close, fastLen)
slow = ema(close, slowLen)

// One counter, in the file scope, where there is exactly one of it.
var tagSeq = 0

// A pure function: no var, no stateful call, so its two call sites share
// nothing and cannot drift apart.
fn tagFor(n) => "T" + text(n, 0)

if crossUp(fast, slow)
    tagSeq += 1
    buy(qty = 1, tag = tagFor(tagSeq))

if crossDown(fast, slow)
    tagSeq += 1
    sell(qty = 1, tag = tagFor(tagSeq))
```

The rule to carry away:

| The state must be | Put it in | Because |
|---|---|---|
| Shared by the whole script | A `var` at the file scope | There is exactly one file scope, so there is exactly one of it |
| Independent per use | A `var` inside the function | Each call site gets its own copy, which is the point of the rule |
| Independent per element of a list | An array the script owns, indexed | A call site is one site however many times a loop runs it |

## A call inside a loop is still one call site

A loop body is written once, so a call in it is one call site, so it has one
piece of state that every iteration writes into. That is exactly right for a
running accumulation over a loop, and exactly wrong when the reader wanted one
counter per element.

```
version 1

study("One site, three questions", precision = 0)

// A counter that lives from bar to bar.
fn countIf(cond) =>
    var n = 0
    if cond
        n += 1
    n

// Three questions, asked through one call site.
tests = [close > open, high > high[1], volume > volume[1]]

// Wrong. Every iteration writes into the same n, so this is the total of all
// three conditions, returned three times per bar and kept once.
shared = 0
for i = 0 to size(tests) - 1
    shared = countIf(element(tests, i))

// Right. The state is an array the script owns, indexed by the iteration, so
// each question has its own counter.
var counts: array<number> = [0.0, 0.0, 0.0]
for i = 0 to size(tests) - 1
    if element(tests, i)
        set(counts, i, element(counts, i) + 1)

plot(shared, "One counter, three questions", red)
plot(element(counts, 0), "Up bars", aqua)
plot(element(counts, 1), "Higher highs", orange)
plot(element(counts, 2), "Rising volume", purple)
```

Run that and the red line is roughly the sum of the other three, which is the
tell. When you want state per element, the element index has to appear
somewhere, and an array is where it appears.

## A call site that does not run

**A call site that does not execute on a bar leaves its series absent for that
bar, and leaves its state untouched.** The state does not advance and the
previous value is not carried forward.

```
if trending
    e = ema(close, 20)      // advances only on trending bars
```

The alternatives are worse. Running the call anyway would execute code the
script said to skip. Carrying the last value forward would draw a flat line that
looks like data and is not. Absence is visible: the line breaks on exactly the
bars the call was skipped, and you can see the mistake on the chart.

Because this is almost always a mistake, the compiler emits OS8001 naming the
call. The fix is the same every time: compute it unconditionally at the top
level, and use the result inside the branch.

```
e = ema(close, 20)
plot(trending ? e : none, "EMA", aqua)
```

Note the shape of the fix. The branch moved from around the calculation to
around the value, and the study now plots a gap on non-trending bars instead of
a line built from a half-fed average.

## Recursion is not allowed

A function may not call itself, directly or through a cycle of functions. The
compiler reports OS2005 and names the cycle.

```
// OS2005
fn lookbackSum(n) =>
    if n <= 0
        return 0
    close[n] + lookbackSum(n - 1)

// Write the loop instead.
fn lookbackSum(n) =>
    total = 0.0
    for i = 0 to n
        total += close[i]
    total
```

The reason is the one from the previous section: state slots are allocated
statically, one per call site, before the first bar. A dynamic stack of them
would cost something on every bar of every script, to support a shape that a
per-bar language almost never needs. Loops here are also easier to reason about
and are covered by the per-bar loop budget, which recursion would not be.

## The errors you will meet

| Code | Means | Usual fix |
|---|---|---|
| OS2002 | A name or parameter shadows an enclosing one | Rename it; the message names the line of the outer declaration |
| OS2004 | `[]` on something with no history | Assign it to a name at the top level of the file first |
| OS2005 | A function calls itself | Write a loop |
| OS2014 | A function used as a value | Call it and use the result |
| OS2016 | Unknown type in an annotation | Use `number`, `string`, `bool`, `color` or `array<T>` |
| OS2017 | Two functions share a name | Rename one |
| OS2018 | A parameter name appears twice | Rename the second |
| OS3001 | Wrong argument count | Check the signature; defaults may let you pass fewer |
| OS3002 | Unknown named argument | The message lists the names that exist |
| OS3005 | A positional argument after a named one | Move the positional ones to the front |
| OS3013 | An argument given twice | Drop the positional one or the named one |
| OS8001 | A stateful call inside a branch | Compute it at the top level, branch on the value |

## See also

- [collections.md](./collections.md) for arrays, which is where per-element
  state lives when one call site is not enough
- [objects-and-methods.md](./objects-and-methods.md) for values a script
  creates and mutates over many bars
- [libraries.md](./libraries.md) for how a function moves out of a file, and
  what has to be true of it first
- [variables-and-scope.md](./variables-and-scope.md) for the declaration and
  shadowing rules a parameter is subject to
- [persistence.md](./persistence.md) for `var` and the rollback rule that
  keeps a stateful helper honest on a live chart
- [execution-model.md](./execution-model.md) for the per-bar loop that makes a
  call site a fixed place in the program
- [absent-values.md](./absent-values.md) for what a skipped call site leaves
  behind, and how to test for it
- [../README.md](../README.md) for the documentation index
- [../../spec/language.md](../../spec/language.md) sections 11 and 12 for the
  specification of functions and scope
- [../../spec/stdlib.md](../../spec/stdlib.md) for every function the library
  already provides, with its warmup
