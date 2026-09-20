# Variables and scope

By the end of this page you will be able to say, for any name in a script, where
it was declared, what it is visible to, whether it survives into the next bar,
and which of the two things a given assignment is doing: creating a name, or
updating one that already exists.

## A name is declared by its first assignment

There is no declaration keyword for an ordinary name. The first assignment in a
scope creates the name; every later assignment updates it.

```
version 1

study("Spread", precision = 2)

spread = high - low             // declares spread
spread = spread / close * 100   // updates it, in percentage terms

plot(spread, "Spread, percent of price", aqua, width = 2)
```

Two rules follow immediately, and both are worth stating before anything else.

**A name's type is fixed by its first assignment.** Assigning a different type to
it later is OS2003, even when the two lines are pages apart. A name is one thing
for the life of the script, which is what lets a reader look at one line and know
what it holds without tracing every branch that reached it.

```
len = 14
len = "fourteen"        // OS2003
```

**A name must be assigned above the line that reads it.** The file is the body of
the per-bar loop and it runs top to bottom, so reading a name before its
assignment is OS2001, not an absent value. There is one exception, functions,
which is covered below.

## A plain assignment is recomputed every bar

A name assigned without `var` is computed fresh on every bar. Its previous value
is still readable through the history operator, but it is not the starting point
for this bar's computation.

```
seen = seen + 1         // OS2001: seen is not defined yet on this bar
seen = seen[1] + 1      // legal, and absent on bar 0, and absent for ever after
```

The second line is the clearest demonstration of why `var` exists. On bar 0 there
is no previous bar, `seen[1]` is absent, the addition propagates absence, and
every later bar reads an absent predecessor. One absent bar at the start poisons
the whole run.

## var: a value that survives the bar

`var name = initial` declares a value that is initialised once and then keeps
whatever it holds from bar to bar.

```
var seen = 0
seen = seen + 1         // 1, 2, 3, ...

var highestSeen = none
if isNone(highestSeen) or high > highestSeen
    highestSeen = high
```

The details, all of them decided rather than incidental:

| Rule | Consequence |
|---|---|
| The initialiser runs once, on the first bar control reaches the declaration | A `var` inside an `if` that is false for a hundred bars is absent for those bars and is initialised on bar 100 |
| `var` may appear at the top level, inside a block, or inside a function | Persistence is available wherever a value is |
| A `var` inside a block is still scoped to that block | Persistence and visibility are separate questions |
| `var` obeys the rollback rule | Executing the newest bar ten times gives the same answer as executing it once |
| The declaration and the first assignment are one statement | `var seen` on its own is OS1011, and the fix names `var seen = none` |

### The rollback rule, and why a running total is safe

The newest bar of a live chart is executed again on every update. Before each
re-execution, the engine restores every persistent value to what it held at the
end of the previous bar. The effect is that executing the moving bar twice gives
the same answer as executing it once.

```
version 1

study("Bars, not ticks")

var seen = 0
seen = seen + 1

// Counts bars even on a live chart, because the counter rolls back before the
// newest bar is executed again. Without that rule this study would report a
// different number on a chart than in a backtest of the same data, and the
// whole point of one script for both would be gone.
plot(seen, "Bars seen", aqua, width = 2)
```

`live var` is identical except that it does not roll back, so it survives the
re-execution of the moving bar. It exists for one purpose, counting or
accumulating over intrabar updates, and it is spelled with an extra word because
a script that uses one produces different numbers live than in a backtest. The
compiler says so with warning OS8011.

### History and persistence are different questions

These two are often confused and are unrelated. History is a read of the past.
Persistence is a value that carries forward.

| Written | Means |
|---|---|
| `close[1]` | History: what `close` was one bar ago |
| `var x = 0` | Persistence: `x` survives into the next bar |
| `x[1]` | Both: what the persistent `x` was one bar ago |

A useful consequence: at any point in the file, a `var` still holds the previous
bar's value until the line that reassigns it. That is why a band that trails its
own previous value can be written without a single history read:

```
var trail = none
prev = trail            // the band as it stood one bar ago
trail = ...             // this bar's band
```

## The three scopes

| Scope | Holds | Created by |
|---|---|---|
| Global | The standard library, the built-in series, the colour names | The language |
| File | Every name assigned at the top level, and every `fn` | The file |
| Block | Names first assigned inside it | Each `if` block, each `else` block, each `for` or `while` body, each `case` or `default` arm, each function body |

A function's parameters live in its body's scope. Blocks nest, so a block inside a
block can see everything its enclosing blocks can see.

## Declaration versus update

This is the whole of scoping, in two sentences:

**A name is declared by its first assignment in a scope. An assignment to a name
that already exists in an enclosing scope updates that name and does not create a
new one.**

```
threshold = 70                  // declared in the file scope
if volatile
    threshold = 80              // updates the file scope name
plot(threshold, "Threshold", aqua)  // 80 on volatile bars
```

```
if volatile
    scratch = high - low        // declared in the block scope
plot(scratch, "Scratch", aqua)  // OS2001: scratch is not visible here
```

Together those two rules mean a reader never has to ask which of two variables a
line is writing to. There is exactly one `threshold`, and there is exactly one
place `scratch` can be read.

## What a name declared inside an if or a loop is visible to

Exactly this: **from its assignment to the end of the block it was first assigned
in, including any block nested inside that one.** Nothing else.

| Where it is first assigned | Visible to |
|---|---|
| The top level of the file | Every line below it, including inside every block and every function called from below it |
| Inside an `if` block | The rest of that block, and blocks nested inside it. Not the `else`, not a sibling `if`, not anything after the block ends |
| Inside an `else` block | The rest of that block only. The `if` block cannot see it and neither can anything after |
| Inside a `for` or `while` body | The rest of that body, on that iteration. The next iteration starts fresh |
| Inside a `case` or `default` arm | The rest of that arm. No other arm, and nothing after the `switch` |
| Inside a function body | The rest of that body |

Three consequences follow, and each of them catches somebody once.

**A name declared in an `if` cannot be read in the matching `else`.** They are two
blocks, not one.

**A name declared in a loop body does not accumulate across iterations.** It is a
fresh name each time round. To carry a value between iterations, declare it above
the loop.

**A name declared inside a block has no history.** History is retained for names
at the top level of the file, so `inner[1]` inside a block is OS2004 and the fix
is to name the value at the top level.

```
version 1

study("Body statistics", precision = 2)

lookback = input(20, "Lookback", min = 2, max = 500)

// Declared above the loop, because a name declared inside the body would be a
// fresh name on every iteration and would carry nothing between them.
total = 0.0
seen  = 0

for i = 0 to lookback - 1
    body = abs(close[i] - open[i])      // a fresh body on each iteration
    if isNone(body)
        continue
    total += body
    seen  += 1

meanBody = seen > 0 ? total / seen : none

plot(meanBody, "Mean body", aqua, width = 2)
```

## There is no shadowing

**Declaring a name in an inner scope when the same name already exists in an
enclosing scope is an error: OS2002.**

Since an assignment to an existing outer name updates it, shadowing could only be
requested by some explicit syntax, and no such syntax exists. Attempting it is
therefore always a mistake, and the compiler says so with the line of the outer
declaration in the message.

```
len = 20

fn smooth(src) =>
    len = 9                     // OS2002: len is declared at line 1
    sma(src, len)
```

```
len = 20

fn smooth(src) =>
    inner = 9                   // the fix is to rename
    sma(src, inner)
```

Shadowing is banned rather than allowed because the most expensive class of bug in
per-bar scripts is a value that is right in one place and stale in another, and
two different variables sharing one name is the shortest path to it.

A function parameter obeys the same rule. A parameter named after a file scope
name is OS2002, and so is a parameter named after a standard library function.

### Assigning to a built-in

Built-in names live in the global scope, so assigning to one is a shadowing
attempt and is OS2002 as well.

```
close = 5       // OS2002: close is a built-in series
ema   = 9       // OS2002: ema is a built-in function
```

The names that bite most often are the short, obvious ones a script wants for its
own values: `count`, `sum`, `avg`, `min`, `max`, `size`, `change`, `variance`,
`stdev`, `level`, `fill`, `signal`, `time`, `open`, `high`, `low`, `close` and
`volume`. When a name feels natural enough that the library probably took it, it
probably did. The error message names a replacement.

## Order of declaration, and the one exception

Within the file scope, a name must be assigned before it is read, reading top to
bottom, because the file is the body of a per-bar loop and the loop runs in source
order.

Functions are the exception. A `fn` may be called before its declaration appears,
because a function declaration is not a per-bar statement and the checker collects
every one of them before it checks any body.

```
version 1

study("Helper below", precision = 2)

plot(helper(close), "Smoothed", aqua, width = 2)

fn helper(src) => sma(src, 9)
```

The convention is still to declare functions near the top, but the language does
not require it, and a file that groups its plots at the top reads well.

## Loop variables

The loop variable is scoped to the loop and may not be assigned in the body. That
is OS2006, and the fix is `break` to leave early or a separate name for the value
the body changes.

```
for i = 0 to 9
    if close[i] > hi
        i = 9                   // OS2006
```

```
for i = 0 to 9
    if close[i] > hi
        break                   // what was meant
```

The `for x in arr` form scopes `x` the same way, and visits the indices `0` to
`size - 1` as measured when the loop is entered.

## switch arms declare nothing that outlives them

Because a name first assigned inside a block is local to that block, a name the
arms of a `switch` set must be declared before the `switch`. This is deliberate:
it makes the "declared in one arm only" bug impossible to write.

```
version 1

study("Selectable length", overlay = true, precision = 2)

method = input("medium", "Speed", options = ["fast", "medium", "slow"])

// Declared here, so it exists whatever the switch does, and so a reader can see
// the default without reading every arm.
len = 21

switch method
    case "fast"
        len = 9
    case "slow"
        len = 50

plot(sma(close, len), "SMA", aqua, width = 2)
```

## Names inside a function

A function body is a block scope. Its parameters are in that scope, and anything
it assigns is local to it. A function may read file scope names, and the
no-shadowing rule means it can never accidentally declare a second one.

A function body may contain `var`, and may call library functions that hold state
of their own. **State is allocated per call site, not per function**, so two calls
in two places are two independent pieces of state, which is what makes a stateful
helper reusable at all.

```
version 1

study("Bars since", precision = 0)

fn sinceTrue(cond) =>
    var n = none
    if cond
        n = 0
    else if not isNone(n)
        n = n + 1
    n

sinceUp   = sinceTrue(close > open)         // its own counter
sinceHigh = sinceTrue(high > high[1])       // a separate counter

plot(sinceUp,   "Bars since an up close", aqua)
plot(sinceHigh, "Bars since a higher high", orange)
```

Two consequences of per-call-site state are worth knowing before you need them. A
call inside a loop shares one state slot across every iteration, because the call
site is one site. And recursion is not allowed, because state slots are allocated
statically; a function that calls itself is OS2005, and the fix is a loop.

## Patterns worth copying

### Declare above, refine inside

Give a name its "we do not know yet" value above the branch that refines it. This
is the fix for warning OS8004, and it makes warmup an explicit state rather than
an accident.

**Not raised yet.** OS8004 is in the catalogue and nothing raises it: the
checker does not follow which names a branch on a possibly absent condition
assigns.

```
zone = "unknown"
if not isNone(r)
    zone = r > 70 ? "high" : (r < 30 ? "low" : "mid")
```

### Reset on the session, not on the date

State that belongs to a trading day resets on the session's first bar. A session
is what an exchange opens; a calendar day is not, and an evening session that runs
past midnight is one session and two dates.

```
version 1

study("Session extremes", overlay = true, precision = 2)

var sessionHigh = none
var sessionLow  = none

if session.isFirstBar
    sessionHigh = high
    sessionLow  = low
else
    sessionHigh = max(orElse(sessionHigh, high), high)
    sessionLow  = min(orElse(sessionLow,  low),  low)

plot(sessionHigh, "Session high", aqua,   width = 2, style = "step")
plot(sessionLow,  "Session low",  orange, width = 2, style = "step")
```

### Store a time, not a bar index

`bar.index` is a position in the data the engine was given, not an address.
Loading more history renumbers every bar, so a stored index compared later is
being compared against something that moved underneath it. The compiler warns with
OS8014 when a persistent value holds one.

**Not raised yet.** OS8014 is in the catalogue and nothing raises it: the
checker does not follow a bar index into a persistent value.

```
var entryTime = none            // survives more history being loaded
if enterLong
    entryTime = time
```

Subtracting two indices produced in the same run is still fine, because both came
from the same numbering.

### Keep the parallel arrays a drawing needs

A drawing object can be written to and deleted but not read back, so a script that
has to decide later whether a zone is still valid keeps its own numbers alongside
the objects, in `var` arrays that persist and roll back with everything else.

## Naming

The convention, which the language does not enforce, is `camelCase` for names and
functions and `UPPER_SNAKE` for values a script treats as constants. Identifiers
are ASCII, begin with a letter or an underscore, and are case sensitive.

The reserved words cannot be used as names: `and`, `array`, `as`, `bool`, `break`,
`case`, `color`, `continue`, `default`, `else`, `false`, `fn`, `for`, `if`,
`import`, `in`, `is`, `live`, `map`, `matrix`, `none`, `not`, `number`, `or`,
`return`, `series`, `step`, `string`, `strategy`, `study`, `switch`, `to`, `true`,
`type`, `var`, `while`. Some of those are reserved for later versions and do
nothing today; they are reserved now so that adding them later cannot break a
script that used one as a name.

## The errors and warnings you are likely to meet

| Code | Means | Usual fix |
|---|---|---|
| OS2001 | The name is not defined at this point in the file | Assign it above this line, or correct the spelling |
| OS2002 | The name already exists in an enclosing scope | Rename the inner one, or drop the declaration and let the assignment update the outer one |
| OS2003 | The name changed type | Use a second name |
| OS2004 | The value has no history | Name the per-bar number at the top level of the file, and read that name |
| OS2005 | A function calls itself | Write a loop |
| OS2006 | The loop variable was assigned in the body | `break`, or keep a separate name |
| OS1011 | `var` with no initial value | `var name = none` is the empty start |
| OS8004 | A branch on an absent condition changes a value read later | Give the name a starting value above the `if` |
| OS8010 | A name is assigned and never read | Use it, or delete the line |
| OS8011 | A `live var` makes live and backtest differ | Use `var` unless counting intrabar updates is the intent |
| OS8014 | A persistent value holds a bar index | Store `time` instead |

**Not raised yet.** OS8004 and OS8014 are in the catalogue and nothing raises
them. The checker does not follow which names a branch on a possibly absent
condition assigns. The checker does not follow a bar index into a persistent
value.

## See also

- [types-and-values.md](./types-and-values.md) for what a name can hold, and why its type is fixed by the first assignment
- [absent-values.md](./absent-values.md) for the absent value that `var` exists to keep out of a running total
- [control-flow.md](./control-flow.md) for the blocks that create the scopes on this page
- [operators.md](./operators.md) for assignment, compound assignment and the history operator
- [persistence.md](./persistence.md) for `var` and the rollback rule in full
- [functions.md](./functions.md) for parameters, defaults and state held per call site
- [../README.md](../README.md) for the documentation index
- [../../spec/language.md](../../spec/language.md) sections 8 and 12 for the specification of persistence and scope
- [../../examples/](../../examples/) for twelve working scripts
