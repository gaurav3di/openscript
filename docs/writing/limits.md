# Limits

By the end of this page you will know every limit a script runs inside, which
ones belong to the language and which to the host, why each exists, and exactly
what to do when you reach one.

## The stance behind the numbers

A limit in OpenScript is a number you can see, with a reason you can read and,
where it makes sense, a line you can write to change it. That is a design
position rather than a courtesy. A ceiling nobody can see turns "my script
stopped working" into folklore, and a ceiling that is applied silently turns it
into something worse: a script that keeps running and produces a number its
author never asked for.

Two rules follow from that position and hold everywhere in this document.

- **A limit that is exceeded is reported, never absorbed.** A loop that runs out
  of budget stops the bar and says so. It does not break out of the loop and
  carry on, because a loop that ran two million times and then stopped produces
  a plausible wrong number, and a plausible wrong number is worse than no
  number.
- **A host that will not spend what a script asks for says so.** It refuses at
  load time with OS5003, naming the option, the value asked for and the value it
  allows. It must not quietly cap the value.

## Every limit, in one table

| Limit | Default | Raised by | Reported as | Whose |
|---|---|---|---|---|
| Loop iterations per bar | 2,000,000 | `limits(loops = n)` | OS5001 | The language's |
| Retained series depth | Unbounded: every bar the engine was given | `limits(history = n)` | OS4002 | The language's, when a host sets one |
| Array elements | 1,000,000 | Not raisable in version 1 | OS5002 | The language's |
| String length | The host's ceiling | Not raisable | OS5008 | The host's |
| Compiled program size | The host's ceiling | Not raisable | OS5009 | The host's |
| Nesting depth of expressions, blocks and calls | The implementation's ceiling | Not raisable | OS5005 | The compiler's |
| Outstanding data requests | The host's ceiling | Not raisable | OS5006 | The host's |
| Wall clock per bar | The host's budget | Not raisable from a script | OS5007 | The host's |
| Drawing objects | No cap | Not applicable | Nothing: memory is the budget | Neither |
| Bars in the dataset | The host's | Not applicable | Nothing | The host's |

Each row has its own section below. The error catalogue,
[`../../spec/errors.md`](../../spec/errors.md), carries the exact message text,
the placeholders the message is filled with, and a before and after example for
every code named here.

## The `limits()` statement

Two limits are the script's to set, and both are set in one place.

```
version 1

study("Heavy")
limits(loops = 50_000_000, history = 5001)

// ...
```

The rules are short and all of them are enforced:

| Rule | Code when broken | Why |
|---|---|---|
| `limits()` is optional | none | Most scripts never need it: none of the twelve example scripts does |
| It appears at most once | OS3014 | Two of them would need a rule for which wins |
| It is the statement immediately after the declaration | OS3014 | A reader has to see a raised budget without scrolling, and the engine has to know it before bar 0 |
| Its arguments are literal numbers | OS3015 | A budget computed from data cannot be checked before the run starts |
| Its options are `loops` and `history` | OS3002 | Nothing else is the script's to set |

A host may refuse a value it is not willing to spend, with OS5003. That is not a
failure of your script; it is the host telling you which of its own limits you
have met, in a message that names the number.

## The loop budget

**Every iteration of every loop, summed over all the loops executed during one
bar, counts against a per-bar budget. The default is 2,000,000 iterations.**

Exceeding it is OS5001, which names the line of the loop header that was running
when the budget ran out. The bar stops and the study is marked as errored with
the message on the chart.

Three details in that sentence are decisions rather than accidents:

- **Per bar, not per loop.** A script with one nested loop is treated the same
  as a script with ten sequential loops. A per-loop budget would let a script
  with twenty loops do twenty times the work of a script with one.
- **Reset each bar.** A long dataset is not itself a reason to fail.
- **Stops rather than breaks.** See the stance above.

The budget exists because a script runs inside a chart in a browser tab, and a
loop whose exit condition is never met would freeze that tab. The commonest way
to meet it is not a big loop, it is a `while` with no bound:

```
// Before: if close[i] keeps rising this never terminates. It is also reading
// past the start of history, where the comparison becomes absent, so the loop
// stops for a reason that has nothing to do with the intent.
while close[i] > close[i + 1]
    total += close[i]

// After: a bound and an increment. The cap is a decision you can defend, and
// the loop cannot spin.
i = 0
while i < 500 and close[i] > close[i + 1]
    total += close[i]
    i += 1
```

**When you reach it, ask which of two things is true.** Either the loop has a
bug, in which case fix the exit condition, or the script genuinely needs more,
in which case raise the budget in one line and say why in a comment:

```
study("Pairwise level clustering")
limits(loops = 50_000_000)      // 500 levels compared pairwise, twice per bar
```

Before raising it, read [profiling.md](./profiling.md). A script that needs
tens of millions of iterations per bar is usually recomputing from scratch
something it could carry forward, and the rewrite is both faster and shorter
than the raised budget.

## The per-bar time budget

A loop budget counts iterations. It does not count time, so a script can be
comfortably inside the budget and still be too slow to run: a bar that does
fifty thousand cheap things is nowhere near 2,000,000 and is still fifty
thousand times slower than it needed to be.

A host that runs many strategies gives each bar a wall clock budget so that one
script cannot starve the rest. A bar that exceeds it is OS5007, naming the bar
index, the time it took and the budget. This limit is the host's: there is no
`limits()` option for it, and a script cannot raise it.

The usual cause is named in the catalogue entry itself: work that does not
change from bar to bar, recomputed over the whole history on every bar, turning
a linear study into a quadratic one.

```
// Before: on bar 40,000 this runs 40,001 times.
total = 0.0
for i = 0 to bar.index
    total += close[i]

// After: one addition per bar, same answer.
var total = 0.0
total += close
```

## The retained history depth

`x[n]` reads the value of `x` as it stood `n` bars ago. By default the engine
retains the full history of every series for the dataset it was given, so any
depth works and OS4002 never appears.

A host may set a depth, and a script may ask for one, and then a read past it is
OS4002 rather than absence. That distinction is the point of the error:

- `x[n]` where `n` is greater than `bar.index` is **absent**. The value never
  existed, and absence is the truthful answer.
- `x[n]` deeper than the retained depth is an **error**. The value existed and
  the engine discarded it, which is a different situation. Conflating the two
  would hide a real bug behind a plausible gap.

```
version 1

study("Long lookback")
limits(history = 5001)          // the deepest read below is [5000]

old = close[5000]
plot(old, "Close, 5000 bars ago", aqua)
```

The message names an adequate depth for the script, which is the deepest index
it uses, so the fix is usually to paste the number the error gave you. Note that
depth costs memory per series per bar, which is why a host may bound it, and why
the compiler allocates a retained register only for names whose history the
program actually reads.

## The array ceiling

An array holds at most 1,000,000 elements. Exceeding it is OS5002, naming the
array and the size it reached. **`limits()` does not raise this in version 1**,
and that is stated rather than left to be discovered, because an array that
large is almost always a window that is never trimmed rather than a genuine
need.

The fix is to decide how much of the past you actually need and drop the rest as
you go:

```
var window: array<number> = []

push(window, close)
if size(window) > 500
    shift(window)

plot(avg(window), "Rolling mean of the last 500 bars", aqua)
```

Two neighbouring errors have the same root and are worth knowing together.
OS4004 is an index outside the array, which is an error rather than absence
because an array has an extent the script chose. OS4006 is taking an element
from an empty array with `pop`, `shift`, `min`, `max` or `avg`, which has no
answer; returning absence there would let a script drain an array without
noticing.

## The string ceiling

A string holds at most the host's ceiling in characters, reported as OS5008 with
the number in the message. One shape reaches it and it is always the same one: a
log accumulated into a persistent string, one line per bar, that nothing ever
trims.

```
// Before: grows for ever, at one line per bar.
var logText = ""
logText += text(close) + "\n"

// After: keep the pieces, trim to what you display, join only those.
var logLines: array<string> = []
push(logLines, text(close))
if size(logLines) > 50
    shift(logLines)
```

## The program size ceiling

The compiled program is held in memory per chart and per running strategy, so a
host has a size it is willing to hold. A file that compiles to more instructions
than that is OS5009, naming the count and the ceiling.

You will not reach this by writing a study by hand. A file at that size is
nearly always repeated blocks that a function would collapse, or generated
source. The fix is extraction: see
[style-guide.md](./style-guide.md#when-to-extract-a-function).

## The nesting ceiling

Expressions, blocks and calls may nest to a bounded depth, so that the parser
and the checker stay inside a bounded stack and no input can stop a tab.
Exceeding it is OS5005, naming the construct, the depth reached and the ceiling.
The ceiling is far above anything a person writes by hand.

If you meet it, the fix is also the readable change:

```
// Before: unreadable, and legal right up to the ceiling.
z = a ? b ? c ? d ? 1 : 2 : 3 : 4 : 5

// After: two names, and a reader can follow it.
inner = c ? (d ? 1 : 2) : 3
z = a ? (b ? inner : 4) : 5
```

## The data request ceiling

Each `req.timeframe` or `req.symbol` read is a separate series the host fetches
and keeps in step with the chart's bars. A host has a ceiling on how many it
will hold at once, and a file with more is OS5006, naming the count and the
ceiling. It is reported rather than silently dropping the extra requests,
because a dropped request is a plot that quietly turns absent.

The fix is nearly always to stop asking twice for the same thing. One request
per symbol and timeframe, then reuse the name:

```
dayHigh  = req.timeframe("1D", high)
prevHigh = dayHigh[1]                   // not a second request
weekHigh = req.timeframe("1W", high)
```

And delete reads whose results are unused. An unused read still costs the host a
whole aligned series, and an unread name earns warning OS8010 in any case.

## Drawing objects: no cap, and what that means

**A drawing object persists until the script deletes it, and there is no cap on
how many a script may create.** The only budget is memory, and a host that
cannot hold them must say so rather than dropping the oldest. This is a
deliberate difference from the platforms this language exists to replace, where
a fixed object count silently discards the oldest drawing and leaves a study
that is correct on the right of the chart and wrong on the left.

No cap is not a licence to leak. A script that creates an object per bar over
fifty thousand bars has created fifty thousand objects, and nothing will stop it
until the machine does. The discipline is simple:

```
// A zone dies when price closes through it or it ages out. Counted downwards so
// that removing element i does not renumber an element the loop has yet to
// visit.
for i = size(zones) - 1 to 0 step -1
    age = bar.index - element(zoneBar, i)
    if age > maxAge
        draw.delete(element(zones, i))
        remove(zones, i)
        remove(zoneBar, i)
```

`draw.count()` reports how many objects the script currently holds. Put it in a
debug panel while you develop; a count that rises for ever is a leak, and you
will see it in a minute rather than in an hour.

## The bar count

The number of bars a script sees is the host's, not the language's. There is no
language limit, no "maximum bars back" setting, and no bar at which a script
starts for real: the script runs on bar 0 exactly as it runs on bar 40,000, and
warmup is expressed entirely through the absent value.

Two consequences matter in practice.

- **`bar.index` is a position in the supplied data, not an address.** Loading
  more history shifts every index. A persistent value holding a bar index is
  comparing against something that moved underneath it, which is warning OS8014.
  Store `time` instead: a bar's time does not move.
- **How much history you get is a host question.** If a study needs two hundred
  bars of warmup and the host loaded three hundred bars, most of the chart is
  warmup, and that is a data problem rather than a script problem. Say in the
  script's documentation how much history it needs.

## When you reach a limit: a short decision table

| You see | First ask | Then do |
|---|---|---|
| OS5001 | Does this loop terminate on every bar? | Fix the exit condition; if it is correct, raise `loops` and comment why |
| OS5007 | Does any loop's length depend on `bar.index`? | Carry the value forward in a `var`, or use `cum` |
| OS4002 | Is the deep read intended? | `limits(history = n)` with the depth the message suggests |
| OS5002 | Is this array a window or a log? | Trim on push; a window needs a fixed length |
| OS5008 | Am I building text per bar for output shown once? | Build it on `bar.isLast`, or keep an array and trim it |
| OS5009 | Are there repeated blocks? | Extract a function |
| OS5005 | Is this expression readable? | Name the inner part |
| OS5006 | Is any request a duplicate? | Read once, reuse the name, delete unused reads |
| OS5003 | Do I really need this budget? | Lower it, or run the file on a host that allows more |

## See also

- [profiling.md](./profiling.md) for measuring the work that meets these budgets
- [debugging.md](./debugging.md) for telling a limit apart from a bug
- [testing.md](./testing.md) for proving a raised budget did not change a number
- [style-guide.md](./style-guide.md) for writing scripts that stay well inside them
- [publishing.md](./publishing.md) for declaring what a script needs from a host
- [../../spec/errors.md](../../spec/errors.md) for every code named here
- [../../spec/language.md](../../spec/language.md) for the loop budget and the history operator
