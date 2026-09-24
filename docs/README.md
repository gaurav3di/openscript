# OpenScript documentation

By the end of this page you will know which of the pages in this set
answers the question in front of you, what order to read them in if you do not
yet have a question, and what every convention in them means, so that no page
has to explain itself twice.

This is the documentation, not the specification. The specification states the
rules; these pages teach them, in an order, with examples that run. Where the two
disagree about a detail, the specification is right and the page has a bug.

---

## Three ways in

Pick the one that describes you. Each is an ordered list: read it top to bottom
and every page assumes only the pages above it.

### I have never written a script

Fifteen pages, about a day if you type the examples rather than read them. You
end it with a study and a strategy of your own on a chart.

1. [getting-started.md](./getting-started.md): a line on a chart, and what
   happened between pressing Apply and its appearing.
2. [installing.md](./installing.md): where the file lives, so you can find it
   again tomorrow.
3. [editor-tour.md](./editor-tour.md): autocomplete, inline errors, and saving.
4. [first-study.md](./first-study.md): a complete indicator, built one addition
   at a time, with the whole script shown after every addition.
5. [inputs.md](./inputs.md): making it adjustable without reopening the source.
6. [visuals/plots.md](./visuals/plots.md): making the line look the way you want.
7. [language/execution-model.md](./language/execution-model.md): the one idea the
   whole language rests on, which is that your file runs again on every bar.
8. [language/absent-values.md](./language/absent-values.md): why your line starts
   late, and what a missing value does to the arithmetic around it.
9. [language/warmup.md](./language/warmup.md): how many bars it starts late by,
   exactly, and how to know rather than guess.
10. [first-strategy.md](./first-strategy.md): the same script, now taking a
    position, carrying a stop, and producing a report.
11. [strategies/overview.md](./strategies/overview.md): what happens, in what
    order, on every bar a strategy runs.
12. [running/backtesting.md](./running/backtesting.md): running it over a range
    you chose on purpose.
13. [running/reading-a-report.md](./running/reading-a-report.md): which numbers in
    that report mean something and which only flatter.
14. [data/repainting.md](./data/repainting.md): the mistake that makes a backtest
    beautiful and a live run poor. Read it before you believe a result.
15. [writing/style-guide.md](./writing/style-guide.md): so the script is still
    readable when you come back to it in March.

Keep [glossary.md](./glossary.md) open beside all of it. Every term the set uses
is defined there once, alphabetically.

### I know another per-bar language and want the differences

You already have the model: a script that runs once per bar, a series that
remembers its own past, plots that fall out of the top level. These twelve pages
are where OpenScript is not what your reflexes expect.

1. [language/execution-model.md](./language/execution-model.md): what is
   recomputed from nothing each bar and what is carried, stated precisely.
2. [language/persistence.md](./language/persistence.md): persistence is a property
   of a declaration, and this page shows which line is doing the remembering.
3. [language/variables-and-scope.md](./language/variables-and-scope.md): the
   difference between creating a name and updating one, and why shadowing a name
   in a nested scope is an error rather than a convenience.
4. [language/absent-values.md](./language/absent-values.md): `none` is a member of
   every type, it propagates through arithmetic, and it does not quietly become
   zero or false. Most bugs in a ported script are here.
5. [language/types-and-values.md](./language/types-and-values.md): which
   conversions exist, and which are refused before the script ever runs.
6. [language/bars-and-history.md](./language/bars-and-history.md): which
   expressions may be indexed into the past at all, which may not, and why that
   restriction is what buys a fixed memory bound.
7. [language/realtime-and-confirmation.md](./language/realtime-and-confirmation.md):
   a bar that is still forming, and a signal that cannot be withdrawn after you
   have acted on it.
8. [data/higher-timeframes.md](./data/higher-timeframes.md): a coarser interval is
   read in one of three declared modes, and there is no default that hides the
   choice from you.
9. [data/repainting.md](./data/repainting.md): the four causes, named, and the two
   the compiler warns about on its own.
10. [strategies/orders.md](./strategies/orders.md): when a signalled order actually
    fills, and what happens to a working order when the next signal arrives.
11. [reference/keywords.md](./reference/keywords.md),
    [reference/operators.md](./reference/operators.md) and
    [reference/constants.md](./reference/constants.md): the whole surface
    vocabulary in three pages, to skim for what is missing.
12. [writing/limits.md](./writing/limits.md): the budgets a script runs inside,
    and which of them belong to the language rather than to the host.

Then read section 17 of [../spec/language.md](../spec/language.md), which is a
short list of deliberate departures from what an existing chart scripting
language would do, each with its reason. If you have scripts written in the
version-annotated chart dialect, [writing/importing-a-script.md](./writing/importing-a-script.md)
translates them and tells you, statement by statement, where the two languages
part.

### I need one specific answer

Go straight to the shelf that holds your kind of question.

1. A code on the screen, such as `OS3007`:
   [errors/overview.md](./errors/overview.md) for what the range means, then the
   catalogue entry in [../spec/errors.md](../spec/errors.md).
2. A symptom with no code, such as a blank pane, a line that stops short, a signal
   that fired twice, a backtest that disagrees with the chart:
   [troubleshooting.md](./troubleshooting.md), which is organised by symptom
   rather than by cause.
3. The name of a function, a built-in variable, an operator or a constant: the
   reference tables listed under [reference/](#reference-the-whole-vocabulary)
   below. Each page is a table you can search.
4. A word a page used that you do not know: [glossary.md](./glossary.md).
5. A question you suspect everybody asks: [faq.md](./faq.md), which answers it in
   three lines and links to the page that answers it in three hundred.
6. The exact signature, the exact warmup, or the exact rule:
   [../spec/stdlib.md](../spec/stdlib.md) and
   [../spec/language.md](../spec/language.md).

---

## How to read anything in this set

Three conventions run through every page. Learning them here saves
every page from restating them.

### Examples are complete scripts

An example is written in OpenScript and nothing else, and unless the prose around
it says it is a fragment, it is a whole file you can paste into an empty script
and apply. It carries its `version` line and its `study` or `strategy`
declaration, because those are what make the file a program rather than a
snippet.

```
version 1

study("ATR band", overlay = true, precision = 2)

len  = input(20,  "Length",     min = 1,   max = 500)
mult = input(2.0, "Multiplier", min = 0.1, max = 10)

basis = sma(close, len)
width = atr(len) * mult

plot(basis,         "Basis", orange, width = 2)
plot(basis + width, "Upper", aqua)
plot(basis - width, "Lower", aqua)
```

Code blocks carry no language tag, because the language is OpenScript everywhere
in this set. A block that is not OpenScript is something a tool printed: a
diagnostic, a report, a directory listing, and the prose says so before it.

Comments inside an example say why a line is written the way it is, not what the
line does. A reader who wants to know what `atr` computes has
[reference/functions/ta.md](./reference/functions/ta.md) for that; a reader
looking at an example wants to know why the author put the call where they put
it. Examples are also kept small on purpose. Three short scripts that each make
one point are easier to hold in your head than one long script that makes three,
so a page that could have shown a hundred lines usually shows thirty, three
times.

Twelve longer, complete scripts live in [../examples/](../examples/) and are
linked from the pages whose feature they exercise. Read those when you want to
see a whole idea rather than a single call.

### A warmup note is a promise

Almost every calculation over a window is unable to produce a value until that
window has filled. The bars before it can are the warmup, and every function in
the reference states its own.

The note is exact, not approximate. "Warmup: bar `len - 1`" means the call returns
`none` on every bar before bar `len - 1`, counting the oldest bar in the dataset
as bar 0, and returns a real number from bar `len - 1` onward. It does not mean
roughly that many bars, and it does not mean the value is unreliable for a while
and then quietly settles.

Warmups compose, because a call cannot start before its input has: `sma(ema(close,
10), 10)` is absent until bar 18, not bar 9. That is why a page will sometimes add
up the warmups of a whole script and print the total, and why
[language/warmup.md](./language/warmup.md) exists as a page of its own.

```
version 1

study("Warmup, made visible")

len = input(20, "Length")

value = sma(close, len)

// Absent before bar len - 1, so the line simply starts there. The gap is not a
// bug: it is the honest form of "there is no answer for this bar yet".
plot(value, "Average", aqua)

// The same series with the absence replaced deliberately, which is a decision
// you make in the open, never one the language makes quietly for you.
plot(orElse(value, close), "Average, filled", gray)
```

Where a warmup depends on an input, the note is written as a formula over that
input rather than as a number, because the number changes the moment your reader
changes the setting.

### Error codes are referenced, never explained twice

Every diagnostic OpenScript emits carries a stable code: `OS` followed by four
digits. The thousands digit says which part of the system produced it.

| Range | Produced by |
|---|---|
| `OS1xxx` | Syntax: the source text is not a program |
| `OS2xxx` | Names and types: it parses, and the meaning does not work out |
| `OS3xxx` | Arguments: a call or an option is wrong where it is written |
| `OS4xxx` | Runtime: a bar produced something the engine cannot act on |
| `OS5xxx` | Limits: a budget was exhausted |
| `OS6xxx` | Data: bars, instruments, timeframes and the host's answers |
| `OS7xxx` | Orders: an order could not be placed as written |
| `OS8xxx` | Warnings: it compiles, it runs, and it is probably not what you meant |
| `OS9xxx` | Import: a script in another chart language could not be translated as written, or was translated with a stated difference |

When a page tells you something is an error, it names the code inline and moves
on. The code is the index into the catalogue; the page does not reproduce the
catalogue entry, because there is exactly one authoritative wording for each and
it lives in [../spec/errors.md](../spec/errors.md). The teaching page tells you
why the rule exists. The catalogue tells you the message, the cause and the fix,
in the same words the editor puts under your caret.

```
version 1

study("Stateful call in a branch")

if close > open
    e = ema(close, 20)
    signal("UP")
```

That compiles, and warns:

```
 6 |     e = ema(close, 20)
   |         ^^^^^^^^^^^^^^
OS8001: ema advances only on the bars where this branch runs, and is absent on
the rest.
Fix: compute it unconditionally at the top level and use the result inside the
branch.
```

Read that as the division of labour across the whole set:
[language/functions.md](./language/functions.md) explains why a stateful call
behaves that way, [errors/overview.md](./errors/overview.md) explains how to read
any diagnostic at all, and the catalogue holds the one true text of `OS8001`.

Codes are assigned once and never reused or renumbered, so quoting one in a bug
report, a log or a link stays meaningful indefinitely. That stability is also why
it is safe for a page to cite a code instead of a document section: the code
cannot move, and a section can.

---

## Every page

Seventy-two pages plus this index, grouped by folder. The second column says what
the page answers, which is not the same thing as what it is called.

### Start here

| Page | Answers |
|---|---|
| [getting-started.md](./getting-started.md) | What actually happens between pressing Apply and a line appearing, and what to do when nothing does |
| [installing.md](./installing.md) | Where a script file has to sit on disk, and what to send somebody so their copy behaves like yours |
| [editor-tour.md](./editor-tour.md) | How to get autocomplete and inline errors working for you, and why the chart in front of you is not always the source in front of you |
| [first-study.md](./first-study.md) | What a real indicator looks like at every stage between an empty file and a configurable one |
| [first-strategy.md](./first-strategy.md) | What has to change for a script that marks a signal to become one that carries a position, a stop and a report |
| [inputs.md](./inputs.md) | Which control to give each tunable value, and how to stop a reader entering a length of zero |
| [settings-and-style.md](./settings-and-style.md) | Which rows of the settings dialog you wrote, which the host generated, and what survives a reader changing them |
| [alerts.md](./alerts.md) | How a condition becomes a message that leaves the chart, and which bar it is allowed to fire on |
| [revisions.md](./revisions.md) | What a save writes, and why editing a script cannot change a backtest that has already run |
| [glossary.md](./glossary.md) | What a word means, when a page used it and you did not want to stop |
| [faq.md](./faq.md) | The three-line answer to a first-week question, with a link to the long one |
| [troubleshooting.md](./troubleshooting.md) | Which cause produces the symptom you are looking at, worked backwards from the symptom |

### language/ (how a script behaves)

| Page | Answers |
|---|---|
| [language/execution-model.md](./language/execution-model.md) | Line by line, what is computed from nothing on every bar, what is carried forward, and in what order the chart is handed the result |
| [language/types-and-values.md](./language/types-and-values.md) | What type a value has, how a series differs from a single value, and which conversions the compiler refuses |
| [language/variables-and-scope.md](./language/variables-and-scope.md) | Whether a given assignment is creating a name or updating one, and what that name is visible to |
| [language/operators.md](./language/operators.md) | What binds first, what division gives you, and what a comparison against an absent operand returns |
| [language/control-flow.md](./language/control-flow.md) | What each branching and looping form does when its condition is absent, and what stops a runaway loop |
| [language/functions.md](./language/functions.md) | How to write one, return several values from it, and predict what a function that remembers something does at each call site |
| [language/persistence.md](./language/persistence.md) | Which line of your script is doing the remembering, and when the remembered value settles |
| [language/absent-values.md](./language/absent-values.md) | Which bars hold `none`, and how it travels through arithmetic, comparison and boolean logic without becoming zero |
| [language/bars-and-history.md](./language/bars-and-history.md) | How far back you may look, what you get past the start of history, and which expressions may be indexed at all |
| [language/warmup.md](./language/warmup.md) | Exactly how many bars your study needs before it can honestly draw, and how to see that number rather than estimate it |
| [language/realtime-and-confirmation.md](./language/realtime-and-confirmation.md) | Whether a line is reading a settled fact or a number still moving, and how to write a signal that cannot be taken back |
| [language/collections.md](./language/collections.md) | How to hold a list, which collection types exist and which deliberately do not, and which lists outlive the bar |
| [language/objects-and-methods.md](./language/objects-and-methods.md) | How to create a drawing, change it on a later bar, keep track of it, and decide when it should be deleted |
| [language/libraries.md](./language/libraries.md) | How to share a block of functions between scripts without losing track of which copy is current |

### visuals/ (what lands on the chart)

| Page | Answers |
|---|---|
| [visuals/overview.md](./visuals/overview.md) | Which call makes the picture you have in mind, which pane it lands in, and what it costs |
| [visuals/plots.md](./visuals/plots.md) | How to control a column of numbers: its shape, its colour on each bar, its width, its pane, its axis and its offset |
| [visuals/fills.md](./visuals/fills.md) | How to shade between two plots, or between a plot and a fixed value, with a colour per side of the crossing |
| [visuals/levels.md](./visuals/levels.md) | How to put horizontal reference lines in a pane, pin its scale so it stops rescaling, and control what the price axis says |
| [visuals/labels-and-shapes.md](./visuals/labels-and-shapes.md) | Which of the two calls that mark a bar to use, where the mark anchors, and what to hang in its tooltip |
| [visuals/lines-and-boxes.md](./visuals/lines-and-boxes.md) | How to anchor, move, extend and delete geometry so a study over fifty thousand bars still fits its budget |
| [visuals/tables.md](./visuals/tables.md) | How to pin a grid to a corner, write cells only on the bar that matters, and fake the merged cell the language lacks |
| [visuals/bar-coloring-and-backgrounds.md](./visuals/bar-coloring-and-backgrounds.md) | How to recolour the instrument's candles and shade the pane, and who wins when two studies both want to paint |
| [visuals/colors.md](./visuals/colors.md) | How to build a colour, fade it by the right amount for the surface it lands on, vary it per bar, and keep it legible on both themes |

### strategies/ (taking a position)

| Page | Answers |
|---|---|
| [strategies/overview.md](./strategies/overview.md) | What a strategy does that a study does not, in what order it happens on each bar, and why it can do none of it for real until somebody switches it to live |
| [strategies/orders.md](./strategies/orders.md) | How to declare the contracts a strategy trades, place, name, cancel and reverse an order on one of them, and what happens when the next signal arrives while one is still working |
| [strategies/reading-the-books.md](./strategies/reading-the-books.md) | What a strategy's own order rows, fills and positions say, how to read them from a script, and why one fill can be reported twice without being counted twice |
| [strategies/position-and-sizing.md](./strategies/position-and-sizing.md) | What a strategy knows about its own position, and how to size from quantity, lots, money at risk or volatility |
| [strategies/exits-and-brackets.md](./strategies/exits-and-brackets.md) | Every risk rule the language has, per leg, per strategy and per session, the order they are evaluated in, and which one to read in a log after a bad day |
| [strategies/costs-and-fills.md](./strategies/costs-and-fills.md) | Where your backtest assumed each fill happened, what that assumption is worth, and how to price the real cost stack in |

### data/ (where the numbers come from)

| Page | Answers |
|---|---|
| [data/timeframes.md](./data/timeframes.md) | How to read the chart's own interval, and write a study that means the same thing on any of them |
| [data/higher-timeframes.md](./data/higher-timeframes.md) | How to read a coarser interval, which of the three modes to declare, and what each returns on a coarse bar that has not closed |
| [data/other-instruments.md](./data/other-instruments.md) | How to read an instrument that is not on the chart, tell whether the answer has arrived, and handle a bar that is missing |
| [data/sessions-and-time.md](./data/sessions-and-time.md) | How to find the first and last bar of a session, read calendar fields in the zone the axis is labelled in, and survive a holiday |
| [data/repainting.md](./data/repainting.md) | The four things that cause it, how to see it on your own chart in a minute, and the few cases where it is acceptable |

### running/ (putting it to work)

| Page | Answers |
|---|---|
| [running/backtesting.md](./running/backtesting.md) | How much history a run needs before its first trade means anything, and how to reproduce that run later |
| [running/reading-a-report.md](./running/reading-a-report.md) | What each number is measuring, which ones flatter a strategy while saying nothing, and whether the gap between two runs is real |
| [running/sandbox-and-live.md](./running/sandbox-and-live.md) | What sandbox mode does not simulate, and what to check before a script can touch a real account |
| [running/scheduling.md](./running/scheduling.md) | How to start and stop many strategies on the exchange's calendar, and what a restart does to an open position |

### writing/ (keeping a script good)

| Page | Answers |
|---|---|
| [writing/style-guide.md](./writing/style-guide.md) | How to lay out, name and comment a file so a stranger, including you in six months, can read it top to bottom |
| [writing/debugging.md](./writing/debugging.md) | How to find the exact bar on which a number first goes wrong, and the exact line that did it |
| [writing/testing.md](./writing/testing.md) | How to prove a script computes what you believe it computes, and decide honestly whether it is ready for money |
| [writing/profiling.md](./writing/profiling.md) | Which part of a slow script is actually costing the time, measured rather than guessed at |
| [writing/limits.md](./writing/limits.md) | Every budget a script runs inside, which belong to the language and which to the host, and what to do when you reach one |
| [writing/publishing.md](./writing/publishing.md) | How to package a script for somebody who did not write it, and version it so nobody's chart changes underneath them |
| [writing/importing-a-script.md](./writing/importing-a-script.md) | How to turn a script written in another chart language into OpenScript, and which of its lines came across exactly, which with a stated difference and which not at all |

### reference/ (the whole vocabulary)

Reference pages are tables first and prose second. They are written to be
searched rather than read in order, and every entry states its type and, where it
has one, its warmup.

| Page | Answers |
|---|---|
| [reference/variables.md](./reference/variables.md) | Every name you can read without declaring it, its type, and whether it changes bar by bar |
| [reference/keywords.md](./reference/keywords.md) | All thirty-six reserved words, which of them do nothing yet, and what none of them may be used for |
| [reference/operators.md](./reference/operators.md) | Precedence, associativity, accepted types and absent-operand behaviour, in one place |
| [reference/constants.md](./reference/constants.md) | Every named constant, and every closed set of string values accepted where another language would have given you a constant |
| [reference/functions/ta.md](./reference/functions/ta.md) | Which averages, trend measures, oscillators, volatility measures and volume studies exist, and the first bar each can produce a value for |
| [reference/functions/series.md](./reference/functions/series.md) | Bar data, chart and instrument facts, and the cross-bar helpers: window extremes, changes, crossings, counters, pivots |
| [reference/functions/math.md](./reference/functions/math.md) | Arithmetic, rounding and statistics, and what each does at its edges: where it is absent and where it raises |
| [reference/functions/string.md](./reference/functions/string.md) | How to build display text, format a number without changing it, and line a column up so it reads as a table |
| [reference/functions/time.md](./reference/functions/time.md) | How to read a timestamp as a calendar, render it as text, and test a bar against a session or a named window |
| [reference/functions/color.md](./reference/functions/color.md) | How to name, build, fade and blend a colour, and which argument takes a percentage and which a fraction |
| [reference/functions/drawing.md](./reference/functions/drawing.md) | Every call that puts something on the chart, in one table, with what each one costs |
| [reference/functions/input.md](./reference/functions/input.md) | Every kind of input and the arguments each one accepts |
| [reference/functions/strategy.md](./reference/functions/strategy.md) | Every order, bracket, sizing and position-reading call, and exactly when a signalled order fills |
| [reference/functions/request.md](./reference/functions/request.md) | The calls that reach for another timeframe or another instrument, and the mode argument that says what a read is allowed to know |
| [reference/functions/collections.md](./reference/functions/collections.md) | Every array operation, and why copying, indexing and iteration behave the way they do |

### errors/

| Page | Answers |
|---|---|
| [errors/overview.md](./errors/overview.md) | How to read any diagnostic, what its range tells you before you look it up, and whether anything actually stopped |

Individual codes are not documented here. They live in
[../spec/errors.md](../spec/errors.md), one entry per code, generated from the
same file the compiler and the editor read, so that the three cannot drift apart.

---

## When to read the specification instead

The specification is in [../spec/](../spec/). Read it when you need the rule
rather than the teaching: an exact signature, an exact warmup, the precise
behaviour at an edge, the grammar, or the wording of a diagnostic. These pages
are allowed to simplify in order to make a point, and the specification is not.

Which documents the specification has, what each one holds, and which of them
wins where two disagree are in [../spec/README.md](../spec/README.md), which is
the only place that list is written. Open that page first. Direct links, so that
nothing in `spec/` is more than one click away:

- [../spec/language.md](../spec/language.md)
- [../spec/stdlib.md](../spec/stdlib.md)
- [../spec/errors.md](../spec/errors.md)
- [../spec/compiled-program.md](../spec/compiled-program.md)
- [../spec/host-interface.md](../spec/host-interface.md)
- [../spec/conformance.md](../spec/conformance.md)
- [../spec/feature-matrix.md](../spec/feature-matrix.md)
- [../spec/decisions.md](../spec/decisions.md)

One practical rule: the moment you are about to guess what a function does on its
first bar, stop guessing and open `stdlib.md`. Every entry states it.

## See also

- [../README.md](../README.md) for what OpenScript is and why it exists
- [../ROADMAP.md](../ROADMAP.md) for what is built, what is being built, and in what order
- [../spec/README.md](../spec/README.md) for how the specification documents fit together
- [../examples/README.md](../examples/README.md) for twelve complete scripts and what each one proves
- [../CONTRIBUTING.md](../CONTRIBUTING.md) for how to propose a change to a page or to the language

## Integrating OpenScript into a platform

For a broker, an exchange or any platform that wants its traders writing scripts.
What you get, what you supply, and the three routes to adopting it.

- [integrating/README.md](./integrating/README.md) - which route fits you
- [integrating/running-the-engine.md](./integrating/running-the-engine.md) - install it and implement the host interface
- [integrating/your-own-engine.md](./integrating/your-own-engine.md) - implement the format in your own language
- [integrating/the-python-engine.md](./integrating/the-python-engine.md) - the second engine in this repository: what is in it, how to run it, what refuses bad code in it
- [integrating/running-a-strategy.md](./integrating/running-a-strategy.md) - driving that engine from your own host: a program loaded once, bars pushed at it one at a time, and the rollback a moving bar rests on
- [integrating/backtesting.md](./integrating/backtesting.md) - what a backtest gives you and what you fill in
- [integrating/the-editor-half.md](./integrating/the-editor-half.md) - the language intelligence an editor needs, and what stays yours
- [integrating/running-the-suite.md](./integrating/running-the-suite.md) - run the conformance suite against an engine, or two engines against each other, which is what the build does
- [integrating/the-documentation-site.md](./integrating/the-documentation-site.md) - build these pages, the specification and a page per error code into a static site, and serve it from anywhere
