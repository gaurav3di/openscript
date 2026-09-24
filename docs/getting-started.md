# Getting started

By the end of this page you will have a working script drawing a line on a
chart, and you will know exactly what happened between pressing Apply and that
line appearing.

## Contents

1. [What OpenScript is](#what-openscript-is)
2. [The four parts of every file](#the-four-parts-of-every-file)
3. [Where a script lives](#where-a-script-lives)
4. [The shortest script that draws something](#the-shortest-script-that-draws-something)
5. [What happens when you press Apply](#what-happens-when-you-press-apply)
6. [What the chart is handed](#what-the-chart-is-handed)
7. [Once per bar, top to bottom](#once-per-bar-top-to-bottom)
8. [Your line starts late, and that is correct](#your-line-starts-late-and-that-is-correct)
9. [Three rules that will save you an afternoon](#three-rules-that-will-save-you-an-afternoon)
10. [The errors you will meet on day one](#the-errors-you-will-meet-on-day-one)
11. [Where to go next](#where-to-go-next)

---

## What OpenScript is

OpenScript is a language for writing what you want to see on a chart, and what
you want to trade when you see it. A file written in it is called a **script**.
A script that only draws is a **study**. A script that also places orders is a
**strategy**. They are the same language and the same file format; a strategy is
a study with orders added, so the numbers you plot and the numbers you trade are
computed once, in one place, and cannot disagree.

Three properties are worth knowing before you write a line, because everything
else follows from them.

**A script is a plain text file that you own.** Not a row in somebody's
database. It sits in a folder, it can go into version control, you can diff it,
you can mail it to a friend, and you can open it in whatever editor you like.

**A script runs once per bar.** There is no main function and no event handler.
The file itself is the body of a loop that the engine runs over every bar of the
chart, oldest first, from the first line to the last. That single fact explains
most of the language.

**A script is compiled into data, not into code.** The compiler does not emit
source code in any host language, and nothing anywhere calls `eval`. It produces
a **compiled program**:
a flat list of instructions and a few tables, which any engine can walk. That is
why it can run inside a strict security policy with nothing for anyone to
approve, and why a second engine written by somebody else can produce the same
numbers to the last decimal.

## The four parts of every file

Every script has the same shape. Only two of the four parts are required.

| Part | Required | Example | Notes |
|---|---|---|---|
| The version line | No, but always write it | `version 1` | The first line that is not blank and not a comment |
| The declaration | Yes, exactly one | `study("My first study", overlay = true)` | Names the script and decides where it draws |
| The limits line | No | `limits(loops = 50_000_000)` | If present, it comes immediately after the declaration |
| The body | Yes | everything else | Runs top to bottom, once per bar |

The version line is optional and you should still write it. A file that declares
`version 1` is parsed by the version 1 front end forever, and the project's
compatibility promise is that it will keep producing the same numbers under every
later release. Leave it out and the file is compiled with the newest version the
compiler has, which may not be the version you wrote it under, and you get
warning OS8003 telling you the exact line to add.

The declaration must be the first statement after the version line and any
leading comments. A file with none is error OS2007; a file with two is OS2008.
There is one declaration rather than an optional second one because two would
need a rule for whose `overlay` setting wins, and the answer to that question is
always that there should only have been one.

## Where a script lives

A script is one file with the extension `.oscript`, in the folder the host keeps
scripts in. The editor panel is a view onto that folder: creating a script writes
a file, saving writes a revision, and a file you drop into the folder from
outside shows up in the picker without a rebuild, a restart or a build step of
any kind.

There is no project file, no manifest to register your script in, no dependency
to install and nothing to compile ahead of time. The full story, including how to
share a script and how to remove one, is in [installing.md](./installing.md).

## The shortest script that draws something

Three lines of substance:

```
version 1

study("My first study", overlay = true)

plot(close, "Close", aqua)
```

Type it, press Apply, and an aqua line traces the closing price across the chart.
Reading it back:

- `study(...)` names the script. The name appears in the legend row and in the
  picker.
- `overlay = true` puts the drawing on the price pane. Leave it out and the
  default is `false`, which gives the study its own pane underneath. That default
  is the right one for an oscillator and the wrong one for a moving average, so
  it is the option you will set most often.
- `close` is a built-in series: one value per bar, the bar's closing price. So
  are `open`, `high`, `low`, `volume`, `time`, and the convenience averages
  such as `hl2` that [../spec/language.md](../spec/language.md) section 15.1
  lists with them.
- `plot(value, title, colour)` draws one column of numbers. The title is what the
  legend shows and what the settings dialog calls that line. The colour is
  optional; drop it and the host picks one.

Now something that is actually worth looking at. A twenty bar average, with the
length exposed as a setting:

```
version 1

study("Simple average", overlay = true, precision = 2)

length = input(20, "Length", min = 2, max = 500)

basis = sma(close, length)

plot(basis, "Average", orange, width = 2)
```

`input()` does two things at once: it gives you a name to use in the script, and
it builds one row of the settings dialog. The type of the control comes from the
type of the default value, which is why the default is the first argument: `20`
gives you a number field, `true` would give a checkbox, `aqua` a colour swatch,
and `close` a source picker offering the built-in series.

And a script that draws in its own pane, with a fixed scale and two reference
lines:

```
version 1

study("RSI", precision = 2, range = [0, 100])

length = input(14, "Length", min = 2, max = 500)

level(70, "Overbought", red)
level(30, "Oversold", lime)

plot(rsi(close, length), "RSI", purple, width = 2)
```

No `overlay = true` this time, so it gets its own pane. `range = [0, 100]` pins
that pane's scale so the 70 and 30 lines always sit in the same place instead of
the pane rescaling itself every time price moves.

## What happens when you press Apply

Apply is one button and five steps. The first four run once and take
milliseconds. The fifth runs once per bar, which on a long chart means tens of
thousands of times, and is where all the time actually goes.

| Step | What it does | What it can tell you |
|---|---|---|
| 1. Characters into tokens | Reads the text into words, numbers, strings and punctuation | OS1001 unexpected character, OS1002 a tab in the indentation, OS1004 an unterminated string |
| 2. Tokens into a tree | Works out the structure: which lines are inside which block, what each expression is | OS1006 an assignment used as a condition, OS1008 a chained comparison, OS1012 a bracket never closed |
| 3. Check the tree | Names, types, scope, every call site and every argument, before any bar has run | OS2xxx names and types, OS3xxx arguments, and the OS8xxx warnings |
| 4. Tree into a compiled program | Flattens the checked tree into an instruction list plus tables of constants, series, inputs and outputs | Nothing you will normally see; OS5009 if the program is enormous |
| 5. Run the program, bar by bar | Executes the instruction list over every bar, oldest first | OS4xxx a bar produced something unusable, OS5xxx a budget was exhausted, OS6xxx a data problem, OS7xxx an order problem |

Two things follow from that split, and both matter in practice.

**A mistake in the first four steps costs you nothing.** Nothing is drawn, no
order is placed, and the chart keeps showing whatever it was showing before. The
editor underlines the exact character, gives you the code, the message and a fix.

**A mistake in the fifth step is a per-bar event.** A runtime error stops the bar
that raised it and marks the study as errored with the message on the chart. It
does not silently skip the bar and carry on, because a gap with no explanation is
indistinguishable from a gap you meant to be there.

Between steps 4 and 5 there is a step with no errors of its own, and it is the
one that makes the settings dialog exist: the host reads the compiled program's
list of inputs and its list of outputs and builds the dialog, the legend row and
the pane before the first bar runs. This is why the calls `language.md` section 15.3
lists as top level only have to sit at the top level of the file and can never be
wrapped in an `if`. The shape of the study is fixed before any data is seen. Section
[Three rules](#three-rules-that-will-save-you-an-afternoon) below says what to do
instead.

## What the chart is handed

Step 4 produces a compiled program. Running it over the bars produces a
**descriptor**: the complete description of what this script wants drawn. Every
drawing call in the language lands in exactly one field of it.

| What you wrote | Where it lands |
|---|---|
| `study(overlay = ...)` | Whether this is on the price pane or its own |
| `input(...)` | One row of the settings dialog, with its label, group and tooltip |
| `plot(...)` | One plotted column, with its values, colour, width and style |
| `fill(...)` | One shaded band between two columns |
| `level(...)` | One horizontal reference line |
| `signal(...)` | One marker anchored to a bar |
| `barColor(...)` | The colour of the instrument's own candles, per bar |
| `background(...)` | The shading behind the pane, per bar |
| `table(...)`, `cell(...)` | The grid pinned to a corner |
| `draw.line` and the other creation calls [../spec/stdlib.md](../spec/stdlib.md) section 18 lists | Free drawings, one entry per live object |
| `alert(...)` | One watched condition, with its id and message |
| Orders | No field at all. Orders go to the order route, not to the chart |

The last row is deliberate and worth reading twice. The chart shows what
happened. The order route decides what happens. A strategy's stop appears on your
chart only because you plotted it, not because placing it drew it.

## Once per bar, top to bottom

This script makes the execution model visible:

```
version 1

study("What runs when")

var barsSeen = 0
barsSeen = barsSeen + 1

plot(bar.index, "Bar index", aqua)
plot(barsSeen,  "Bars seen", orange)
```

Both lines draw the same staircase. `bar.index` is the position of the bar being
executed, counting the oldest bar as 0. `barsSeen` counts the same thing by hand,
and needs `var` to do it: a plain assignment is recomputed from scratch every
bar, while a `var` is initialised once and then keeps its value from bar to bar.

The operator `[n]` reads the past: `close[1]` is the previous bar's close,
`close[0]` is the same as `close`. On the oldest bar `close[1]` is absent, not
clamped to `close[0]`, because inventing a value that looks like data is worse
than showing a gap.

One more fact about the newest bar of a live chart: it is executed again on every
update. Before each re-execution, every persistent value is restored to what it
held at the end of the previous bar, so running the moving bar ten times gives
the same answer as running it once. That is why the counter above counts bars and
not ticks, and it is why a live chart and a backtest over the same data agree.

## Your line starts late, and that is correct

`sma(close, 20)` cannot produce a number until twenty bars exist. It does not
produce zero, and it does not produce an approximation. It produces **the absent
value**, written `none`, on bars 0 to 18, and a real number from bar 19 onward.
Your plot simply starts at bar 19.

Every library function states its warmup exactly, in bars, and two engines that
disagree about a single warmup bar fail the conformance suite. A few you will hit
early:

| Call | First bar with a value | Why |
|---|---|---|
| `sma(src, len)` | bar `len - 1` | It needs `len` values |
| `ema(src, len)` | bar `len - 1` | Seeded on that bar with the simple average of those `len` values |
| `rsi(src, len)` | bar `len` | It consumes `len` changes, and a change needs two bars |
| `atr(len)` | bar `len - 1` | |
| `crossUp(a, b)` | bar 1 | It compares this bar against the previous one |

Absence is not a special case bolted on the side; it is a value that travels.
`none + 1` is `none`. `none * 0` is `none`, not zero, because the operand was not
zero, it was unknown. A division by zero is `none` rather than an error, so one
bad bar does not kill a study that is correct over the other fifty thousand. And
an absent value reaching anything drawn is a gap: a line breaks, a band stops, a
bar keeps its own colour, a table cell is blank.

Two tools handle it:

```
r = rsi(close, 14)

safe = orElse(r, 50)        // 50 while rsi is still warming up

if isNone(r)
    background(fade(gray, 90))
```

The one rule that catches people out: an ordered comparison against an absent
value is absent, not false. During warmup, `r > 70` and `r <= 70` are **both**
absent, and both branches are skipped. That is on purpose. If a comparison
against an absent value returned false, then `a > b` and `a <= b` would both be
false, a script that branches on one and assumes the other is its opposite would
take the wrong path during warmup, and nobody would notice, because warmup bars
are off the left edge of the screen.

Equality is the deliberate exception. `x == none` is always `true` or `false` and
never absent, so you can always ask the question directly.

## Three rules that will save you an afternoon

**One. Hide a plot with `none`, never with an `if`.**

```
plot(trending ? ema20 : none, "EMA 20", aqua)   // correct
if trending
    plot(ema20, "EMA 20", aqua)                 // OS3006
```

The set of columns has to be known before bar 0 so the legend and the settings
dialog can exist. A plot given `none` draws nothing on that bar, which is exactly
what wrapping it in an `if` was trying to achieve.

**Two. Compute a stateful call at the top level, use it inside the branch.**

```
e = ema(close, 20)              // every bar
if trending
    signal("ABOVE " + text(round(e)))
```

A call inside an `if` only advances on the bars where the branch is taken, and is
absent on the others, which produces a broken line that looks like a bug in the
data. The compiler warns about it (OS8001) the first time you write it.

**Three. Nothing converts itself.** `0` is not `false`, `""` is not `false`, and
`"count: " + 5` is an error rather than a string. Write `"count: " + text(5)`.
Every silent conversion rule in every language is a source of bugs that survive
review, and a trading script that quietly treats a zero as a false has a bug
nobody finds until it costs money.

## The errors you will meet on day one

Every diagnostic carries a stable code, a line, a column, a caret under the
offending text, a message and a fix. The editor shows it like this:

```
14 |     len = 9
   |     ^^^
OS2002: len is already declared at line 1, so a second one cannot be declared here.
Fix: rename this one, or drop the inner declaration and let the assignment update the len at line 1.
```

The code's first digit tells you what kind of thing went wrong, never how
serious it is:

| Range | Kind | Example |
|---|---|---|
| OS1xxx | Syntax | OS1002, a tab in the indentation |
| OS2xxx | Names and types | OS2001, a name used before it is assigned |
| OS3xxx | Arguments | OS3002, a named argument that does not exist |
| OS4xxx | Runtime | OS4004, an array index out of range |
| OS5xxx | Limits | OS5001, the per-bar loop budget |
| OS6xxx | Data | OS6001, an unknown timeframe |
| OS7xxx | Orders | OS7002, an order argument that was absent |
| OS8xxx | Warnings | OS8001, a stateful call inside a branch |
| OS9xxx | Import | OS9003, a built-in the importer has no mapping for |

The five you are most likely to see in your first hour:

| Code | What you did | The fix |
|---|---|---|
| OS8003 | No `version` line | Add `version 1` as the first line |
| OS1002 | Indented with a tab | Indent with spaces. Tabs are rejected rather than expanded, because a tab's width is an editor setting, and a file whose meaning depends on one changes meaning when somebody else opens it |
| OS1003 | One line of a block indented differently from its siblings | Match the other lines exactly, even if the difference is one space |
| OS2001 | Used a name above the line that assigns it | Move the assignment up. The file is the body of a per-bar loop and the loop runs in source order |
| OS3006 | Put a `plot` inside an `if` | Move it to the top level and pass `none` on the bars you want hidden |

Warnings never stop anything. They are reported on the line and in the gutter,
and the script runs. Every one of them exists because the shape it describes is
almost always a mistake, so read them rather than clicking past them.

## Where to go next

Build something real, one addition at a time, in
[first-study.md](./first-study.md). If you would rather see the editor first,
[editor-tour.md](./editor-tour.md) covers autocomplete, inline errors and
revisions.

## See also

- [first-study.md](./first-study.md) for building a complete indicator step by step
- [first-strategy.md](./first-strategy.md) for turning that indicator into something that trades
- [editor-tour.md](./editor-tour.md) for the editor panel, revisions and the pinning rule
- [installing.md](./installing.md) for where script files live, and how to share and remove one
- [../spec/language.md](../spec/language.md) for the language rules in full
- [../spec/stdlib.md](../spec/stdlib.md) for every callable function and its exact warmup
- [../examples/README.md](../examples/README.md) for twelve complete scripts and what each one proves
