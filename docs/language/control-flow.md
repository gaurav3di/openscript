# Control flow

By the end of this page you will be able to write every branching and looping
form the language has, know what each one does when its condition is absent, know
what stops a runaway loop and how to raise that limit deliberately, and recognise
the loops you should not be writing at all.

## The frame everything sits in

The file is the body of the per-bar loop. There is no main function, no event
handler and no entry point: for each bar in the dataset, in chronological order,
the engine runs every top-level statement from the first line to the last.

So every control form on this page runs **inside one bar**. An `if` decides what
happens on this bar. A `for` runs to completion within this bar. Nothing here
carries a value to the next bar; that is what `var` is for, and it has its own
page.

One consequence is worth stating at the top, because it is the single most common
mistake a new reader makes. `plot`, `fill`, `level`, `input` and `table` define
the fixed shape of the study, and that shape has to be known before bar 0 so the
legend, the axis and the settings dialog can exist. They may appear only at the
top level. Putting one inside an `if` is OS3006, and the way to hide output on
some bars is to give it the absent value.

```
plot(trending ? ema20 : none, "EMA 20", aqua)   // correct
if trending
    plot(ema20, "EMA 20", aqua)                 // OS3006
```

## Blocks are made of indentation

A block is introduced by a header line (`if`, `else`, `for`, `while`, `case`,
`default`, a multi-line `fn`) and consists of the following lines indented more
deeply than the header. The block ends at the first line indented the same as the
header or less. There is no brace form and no `end` keyword.

| Rule | If you break it |
|---|---|
| Indentation is spaces only | OS1002, with the fix "indent with spaces" |
| Every line of one block carries exactly the same leading whitespace | OS1003, even when the difference is one space |
| A block is indented strictly more deeply than its header | OS1003 |
| A header line has at least one indented line under it | OS1010 |

Tabs are rejected rather than expanded because the width of a tab is an editor
setting, so a file whose meaning depends on it is a file whose meaning changes
when someone else opens it. Four spaces is the convention and the formatter's
output, but any consistent amount is accepted. One layout rule means a diff shows
a logic change rather than a formatting argument.

## if, else if, else

```
if condition
    block

if condition
    block
else
    block

if condition
    block
else if condition
    block
else
    block
```

`else if` is written as two words on one line and does not increase indentation.

The condition must be a `bool` or the absent value. There is no truthiness: a
number is not a condition and neither is a string, and writing one is OS2011 with
a message naming the test you probably meant. Writing `=` where `==` was meant is
OS1006, because assignment is a statement and can never be a condition.

**A condition that evaluates to absent takes the false branch.** That is the one
place in the language where absence is absorbed rather than propagated, and it is
unavoidable, because execution has to go somewhere.

```
version 1

study("Strong bars", overlay = true)

len = input(20, "Volume average", min = 2, max = 500)

// sma is absent for the first len - 1 bars, so the comparison is absent, so
// neither branch runs there. That is the correct outcome: a bar cannot be
// strong or weak against an average that does not exist yet.
if close > open and volume > sma(volume, len)
    signal("STRONG")
else if close < open
    signal("WEAK")
```

Read that example once more and notice what the `else if` does **not** mean. It
does not mean "everything the first condition did not catch". During warmup the
first condition is absent and the second may be true, and after warmup a bar can
fail the first test for two different reasons. An `else` is not a proof of the
opposite when absence is in play.

The compiler watches for the shape where this silently changes an answer. If an
`if` whose condition can be absent assigns to a name that is read after the block,
that is warning OS8004, and the fix is to give the name a starting value above the
`if`.

```
// Warning OS8004: during warmup zone keeps whatever it held last bar.
if r > 70
    zone = "high"

// The fix: warmup gets a name of its own.
zone = "unknown"
if not isNone(r)
    zone = r > 70 ? "high" : (r < 30 ? "low" : "mid")
```

**Not raised yet.** OS8004 is in the catalogue and nothing raises it: the
checker does not follow which names a branch on a possibly absent condition
assigns.

A condition built only from literals and constant options folds to one answer for
the whole run, which makes one branch dead. That is warning OS8017, and it is
usually a test that was pinned during debugging and left behind.

## The ternary chooses a value; if chooses a block

```
tint  = up ? lime : red
value = ready ? computed : none
zone  = r > 70 ? "high" : r < 30 ? "low" : "mid"
```

The ternary is right associative, so a chain reads top to bottom as a list of
cases with the last as the default. Both arms must be the same type, or one arm
may be `none`, and only the taken arm is evaluated. An absent condition takes the
false arm, exactly as in an `if`.

Prefer the ternary wherever the decision produces a value rather than an effect.
It keeps a plot at the top level, it keeps a colour on one line, and it avoids the
OS8004 shape entirely, because there is no branch that can fail to assign.

**Not raised yet.** OS8004 is in the catalogue and nothing raises it: the
checker does not follow which names a branch on a possibly absent condition
assigns.

## for

Two forms. The range form is inclusive at both ends.

```
for i = 0 to 9              // ten iterations: 0, 1, 2, ... 9
    total += close[i]

for i = 9 to 0 step -1      // ten iterations, descending
    print(close[i])

for price in prices         // over an array's elements
    total += price
```

| Rule | Detail |
|---|---|
| `step` defaults to `1` | Write it out only when it is something else |
| An end below the start with a positive step runs zero times | It does not silently reverse. The compiler warns with OS8015 |
| A step of `0` | OS3004, because it is the one loop that cannot finish |
| The loop variable is scoped to the loop | It does not exist after the loop ends |
| The loop variable may not be assigned in the body | OS2006. Use `break` to leave early |
| The `in` form visits indices `0` to `size - 1` | Measured when the loop is entered |
| Elements appended during the loop are not visited | The cursor was fixed at entry |
| If the array shrinks past the cursor | The loop stops |

Making a descending loop say `step -1` costs one word and removes the only shape
of `for` loop that can spin for ever by accident.

## while

```
while condition
    block
```

The condition is re-evaluated before each iteration, with the same rule as `if`: a
`bool` or absent, and absent ends the loop because it takes the false branch.

A `while` has no counter of its own, so the body has to make progress towards the
exit, and it is worth writing the bound into the condition rather than trusting
the data:

```
i = 0
while i < size(prices) and prices[i] < close
    i += 1
```

That condition has two guards in the right order: the bound first, so the element
read can never be out of range, and the data test second. Reversing them would ask
for `prices[i]` before checking that `i` is inside the array, which is OS4004 on
the bar the array happens to be short.

## break and continue

`break` leaves the innermost `for` or `while`. `continue` skips to that loop's
next iteration. Either one outside a loop is OS1009, and the message says to use
`return` to leave a function early.

```
version 1

study("Mean body, skipping gaps", precision = 2)

lookback = input(20, "Lookback", min = 2, max = 500)

total = 0.0
seen  = 0

for i = 0 to lookback - 1
    // continue is the readable way to say "this bar has nothing to contribute",
    // and it keeps the accumulation at one level of indentation.
    if isNone(close[i]) or isNone(open[i])
        continue
    total += abs(close[i] - open[i])
    seen  += 1

plot(seen > 0 ? total / seen : none, "Mean body", aqua, width = 2)
```

## switch

`switch` is a statement, not an expression. It has two forms.

**The value form** compares a subject against each case:

```
switch method
    case "fast"
        len = 9
    case "slow", "verySlow"
        len = 21
    default
        len = 14
```

**The condition form** has no subject and takes the first arm whose condition is
true:

```
switch
    case r > 70
        zone = "high"
    case r < 30
        zone = "low"
    default
        zone = "mid"
```

| Rule | Detail |
|---|---|
| Arms do not fall through | Each arm's block ends at the next `case` or `default` |
| A `case` may list several values, separated by commas | All must have the subject's type |
| `default` is optional and must be last | With no `default` and no match, nothing happens |
| An arm declares nothing that outlives it | A name the arms set must be declared before the `switch` |

That last rule follows from block scope, and it is deliberate: it makes the
"declared in one arm only" bug impossible to write. There is no expression form of
`switch` in version 1, because the ternary already covers choosing a value and a
statement that is sometimes an expression doubles the grammar for a small gain.

```
version 1

study("Selectable average", overlay = true, precision = 2)

method = input("medium", "Speed", options = ["fast", "medium", "slow"])
src    = input(close, "Source")

// Declared before the switch, with the value a reader should assume when no arm
// matches. The arms only refine it.
len = 21

switch method
    case "fast"
        len = 9
    case "slow"
        len = 50

plot(sma(src, len), "Average", aqua, width = 2)
```

## The loop budget

A script runs inside a chart, often inside a browser tab. A loop whose exit
condition is never met would freeze that tab, so every loop is compiled with a
counter.

**Every iteration of every loop, summed over all loops executed during one bar,
counts against a per-bar budget. The default budget is 2,000,000 iterations.
Exceeding it raises OS5001, naming the line of the loop that was running when the
budget ran out.**

Three details, each of them a decision:

**It is per bar, not per loop.** A script with one nested loop is treated the same
as a script with ten sequential loops, and there is no way to get around the
budget by splitting a loop in two.

**It resets each bar.** A long dataset is not itself a reason to fail. Fifty
thousand bars each doing two hundred iterations is fine; one bar doing three
million is not.

**It stops the bar rather than breaking out of the loop.** OS5001 marks the study
as errored, with the message on the chart. Breaking out silently would produce a
loop that ran two million times and then stopped, which is a plausible wrong
number, and a plausible wrong number is worse than no number.

The budget is a default, not a ceiling. A script that genuinely needs more raises
it deliberately, in one place:

```
version 1

study("Heavy")
limits(loops = 50_000_000)
```

| Rule for `limits()` | Detail |
|---|---|
| It is optional | Most scripts never come near the default |
| It appears at most once | Two would need a rule for which wins |
| It must be the statement immediately after the declaration | Anywhere else is OS3014 |
| Its arguments must be literal numbers | A computed budget is OS3015 |
| Its options are `loops` and `history` | The per-bar iteration budget, and the retained series depth |
| A host may refuse a value it will not run | OS5003, naming its ceiling, rather than quietly capping it |

There is a second ceiling worth knowing about, on nesting rather than iteration.
An expression, a block or a call nested past the parser's limit is OS5005. It sits
far above anything written by hand and is normally reached by generated source;
the fix is to give the inner expression a name at the top level and use the name.

## The loops you do not need

Most loops in a first OpenScript script are a window calculation written out by
hand. The library already has them, they are exact about their warmup, and they
cost a fraction of what a hand-written loop costs.

| What you want | The loop you might write | Write this instead |
|---|---|---|
| The highest high of the last 20 bars | A loop with a running `max` | `highest(high, 20)` |
| How many bars back that high was set | The same loop, tracking an index | `highestBars(high, 20)` |
| The total of the last 20 closes | A loop with `+=` | `sum(close, 20)` |
| The mean of the last 20 closes | The same, divided | `sma(close, 20)` |
| The mean ignoring absent bars | A loop with an `isNone` guard | `avgSkip(close, 20)` |
| How many of the last 50 bars closed up | A loop with a counter | `count(close > open, 50)` |
| How many bars since a condition last held | A loop walking backwards | `barsSince(cond)` |
| The close when a condition last held | The same loop, remembering a value | `valueWhen(cond, close)` |
| A running total from the first bar | A `var` and an addition | `cum(volume)` |
| The change over ten bars | `close - close[10]` in a loop | `change(close, 10)` |
| Whether every one of the last five changes was positive | A loop with a flag | `rising(close, 5)` |
| Where this bar ranks inside its window | A loop counting smaller values | `percentRank(close, 100)` |
| The middle value of a window | A sort inside a loop | `median(close, 20)` |

And the most common one of all: **a fixed lookback needs no loop at all.** `[]`
reads any bar of history directly.

```
// Written out by hand.
hi = close
for i = 1 to 19
    hi = max(hi, close[i])

// The same thing, exact about its warmup, and one call.
hi = highest(close, 20)
```

The two are not quite the same, and the difference is instructive. The loop
version starts producing a number on bar 0, computed from however few bars exist,
because `close[i]` is absent past the start and `max` of an absent value is
absent, so the result is absent until twenty bars exist anyway. The library call
is absent on bars 0 to 18 by specification, on exactly those bars and no others,
which is a promise a conforming engine has to keep. Reaching for the call is how a
study matches a reference implementation to the last decimal.

Two more replacements are worth naming because they are less obvious.

**Keep a running accumulator instead of recomputing a window.** A loop over the
last two hundred bars on every bar does two hundred times the work of updating one
number. When the quantity is genuinely cumulative, a `var` and one addition give
the same answer in constant time, and the rollback rule makes it safe on a live
chart.

```
version 1

study("Cumulative signed volume", precision = 0)

var running = 0.0

// One addition per bar, instead of a loop back over every bar since the start.
running += close > open ? volume : (close < open ? -volume : 0)

plot(running, "Signed volume", aqua, width = 2)
```

**Compare series rather than walking them.** A crossing is `crossUp(a, b)`, not a
loop that compares the last two values of each.

### The loops that should stay

There are shapes a loop is the right answer for, and they have one thing in
common: they walk a collection the script itself built, not a window of bars.

The most important one is a list you are removing from. Walk it downwards, so
that removing element `i` cannot renumber an element the loop has yet to visit.
Ascending with a removal inside is the classic way to skip half a list, and
`step -1` costs one word to make it impossible.

```
version 1

study("Live levels", overlay = true, precision = 2)

leftBars  = input(5, "Pivot left bars",  min = 1, max = 50)
rightBars = input(5, "Pivot right bars", min = 1, max = 50)

var levels: array<number> = []

// Counted downwards, because remove() renumbers everything above the element it
// removed, and an ascending loop would step straight over the next one.
for i = size(levels) - 1 to 0 step -1
    if close > element(levels, i)
        remove(levels, i)

pivot = pivotHigh(high, leftBars, rightBars)
if not isNone(pivot)
    push(levels, pivot)

plot(size(levels), "Levels still unbroken", aqua, width = 2, style = "step")
```

## The errors and warnings you are likely to meet

| Code | Means | Usual fix |
|---|---|---|
| OS1002 | A tab in indentation | Indent with spaces |
| OS1003 | Indentation does not match the block | Make every line of one block match exactly |
| OS1006 | `=` used where a condition was expected | Write `==` |
| OS1009 | `break` or `continue` outside a loop | Move it inside the loop, or use `return` |
| OS1010 | A block header with no body | Indent the body under the header |
| OS2006 | The loop variable was assigned in the body | `break`, or use a separate name |
| OS2011 | A condition is not a `bool` | Write the test out |
| OS3004 | A step of zero, or a fractional count | Use a whole, non-zero step |
| OS3006 | `plot`, `fill`, `level` or `table` inside a block | Move it to the top level and pass `none` to hide it |
| OS3014 | `limits()` is not immediately after the declaration | Move it there |
| OS5001 | The per-bar loop budget ran out | Fix the exit condition, or raise the budget |
| OS5005 | Nesting is too deep | Name the inner expression at the top level |
| OS8015 | The loop never runs | Add `step -1`, or swap the bounds |
| OS8017 | The condition is constant | Restore the test that was meant |

## See also

- [absent-values.md](./absent-values.md) for what an absent condition does to each form on this page
- [variables-and-scope.md](./variables-and-scope.md) for what a name declared inside a block is visible to
- [operators.md](./operators.md) for the ternary, the comparison rules and short-circuiting
- [types-and-values.md](./types-and-values.md) for why a condition has to be a `bool`
- [execution-model.md](./execution-model.md) for the per-bar loop that every form on this page runs inside
- [../README.md](../README.md) for the documentation index
- [../../spec/language.md](../../spec/language.md) section 10 for the specification of statements and control flow
- [../../examples/](../../examples/) for twelve working scripts
