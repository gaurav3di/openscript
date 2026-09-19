# Style guide

By the end of this page you will be able to lay out, name and comment an
OpenScript file so that somebody who has never seen it, including you in six
months, can read it top to bottom and know what it does and why.

## Why a style guide, when the language already fixes the layout

OpenScript settles the arguments most style guides are written to settle. There
is one indentation rule and it is spaces only. There is one statement per line
and no semicolon to argue about. There are no braces and no `end` keyword, so
there is no brace placement. A block is the lines indented more deeply than its
header, and that is the whole of it.

What the language cannot settle is the part that actually decides whether a
script is readable: the names you choose, the order you put things in, what you
pull out into a function, and what you say in a comment. Those are the subject
of this page.

The standard to write to is the one the language itself is written to: a rule
exists because of a reason, and the reason is worth one sentence. A reader who
knows why a line is written a particular way will keep it that way. A reader who
only knows that it is written that way will delete it the first time it is
inconvenient.

## The shape of a file

Every script has the same sections in the same order. The order is not
arbitrary: the language runs the file top to bottom once per bar and requires a
name to be assigned before it is read (`language.md` section 12.5), so a script
that reads naturally is also a script that compiles.

| Order | Section | Holds | Why it sits here |
|---|---|---|---|
| 1 | Header comment | What the script does, what it needs, what it does not do | The first thing a reader sees should be prose, not code |
| 2 | `version` | `version 1` | The first line that is not blank and not a comment, by section 4 |
| 3 | Declaration | `study(...)` or `strategy(...)` | Exactly one, and it fixes the pane, the precision and the cost model |
| 4 | `limits()` | Loop budget and retained depth, when the defaults are not enough | Must be the statement immediately after the declaration |
| 5 | Inputs | Every `input()` call | Top level only, and a reader wants the knobs before the machinery |
| 6 | Functions | `fn` declarations | Collected before checking, so they may sit here or at the end: pick one |
| 7 | Data reads | `req.timeframe` and `req.symbol` | They are the script's external dependencies, and they belong together |
| 8 | Calculations | The library calls and the arithmetic | Unconditional, at the top level, so state advances on every bar |
| 9 | State | `var` declarations and the blocks that update them | After the values they are computed from |
| 10 | Decisions | The `if` blocks that turn numbers into conclusions | After the numbers, before the output |
| 11 | Outputs | `plot`, `fill`, `level`, `table` | Top level only, and they are what the reader scrolls to when a line looks wrong |
| 12 | Events and paint | `signal`, `alert`, `barColor`, `background`, `draw`, orders | Last, because they are consequences |

Sections 11 and 12 can be interleaved where a marker belongs next to the
decision that raises it. The twelve example scripts do it both ways and both
read fine. What does not read fine is a plot in the middle of the calculations
and another one after the orders.

Here is the whole shape in one short file.

```
// Deviation bands around a simple average, with a marker on the bar price
// closes outside them. Needs no volume and no other instrument.

version 1

study("Deviation bands", overlay = true, precision = 2)

length   = input(20,   "Length", min = 2, max = 500)
widthDev = input(2.0,  "Band width, in standard deviations", min = 0.1, max = 10)
src      = input(close, "Source")

basis = sma(src, length)
dev   = widthDev * stdev(src, length)
upper = basis + dev
lower = basis - dev

plot(basis, "Basis", orange, width = 2)
upperPlot = plot(upper, "Upper", silver)
lowerPlot = plot(lower, "Lower", silver)
fill(upperPlot, lowerPlot, fade(silver, 92))

// A break is an event on one bar. A column of one value per bar could only say
// that by being absent on every other bar, so it is a marker instead.
if crossUp(src, upper)
    signal("BREAK UP")
```

Two small things in that file are deliberate and are worth copying. The basis
plot's handle is not captured, because nothing uses it; the two band handles are
captured, because `fill` names them. And the input titles are full sentences
with units in them, because the settings dialog is the only documentation most
users of a script will ever read.

## Naming

The language's convention, stated in section 3.3 and not enforced, is
`camelCase` for names and functions and `UPPER_SNAKE` for values a script treats
as constants. Beyond that, these rules earn their keep.

| Rule | Instead of | Write | Because |
|---|---|---|---|
| Say what the number is, not what type it is | `n`, `val`, `x2` | `length`, `stopDistance`, `rangeWidth` | The type is `number` for all of them, so the name is the only information |
| Put the unit in the name when there is one | `hold` | `holdMinutes` | A number that is sometimes minutes and sometimes milliseconds is a bug waiting for a busy afternoon |
| A bool reads as a claim about this bar | `flag`, `check` | `forming`, `isReady`, `broken` | `if forming` reads as English; `if flag` reads as nothing |
| A length input ends in `Len` or `Length` | `fast`, `slow` | `fastLen`, `slowLen` | Then `fast` and `slow` are free for the averages themselves |
| A plot handle is named for its plot | `p1`, `p2` | `upperPlot`, `lowerPlot` | The only thing a handle is for is being named by `fill` |
| Loop indices may be short | `elementIndex` | `i`, `j` | A three line loop body gives the index all the context it needs |
| Constants that are not inputs get `UPPER_SNAKE` | `msPerMinute` | `MS_PER_MINUTE` | It marks the value as fixed by arithmetic rather than by the user |

Two names are not available to you, and the compiler will say so:

- **A standard library name.** `close`, `ema`, `aqua`, `stdev`, `variance`,
  `plot`, `size`, `count`, `change` and every other entry in `stdlib.md` lives
  in the global scope, so assigning to one is OS2002. This catches more people
  than it sounds like it would: `variance`, `count`, `change`, `mix`, `sign`,
  `median` and `chop` are all ordinary English words and all of them are taken.
  When the compiler stops you, add a suffix that says what the value is:
  `varianceValue`, `barCount`, `priceChange`.
- **A name that already exists in an enclosing scope.** Shadowing is OS2002, not
  a warning, because the most expensive class of bug in a per-bar script is a
  value that is right in one place and stale in another, and two variables with
  one name is the shortest path there. Rename the inner one.

## Ordering inside a section

Within the calculations, order by dependency and then by importance. A reader
should be able to stop reading at any line and have understood everything the
lines below will use.

```
// Good: each line uses only what is above it, and the important value is last.
atrValue       = atr(atrLen)
stopDistance   = stopMult * atrValue
targetDistance = targetMult * atrValue
```

Group by subject, not by call. Three lines that compute a stop belong together
even if one of them is a library call and two are arithmetic. Blank lines
between groups are free and are the cheapest readability you can buy.

Functions may be declared after they are called, because the checker collects
every `fn` before it checks any body (section 12.5). That freedom is worth
having and is not worth spending twice: put every function in one place, either
directly under the inputs or at the end of the file, and do it the same way in
every script you write.

## When to extract a function

Extract when one of these three is true, and not otherwise.

**1. The same expression appears twice.** Two copies of an expression are two
places to fix when it is wrong, and the second one is always the one that gets
missed.

**2. A line needs a sentence to explain it, and the sentence is a name.** This
is the most common reason and the most underused. Compare:

```
// Before: correct, and the reader has to decode it every time.
z = (src - sma(src, len)) / stdev(src, len)
```

```
// After: the name is the explanation, and the formula is read once.
fn zscore(src, len) =>
    m = sma(src, len)
    s = stdev(src, len)
    (src - m) / s

z = zscore(close, 20)
```

**3. You want a second, independent copy of some per-bar state.** State is
allocated per call site, not per function (section 11.4), so a stateful helper
called in two places keeps two counters. That is what makes a helper reusable at
all, and it is the reason to reach for one:

```
fn barsSinceTrue(cond) =>
    var n = none
    if cond
        n = 0
    else if not isNone(n)
        n = n + 1
    n

sinceUp   = barsSinceTrue(close > open)     // its own counter
sinceHigh = barsSinceTrue(high > high[1])   // a separate counter
```

Do not extract when the function would take six arguments to avoid repeating two
lines, when the body is a single library call with the arguments renamed, or
when the only thing it does is hide a magic number that should have been an
input. And you cannot extract a function that calls itself: recursion is OS2005,
because state slots are allocated statically per call site. Write a loop.

One more constraint that shapes extraction: a parameter may not be named after a
file-scope name or a library function (OS2002). Helper parameters therefore tend
to be short and generic, `src`, `len`, `cond`, which is fine, because a helper's
parameters take their meaning from the call site.

## Comment discipline

**Comment why, not what.** The reader can see what a line does; the language is
small enough that every line says what it does. What the reader cannot see is
the alternative you rejected and the reason.

```
// Bad: says what the line already says.
// Compute the 20 bar exponential moving average of the close.
e = ema(close, 20)
```

```
// Good: says what the reader could not have known.
// Computed unconditionally at the top level. Computing it inside the branch
// that uses it would advance its state only on the bars that branch was taken,
// which is warning OS8001 and a line with holes in it.
e = ema(close, 20)
```

The places a why comment nearly always pays for itself:

| Where | What to say |
|---|---|
| An `orElse` | What is absent, on which bars, and what would happen without the fallback |
| A `var` | Why the value has to survive the bar |
| A `live var` | Why counting updates is the actual intent, since it makes live and backtest differ |
| A pivot or any lagged read | How many bars late the value is, and that the lag is real rather than a bug |
| A `mode` on a higher timeframe read | Which of the three readings this study takes and why |
| A guard on `bar.isConfirmed` or `bar.isLast` | What would happen on the moving bar without it |
| A magic constant | Where the number came from, or why it is not an input |
| An ordering that looks accidental | That reading a `var` before it is reassigned is how the previous bar's value is obtained |

The file header comment is the exception to "why, not what": it is the one place
that should say what. Three short paragraphs, in this order: what the script
draws or trades, what it needs from the host (volume, a session, another
instrument, a particular timeframe), and what it deliberately does not do. Write
it before the code, not after, and you will find out whether you know what you
are building.

There are no block comments, on purpose: an unterminated one swallows the rest
of a file and reports its error at the last line, which is the worst error
message a compiler can produce. Comment a region by prefixing each line, which
every editor does with one keystroke.

## Formatting

- **Four spaces per level.** Any consistent amount is legal, four is the
  convention and the formatter's output.
- **Align the `=` in a run of inputs or short assignments.** A column of inputs
  is read as a table, and aligning it makes the odd one out visible.
- **Keep lines under about eighty characters.** A continuation line must be
  indented more deeply than the first line of its statement, so wrapping is
  unambiguous.
- **Break a long call at its named arguments**, one group per line, as the
  declaration in example 10 does. A call that needs four lines is telling you it
  has four ideas in it.
- **Blank lines separate sections, not statements.** A blank line inside a three
  line group is noise.
- **Never write a line whose only purpose is to be clever.** A nested ternary
  three levels deep is legal and right associative and nobody reads it
  correctly on the first pass. Give the inner choice a name.

```
// Before: legal, and nobody reads it correctly the first time.
tone = up ? (strong ? lime : green) : (down ? (strong ? red : maroon) : gray)
```

```
// After: two names, three short lines, one obvious reading.
upTone   = strong ? lime : green
downTone = strong ? red : maroon
tone     = up ? upTone : down ? downTone : gray
```

## Shapes to avoid

| Shape | What goes wrong | Write instead |
|---|---|---|
| A stateful call inside an `if` | It advances only on the bars the branch runs, and is absent on the rest (OS8001) | Compute it at the top level, use it inside the branch |
| A `plot` inside an `if` | OS3006: the set of columns is fixed before bar 0 | `plot(cond ? value : none, ...)` |
| `var` holding `bar.index` | Every index shifts when more history loads (OS8014) | Store `time` and compare timestamps |
| `x = x[1] + 1` as a counter | `x[1]` is absent on bar 0, absence propagates, and the series is absent for ever | `var x = 0` then `x = x + 1` |
| `live var` because it sounded faster | Live and backtest now disagree by design (OS8011) | Plain `var`, unless counting updates is the intent |
| A number typed into the calculations | Nobody can tune it without editing the script | An `input()` with a title, a minimum and a maximum |
| A name assigned and never read | It still runs on every bar and implies something depends on it (OS8010) | Delete the line |
| The same `req` read written twice | Two requests against the host's ceiling (OS5006) | Read once, name it, reuse the name |

## Treat warnings as part of the style

An OS8xxx warning never stops anything, which makes it tempting to leave in
place. Do not. Every warning in the catalogue exists because the shape it
describes is almost always a mistake, and the two or three cases where it is not
are cases where one comment saying so costs nothing. A file that compiles with
no warnings is a file whose reader can trust that everything unusual in it was
meant.

## See also

- [debugging.md](./debugging.md) for finding out what a script is actually doing
- [profiling.md](./profiling.md) for what the shapes above cost per bar
- [limits.md](./limits.md) for the budgets a script runs inside
- [testing.md](./testing.md) for checking that a readable script is also a correct one
- [publishing.md](./publishing.md) for what a script needs before somebody else reads it
- [../../spec/language.md](../../spec/language.md) for the rules this page dresses
- [../../examples/](../../examples/) for twelve scripts written to this guide
