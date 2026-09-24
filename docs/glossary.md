# Glossary

By the end of this page you will be able to read any other page in this
documentation set without stopping to work out what a word means, because every
term used across them is defined here, in alphabetical order.

## How to use this page

Definitions are one or two sentences. Where a term has a rule behind it rather
than just a meaning, the page that explains the rule is named at the end of the
entry. Two terms in this documentation carry two senses (a fill and a range), and
both senses are listed separately.

Most of the vocabulary appears in one short script:

```
version 1                                   // the version declaration

study("Range breakout", overlay = true)     // the declaration

length = input(20, "Lookback", min = 2)     // an input, at the top level

hi = highest(high, length)[1]               // a call, then the history operator
lo = lowest(low, length)[1]

var long = false                            // persistence
var stop = none                             // the absent value

if not long and close > hi                  // a block, entered by indentation
    long = true
    stop  = lo
    signal("BUY")                           // a marker
    alert("Broke the range", id = "break")  // a watched condition

plot(hi, "Upper", aqua)                     // one plotted column
plot(long ? stop : none, "Stop", red)       // absent draws a gap
```

## A

**Absent value.** The value that means "there is no value here", written `none`.
It is a member of every type, it propagates through arithmetic and ordered
comparison, and it draws a gap rather than a zero.

**Alert.** A condition a script declares for the host to watch, together with the
message to send when it holds on a confirmed bar. See [alerts.md](./alerts.md).

**Anchor.** The time and price a drawing object is attached to. Anchoring to a
time rather than a bar index is what keeps an object where it was put when more
history loads and every index shifts.

**Argument.** A value passed at a call site. Arguments may be positional, named,
or positional followed by named, and a named argument may not repeat a positional
one.

**Arm.** One `case` or `default` branch of a `switch`. Arms do not fall through,
and a name first assigned inside an arm does not escape it.

**Array.** An ordered, mutable, resizable, homogeneous list, written `array<T>`.
An array value is a reference, so assigning one name to another gives two names
for one array.

**Autofix.** A flag on an error catalogue entry saying that an editor can apply
the stated fix without asking the author a question.

## B

**Backtest.** A run of a strategy over historical bars, producing fills, an
equity curve and a report, under the declared cost model.

**Bar.** One interval of price data: an open, a high, a low, a close, a volume
and a time. The script's body executes once per bar.

**Bar index.** The zero-based position of a bar within the dataset the engine was
given, oldest first. It is a position in the supplied data and not a universal
address, so it shifts when more history loads.

**Bare name.** A standard library name with no namespace prefix, such as `ema`,
`highest`, `plot` or `aqua`. Everyday functions are bare and the long tail lives
in namespaces.

**Block.** The lines indented more deeply than a header line such as `if`, `for`
or `case`. Indentation is spaces only, every line of one block carries exactly
the same leading whitespace, and there is no brace form.

**Bracket.** A target, a stop or a trailing stop attached to an open position,
placed with `exit()` or `order.bracket()`.

**Broadcast.** The automatic treatment of a plain value as that same value on
every bar, which is how `ema(close, 9)` accepts a literal where a series is
expected. It is the one automatic widening in the language and it changes no
value.

**Budget.** A per-bar ceiling on work, most often the loop iteration budget of
2,000,000 iterations, raised deliberately with `limits()`.

## C

**Catalogue.** The single machine-readable file of every diagnostic OpenScript
can emit, `spec/errors.json`, from which the per-code documentation pages are
generated. See [errors/overview.md](./errors/overview.md).

**Chart contract.** The descriptor a compiled study becomes: a data structure
with fields for the plotted columns, the shaded bands, the levels, the markers,
the table, the free drawings, the pane background, the price bar colours, the
watched conditions, the fixed pane range and the settings inputs.

**Check.** The stage that resolves names, types, scope and call sites, before any
bar runs. Most of the language is arranged so that problems are found here rather
than at runtime.

**Code.** The stable identifier on every diagnostic, of the form `OSNxxx`. A code
is never reused and never renumbered.

**Colour literal.** A named colour such as `aqua`, or a hex form such as
`#ff8800` or `#ff880080` with an alpha byte.

**Column.** One plotted series in the chart contract, created by one `plot` call
and named by its title.

**Compiled program.** The plain data structure of instructions a compiler emits
and an engine reads, defined by a versioned schema. Nothing turns text into
executable code at runtime.

**Condition.** A `bool` or absent expression used by `if`, `while`, a ternary, a
`switch` arm or an alert. An absent condition takes the false branch.

**Confirmed bar.** A bar whose interval has elapsed and which will not change
again. Every historical bar is confirmed; the newest bar of a live chart becomes
confirmed when its interval ends.

**Conformance suite.** The public set of cases (a script, input bars, expected
output) that every engine must reproduce exactly. Cross-engine disagreement on it
blocks a release.

**Continuation line.** A line that carries on the statement above it, because a
bracket is open, because the previous line ended in an operator or a comma, or
because it ended in a backslash. A continuation must be indented more deeply than
the statement's first line.

## D

**Declaration.** The `study(...)` or `strategy(...)` statement that every file
carries exactly one of, as its first statement after the optional version line.
It fixes the title, the pane, the precision and, for a strategy, the cost model.

**Deferred call.** A `signal`, `alert` or order call made on a bar that is still
moving. It waits for the bar to close, and if the condition that produced it is
no longer true by then, it never happens.

**Descriptor.** Another name for the chart contract: what the host receives when
a study is compiled.

**Determinism.** The rule that the same compiled program over the same bars
produces the same output on every engine, every time. There is no randomness and
no reading of the wall clock during a bar except through `chart.now()`.

**Diagnostic.** One error or warning as the compiler or an engine hands it over:
a code, a line, a column, a span and the values that fill the message.

**Drawing object.** A line, label, box or polyline created through the `draw`
namespace, which persists until the script deletes it and can be moved and
restyled over time.

## E

**Element access.** Reading one element of an array with `arr[i]` or
`element(arr, i)`. The checker distinguishes it from the history operator by the
type of the thing on the left.

**Engine.** A program that executes a compiled program bar by bar. Several may
exist, in several languages, and all must agree to the last decimal.

**Equity.** Starting capital plus realised and unrealised profit, readable in a
strategy as `pos.equity`.

**Error.** A diagnostic in ranges OS1xxx to OS7xxx. It stops compilation, or
stops the bar that raised it, and nothing is drawn from that bar.

## F

**Fill (a band).** The shaded region between two plotted columns, created by
`fill(plotA, plotB, ...)` at the top level.

**Fill (an order).** The execution of an order at a price. Where a signalled
order fills is set by the declaration's `fillOn` option, which defaults to the
next bar's open.

**File scope.** The scope holding every name assigned at the top level of a file
and every `fn` declared in it.

**Fixed shape.** The set of plotted columns, fills, levels, tables and inputs,
which must be known before bar 0 so the chart can build a legend, an axis and a
settings dialog. This is why those calls are top level only.

**Frequency.** The alert argument deciding how often one condition may fire.
[../spec/stdlib.md](../spec/stdlib.md) section 16.2 lists the values it takes.

**Front end.** The tokeniser, parser and checker for one language version. Every
past front end is kept in the compiler and selected by the file's version
declaration.

**Function.** A named calculation declared with `fn` at the top level. Functions
may not be nested, may not be recursive, and are not values in version 1.

## G

**Gap.** What an absent value draws: a plot breaks its line, a fill stops, a
level is not drawn, a bar keeps its own colour, a table cell is blank.

**Global scope.** The outermost scope, holding the standard library and the
built-in series. Assigning to a name in it is a shadowing attempt and an error.

**Group.** A heading that gathers rows in the settings dialog, or a category a
study appears under in a picker.

## H

**Handle.** The compile-time value a `plot` call returns, so that `fill` can name
two columns. A handle cannot be stored in a `var` or passed to a function.

**Higher timeframe read.** A value computed on a coarser interval and sampled
onto the chart's bars, written `req.timeframe(timeframe, expr, mode = ...)`.

**History operator.** `x[n]`, the value of a series `n` bars back. Reading past
the start of history is absent, not clamped and not zero.

```
close           // this bar's close
close[1]        // the previous bar's close, absent on bar 0
close[0]        // identical to close
```

**Host.** The application the engine runs inside: it supplies the bars, the
instrument facts, the timezone, the settings dialog, the alert delivery and the
order destination.

## I

**id.** The stable name of a watched condition, given to `alert()`. A user
subscribes to an id, so changing one costs every subscriber their subscription.

**Idempotent in the bar.** The property that executing the moving bar twice gives
the same answer as executing it once, which the rollback rule provides.

**Identifier.** A name in the source: an ASCII letter or underscore followed by
ASCII letters, digits and underscores, case sensitive.

**Input.** A tunable value declared with `input()` at the top level, which builds
one row of the settings dialog. The default comes first because it fixes the
type.

**Instrument fact.** A constant the host supplies about the instrument, read
through the `chart` namespace: tick size, lot size, point value, exchange, type.
An unknown fact is absent rather than guessed.

**Interval.** The chart's bar length, read as `chart.interval` in canonical form
and as `chart.intervalMinutes` in minutes.

## L

**Lands in.** The column in the library catalogue naming the chart contract field
a call produces. It is how a reader can see what a call actually does to the
chart.

**Level.** A fixed horizontal reference line in the study's pane, created by
`level(price, ...)` at the top level.

**Limits.** The optional `limits()` statement immediately after the declaration,
raising the per-bar loop budget or the retained series depth. Its arguments must
be literal numbers.

**Live var.** A `var` that does not roll back when the moving bar is re-executed,
so it accumulates across intrabar updates. It makes live and backtest numbers
differ by design, and raises warning OS8011.

**Lookahead.** The higher timeframe read mode that uses a coarse bar's final
value from inside that bar. It repaints on history permanently and by design,
must be written out, and marks the compiled study as repainting.

**Lot.** The number of units the host says trade together, read as
`chart.lotSize`. An order quantity that is not a whole multiple of it is refused.

## M

**Marker.** A named symbol drawn on one bar by `signal()`, with a shape, a
colour and a position above, below or at the price.

**Message.** The string an alert carries, evaluated on the bar its predicate
accepted. Absence propagates through string concatenation, so a message built
from an absent value is itself absent.

**Mode.** The argument on a higher timeframe read deciding what the read is
allowed to know, one of the modes [../spec/stdlib.md](../spec/stdlib.md) section
15.3 defines. It is the mechanism that makes a repainting study impossible to
write by accident.

**Moving bar.** The newest bar of a live chart, which is executed again on every
update until its interval elapses.

## N

**Namespace.** A name holding part of the long tail of the library: `bar`,
`chart`, `session`, `date`, `str`, `math`, `pos`, `order`, `draw` and `req`.

**Net position.** The one position a strategy holds in the chart's instrument,
positive long and negative short. There are no separate long and short books.

**none.** See absent value.

## O

**Offset.** The `plot` argument shifting where a column is drawn, never what it
contains. A positive offset puts the last values past the newest bar.

**onUnconfirmed.** The declaration option allowing signals, alerts and orders on
a bar that is still moving. It is off by default, and setting it makes the script
responsible for its own `bar.isConfirmed` guards.

**Overlay.** The declaration option putting the study on the price pane rather
than in a pane of its own.

**Overload.** More than one signature under one bare name, differing in arity or
in argument type and resolved at compile time, as in `sum(arr)` and
`sum(close, 20)`.

## P

**Pane.** A drawing area on the chart. A study is either drawn over the price
pane or given its own.

**Per-bar execution model.** The rule that the file is the body of a loop run
once per bar, top to bottom, in chronological order, with no main function and no
entry point.

**Persistence.** A value that carries forward from one bar to the next, declared
with `var`. It is a different question from history, which is a read of the past.

```
barCount = barCount[1] + 1  // history: absent on bar 0, and absent thereafter

var barCount = 0            // persistence: the value survives into the next bar
barCount = barCount + 1     // 1, 2, 3, ...
```

**Placeholder.** A named slot such as `{name}` in an error message template,
filled by the compiler and declared in the catalogue entry.

**Plot.** One column of one value per bar, declared at the top level and drawn
according to its style, width, colour, offset and scale.

**Precision.** The number of decimals on a study's axis and legend. Set on the
declaration; setting it on a plot drawn over the price pane reformats the
instrument's own axis.

**Predicate.** The chain of guards that reaches an `alert()` call, lifted by the
compiler into the watched condition the host evaluates.

**Product.** The strategy option choosing `"intraday"` or `"overnight"`
treatment of a position.

**Propagation.** The rule that an absent operand makes the result absent, which
holds for arithmetic, string concatenation and ordered comparison, and does not
hold for equality.

```
none + 1        // none
none * 0        // none, not 0
none < 5        // none, not false
none == none    // true: equality is the exception
```

**Pyramiding.** The strategy option capping how many entries may be added in one
direction before further entries are refused. It defaults to one.

## R

**Range (of codes).** One thousand block of error codes, OS1xxx to OS8xxx, saying
what kind of thing went wrong and never how serious it is.

**Range (of a pane).** The declaration option `range = [min, max]` fixing a study
pane's scale, as in `[0, 100]` for an oscillator.

**Repaint.** To redraw history differently after the fact, so that what the chart
shows today is not what it showed at the time. Only two things cause it: a
`"developing"` or `"lookahead"` read, and acting on an unconfirmed bar.

**Reserved word.** One of the words the language keeps for itself and will not
accept as a name, including several reserved now and unused in version 1 so that
adding them later cannot break an existing script.

**Rollback.** The rule that before each re-execution of the moving bar, every
persistent value is restored to what it held at the end of the previous bar. It
is what makes a live chart and a backtest of the same data agree.

**Runtime.** The stage that executes a bar. A runtime error stops that bar and
marks the study as errored, with the message on the chart.

## S

**Scope.** Where a name can be seen: global, file, or one block. A name is
declared by its first assignment in a scope, and an assignment to a name that
already exists in an enclosing scope updates it.

**Series.** The per-bar history of a value, written `series T`. Reading it bare
gives this bar's value and `[n]` gives the value `n` bars back.

**Session.** The instrument's trading session as the host defines it, not a
window the script invents. The `session` namespace reports its first bar, its
last bar and whether the current bar falls inside it.

**Settings dialog.** The generated panel of one row per `input()`, plus the style
rows the host adds for every plot. It is built once, before bar 0, which is why
inputs are top level only.

**Severity.** Whether a diagnostic is an error or a warning. It is a field on the
catalogue entry, not something the code range implies.

**Shadowing.** Declaring a name in an inner scope when the same name exists in an
enclosing scope. It is an error, OS2002, rather than a convenience.

**Short-circuit.** The rule that `and` and `or` evaluate their right operand only
when it can change the answer. A stateful call that is skipped this way does not
advance.

**Signal.** A named marker on one bar, `signal(text, ...)`. It is the whole of
shape plotting, and it is drawn on the chart rather than delivered like an alert.

**since.** The catalogue field recording the language version in which a
diagnostic code first appeared.

**Slippage.** Ticks of adverse price movement applied to every fill in a
backtest, set on the declaration.

**Source.** The input kind that lets a user choose which price a study reads,
one of the prices [../spec/stdlib.md](../spec/stdlib.md) section 13.1 lists for
it.

**Stage.** Where in the pipeline a diagnostic is raised, one of the stages
[errors/overview.md](./errors/overview.md) lists under "The stage, which tells
you when it was found". The stage tells you when you find out.

**State slot.** The per-call-site storage a stateful call keeps. State is
allocated per call site and not per function, which is what makes a stateful
helper reusable, and is also why recursion is not allowed.

**Stateful call.** A call that holds values between bars, such as `ema`, `rma`,
or any user function containing `var`. Inside a branch it advances only on the
bars where the branch runs, which is warning OS8001.

**Step.** A plot style that holds a value flat until it changes, which is the
honest way to draw a value that updates once per coarse bar.

**Strategy.** A file declared with `strategy()`: a study that can also place
orders, so the plotted numbers and the traded numbers are the same numbers.

**Study.** A file declared with `study()`: a calculation and the chart surface it
draws, with no ability to place an order.

**Subject.** The expression a value-form `switch` compares each `case` against.
The condition form has no subject and takes the first true arm.

## T

**Table.** A grid pinned to a corner of the pane, declared at the top level with
`table()` and written per bar with `cell()`.

**Ternary.** `cond ? a : b`. Both arms must have the same type, or one arm may be
absent, and only the taken arm is evaluated.

**Tick.** The instrument's smallest price increment, read as `chart.tickSize`.
It is absent rather than guessed when the host has not supplied it.

**Timeframe string.** A count and a unit, such as `"5"`, `"60"`, `"1h"`, `"1D"`,
`"1W"` or `"1M"`. The unit letters are case sensitive: `"1M"` is one month and
`"1m"` is one minute.

**Title.** The name of a study, a plot, a level or an input, used in the legend,
the settings dialog and the saved layout. Titles must be unique within a file.

**Top level.** The outermost indentation of a file, where the declaration, every
`fn`, and the calls [../spec/language.md](../spec/language.md) section 15.3 makes
top level only must appear, and where a name must be assigned for `[]` to read
its history.

**Truthiness.** The coercion of a non-boolean to a condition. It does not exist
in OpenScript: `if 1` is an error, and there is no rule to remember.

## U

**Unconfirmed bar.** A bar whose interval has not yet elapsed, so its values can
still change. Signals, alerts and orders are deferred on one by default.

## V

**var.** The declaration of a value that is initialised once, on the first bar
control reaches it, and keeps its value from bar to bar thereafter.

**Version declaration.** The optional first line, `version 1`, fixing which
front end parses the file for ever. Without it the file is parsed by the newest,
and the compiler warns.

## W

**Warmup.** The bars at the start of a run on which a calculation cannot yet
produce a value, expressed entirely through the absent value. Warmup lengths are
exact, stated per function, and compose.

**Warning.** A diagnostic in range OS8xxx. It stops nothing, is reported on its
line and in the editor's gutter, and describes a shape that is defined,
specified and almost never what the author meant.

**Watched condition.** One entry of the chart contract produced by an `alert()`
call site, carrying its id, title, message and predicate.

**Whole number.** A `number` with no fractional part, required by lengths and
array indices. A fractional value is refused rather than truncated, because a
length of 14.5 is a bug in the script and rounding it hides the bug.

## See also

- [getting-started.md](./getting-started.md) for the terms in the order you first meet them
- [faq.md](./faq.md) for the short answers these terms appear in
- [troubleshooting.md](./troubleshooting.md) for symptoms and fixes
- [alerts.md](./alerts.md) for alert, message, predicate and watched condition
- [errors/overview.md](./errors/overview.md) for code, stage, severity and catalogue
- [reference/keywords.md](./reference/keywords.md) and [reference/variables.md](./reference/variables.md) for the names themselves
- [../spec/language.md](../spec/language.md) and [../spec/stdlib.md](../spec/stdlib.md) for the definitions behind these terms
