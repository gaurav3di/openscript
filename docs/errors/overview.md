# Errors and warnings

By the end of this page you will be able to read any diagnostic OpenScript gives
you, know from the code alone what kind of thing went wrong and when it was
found, look the code up in one place, and tell the difference between something
that stopped your script and something that merely told you about itself.

## Every diagnostic carries a code

Nothing in OpenScript reports a bare string. Every diagnostic the compiler or an
engine produces carries five things:

| Part | Example | Why it is there |
|---|---|---|
| The code | `OS2002` | Stable, searchable, quotable in a bug report |
| The position | line 14, column 5, span 3 | So the editor can put a caret under the exact text |
| The message | "len is already declared at line 1 ..." | What happened, with the real values filled in |
| The fix | "rename this one, or drop the inner declaration ..." | What to do about it |
| The severity | error or warning | Whether anything stopped |

Rendered, that is what you see:

```
14 |     len = 9
   |     ^^^
OS2002: len is already declared at line 1, so a second one cannot be declared here.
Fix: rename this one, or drop the inner declaration and let the assignment update the len at line 1.
```

The fix is not decoration and it is not optional. A diagnostic that cannot name
a concrete action on the source in front of you is treated as a defect in the
diagnostic, and the design changes rather than the entry shipping with advice
like "check your script". Three shapes are banned outright: a fix that restates
the message, a fix that says the behaviour is undefined, and a fix that names
only a section of a document to go and read.

## Why the code is stable

A code is assigned once and never moves. It is never reused for a different
meaning and never renumbered to tidy a range, because a code ends up in logs, in
saved backtest reports, in support threads and in links, and every one of those
would start lying the day a number was reassigned. Each catalogue entry also
records the language version it first appeared in, so an editor pinned to
version 1 knows which diagnostics it can ever show.

The practical consequence for you: searching for `OS4002` is a reliable way to
find out what happened, today and in five years.

## The eight ranges

The first digit after `OS` is the thousand block, and the block says what kind of
thing went wrong. It deliberately does not say how serious it is: severity is a
separate field, so that a bare code in a log tells you which part of the system
produced it.

| Range | Kind | Covers | Severity | Entries |
|---|---|---|---|---|
| OS1xxx | Syntax | The source text is not a program: characters, layout and grammar | error | 22 |
| OS2xxx | Names and types | The program parses, and a name or a type does not work out | error | 19 |
| OS3xxx | Arguments | A call or an option is wrong at the call site | error | 16 |
| OS4xxx | Runtime | A bar produced a value the engine cannot act on | error | 12 |
| OS5xxx | Limits | A budget was exhausted: loops, memory, size or time | error | 8 |
| OS6xxx | Data | Bars, instruments, timeframes and the host's answers to requests | error | 12 |
| OS7xxx | Orders | An order could not be placed as written | error | 13 |
| OS8xxx | Warnings | The script compiles and runs, and something in it is probably not meant | warning | 14 |

One hundred and sixteen entries in language version 1. Ranges OS1xxx to OS7xxx
are errors; OS8xxx is the warnings.

What each range tells you about your own next move:

- **OS1xxx.** You have typed something the grammar does not have: a tab in the
  indentation, a semicolon, a chained comparison, a bracket that is never closed.
  Nothing has run. These are the cheapest to fix and the fix is always local.
- **OS2xxx.** The file parses and the meaning does not work out: a name read
  before it is assigned, a name declared twice in nested scopes, a number
  compared with a string, `[]` on a value with no history. Still nothing has run.
- **OS3xxx.** A call is wrong where it is written: too many arguments, an unknown
  named argument, a `plot` inside an `if`, an option that is not a constant.
- **OS4xxx.** A bar ran and produced something the engine cannot act on: an array
  index past the end, a history index that is not a whole number, a setter on a
  drawing object that was deleted. This is the first range where the error
  depends on the data.
- **OS5xxx.** A budget ran out: the per-bar loop iterations, the size of an
  array, the size of the compiled program, the time one bar was allowed.
- **OS6xxx.** The data is not what the script asked for: an unknown timeframe, a
  request finer than the chart, an instrument the host does not know, bars out of
  order, a timezone that does not exist.
- **OS7xxx.** An order could not be placed as written: an absent price, a
  quantity of zero, a size that is not a whole lot, a bracket on the wrong side
  of the entry, no destination connected.
- **OS8xxx.** Warnings. Read them.

Numbers inside a range are assigned in the order the codes were added, not
grouped by topic. OS3007 sits next to OS3006 because it was written next, not
because they are related. Grouping by topic would mean renumbering whenever a
range filled up, and renumbering is the one thing a stable code cannot do.

## The stage, which tells you when it was found

Every entry also records the stage that raises it, and the stage is what decides
whether you found the problem before the chart drew anything or after it drew
four thousand bars.

| Stage | What is happening | You find out |
|---|---|---|
| `lex` | Reading characters into tokens | As you type |
| `parse` | Reading tokens into a tree | As you type |
| `check` | Names, types, scope and call sites, before any bar runs | When you apply the script |
| `runtime` | Executing a bar | On the bar that did it, which may be far into history |
| `host` | The host answering the engine: data, limits and order destinations | When the answer arrives |

Most of the language is arranged to push problems leftward in that table. A
literal negative length is caught at `check` as OS3004 rather than at `runtime`
as OS4003. A study that places an order is caught at `check` as OS7001, so a
study can never place an order at all, on any bar, ever. That is why the checking
rules are stricter than they need to be for the compiler's own sake: an error
found before bar 0 costs you a second, and the same error found on bar 30,000 of
a live session costs you something else.

## Errors against warnings

| | Error | Warning |
|---|---|---|
| Code range | OS1xxx to OS7xxx | OS8xxx |
| Stops compilation | yes, for `lex`, `parse` and `check` stages | never |
| Stops the bar | yes, for `runtime` and `host` stages | never |
| What is drawn | nothing from the bar that raised it | everything, as normal |
| Where it appears | on the line, with a caret, and on the chart for a runtime error | on the line and in the editor's gutter |
| Can you ignore it | no | yes, and it is usually a mistake to |

A runtime error stops the bar and marks the study as errored, with the message on
the chart. It does not silently skip the bar, because a gap with no explanation
is indistinguishable from a gap the script meant, and a chart that quietly drops
the bars it could not compute is a chart that lies by omission.

A warning stops nothing. The script compiles, runs and draws. What a warning says
is that the code has a shape whose behaviour is defined, specified and almost
never what the author wanted. Three of the fourteen are worth knowing by heart:

**OS8001, a stateful call inside a branch.** A call site that does not execute on
a bar leaves its series absent for that bar and its state untouched.

```
// Warned: ema advances only on trending bars, and is absent on the rest.
if trending
    e = ema(close, 20)

// The fix the warning names: compute unconditionally, use conditionally.
// The plot itself stays at the top level, because a plot inside a branch is
// OS3006: a plot declares a column and a column cannot exist on some bars only.
e = ema(close, 20)
plot(trending ? e : none, "EMA", aqua)
```

**OS8004, a branch on an absent condition changes a value used later.** An absent
condition takes the false branch, so during warmup the block does not run and the
name keeps whatever it held before. Warmup bars sit off the left edge of the
screen, which is exactly why this shape changes an answer and nobody notices.

**OS8011, `live var` makes live and backtest differ.** An ordinary `var` rolls
back before each re-execution of the newest bar, which is what makes a live chart
and a backtest of the same data agree. `live var` opts out of that by design, and
the warning is the record that somebody chose it.

## Where a code is looked up

There is one catalogue, and everything else is a view of it.

| Where | What it is |
|---|---|
| `spec/errors.json` | The catalogue itself, machine readable, one hundred and sixteen entries |
| `spec/errors.md` | The human face of the same file. Its per-code sections are rendered from the JSON by the documentation build |
| The editor | Reads the message and the fix and puts them on the exact character, and applies the fix directly where the entry says it can |
| The compiler and the engines | Emit a code and the values, never a whole string |

The documentation pages for individual codes are **generated from
`spec/errors.json`**. Nobody writes them by hand and nobody edits them by hand,
which is the only arrangement under which a message in the product and a message
in the documentation cannot drift apart.

## The shape of errors.json

The file is one object. Everything above `entries` is the small amount of context
a consumer needs in order to read the entries at all.

| Field | Type | Holds |
|---|---|---|
| `catalogue` | string | Always `openscript-errors`, so the file can be identified by content |
| `schemaVersion` | number | The shape of this file. A new field is not a bump; a changed or removed field is |
| `languageVersion` | number | The language version this catalogue describes |
| `placeholderSyntax` | string | Always `{name}`, stated rather than inferred from examples |
| `severities` | object | Each severity and what it does to the run |
| `stages` | object | Each stage and where in the pipeline it sits |
| `ranges` | array | One per thousand block: prefix, kind, what it covers, its severity |
| `entries` | array | The catalogue, ascending by code |

An entry:

| Field | Holds |
|---|---|
| `code` | `OSNxxx`. Stable for ever |
| `title` | Two to six words, sentence case, no full stop |
| `message` | The template the reader sees, with `{name}` placeholders |
| `placeholders` | Every placeholder in `message` and `fix`, mapped to what the compiler puts there |
| `cause` | What the compiler or the engine saw, and why the rule exists |
| `fix` | What to do, in the imperative |
| `severity` | `error` or `warning` |
| `stage` | `lex`, `parse`, `check`, `runtime` or `host` |
| `since` | The language version the code first appeared in |
| `autofix` | Whether an editor can apply the fix without asking a question |
| `example` | `before`, the shortest script that raises it, and `after`, the same script fixed |
| `spec` | The sections of `language.md` that define the rule |
| `refines` | The broader code this one takes a case from, if any |
| `test` | The directory holding the test that produces this code |

A complete entry, as it appears in the file:

```json
{
  "code": "OS1006",
  "title": "Assignment used as a condition",
  "severity": "error",
  "stage": "parse",
  "since": 1,
  "message": "= assigns a value, and a condition needs a comparison.",
  "placeholders": {},
  "cause": "Assignment is a statement and never an expression, so the classic typo cannot compile into a condition that is always true.",
  "fix": "Write == to compare, or move the assignment to its own line above the if.",
  "autofix": true,
  "example": {
    "before": "if len = 14\n    signal(\"DEFAULT\")",
    "after": "if len == 14\n    signal(\"DEFAULT\")"
  },
  "spec": "language.md 10.1",
  "refines": null,
  "test": "tests/errors/OS1006"
}
```

Two choices in that shape are worth pointing out, because both could have gone
the other way.

**The message is a template and the values are not in the catalogue.** The
compiler supplies the line, the column and the values; the catalogue supplies the
words. Letting the compiler build whole strings is precisely what allows a
message in the product to drift from the message in the documentation.

**The example is two scripts, not one.** A before with no after tells you what is
wrong and leaves you to guess the shape of right. The after is the same script
with the smallest change that compiles.

## The promise: every error is documented, and the build enforces it

Documentation drifts from code because nothing fails when it does. Two rules run
in continuous integration, and both fail the build rather than print a note.

**Rule one. Every code the compiler can emit exists in the catalogue.** The
compiler and every engine emit codes from one generated table, and nothing
constructs a code string by hand. The build extracts the set of codes from that
table, reads the set from `errors.json`, and compares them in both directions. A
code with no entry fails the build, naming the source position that emits it. An
entry that no code path can emit also fails the build, because an entry for a
diagnostic that no longer exists is worse than no entry: it sends you hunting for
a cause that cannot occur. A genuinely retired code stays in the file with an
explicit retirement and is never reused.

The check covers the message templates too. The placeholders the emitting call
site supplies must be exactly the placeholders the entry declares, so a message
with an empty slot is a build failure rather than something you discover at
three in the afternoon.

**Rule two. Every entry has a test that produces it.** Each entry names a test
directory. The test holds `example.before` and the expected diagnostic, and the
runner asserts four things:

1. Compiling or running `example.before` produces this code, at the expected line
   and column.
2. The diagnostic supplies exactly the placeholders the entry declares.
3. Compiling or running `example.after` produces no diagnostic at all, which is
   what makes the fix a fix rather than a suggestion.
4. For a warning, the script still runs to completion and produces output.

Two smaller checks run in the same job: the schema check, which asserts every
field is present, every placeholder is declared and used, and every fix is
non-empty; and the independence check, which asserts that no product, platform or
company is named anywhere in either file.

Together the two rules close the loop. The compiler cannot emit an undocumented
code, the catalogue cannot document a code that does not exist, and no entry can
describe behaviour the implementation does not have.

## Codes that refine another code

The language specification sometimes quotes a family code for a case the
catalogue gives its own code, so that the fix can be specific rather than
general. The family code remains correct for every case not listed, and the
catalogue is the authority on which code is actually emitted.

| Code | Refines | The case it takes over |
|---|---|---|
| OS1005 | OS1004 | Unknown escape sequence |
| OS2011 | OS2003 | A condition must be a bool |
| OS2012 | OS2003 | The two arms of the ternary have different types |
| OS2013 | OS2003 | An array literal mixes types |

Where the specification and the catalogue disagree about a code, **the catalogue
wins** and the specification is wrong. That rule exists so there is never a
question about which document to trust when you are staring at a number.

## Reading three real diagnostics

**A check error you will meet on your first day.**

```
// Before: OS2002, the name already exists in an enclosing scope.
len = 20
fn helper(src) =>
    len = 9
    sma(src, len)

// After: rename, which is what the fix says.
len = 20
fn helper(src) =>
    inner = 9
    sma(src, inner)
```

Shadowing is an error rather than a convenience because the most expensive class
of bug in per-bar scripts is a value that is right in one place and stale in
another, and two variables with one name is the shortest path to it.

**A runtime error that only appears on some data.**

```
// Before: OS7002, an order argument is absent, on the first bars of the run.
stop = lowest(low, 20)
if crossUp(fast, slow)
    buy(qty = 1)
    exit(stop = stop)

// After: do not send an order built from a value that does not exist yet.
stop = lowest(low, 20)
if crossUp(fast, slow) and not isNone(stop)
    buy(qty = 1)
    exit(stop = stop)
```

An order is the one place in the language where doing nothing quietly is worse
than stopping loudly, so an absent price is refused rather than defaulted.

**A warning that is not an error and should still be fixed.**

```
// Warned with OS8014: a persistent value holds a bar index.
var startIndex = none
if session.isFirstBar
    startIndex = bar.index

// Fixed: store the time, which does not move when more history loads.
var startTime = none
if session.isFirstBar
    startTime = time
```

## If you meet a code this page does not cover

Look it up in `spec/errors.md`, which carries the cause, the fix and a
before-and-after example for all one hundred and sixteen. The range tells you
which part of the system produced it, the stage tells you when, and the entry
tells you the rest. A code that is genuinely missing from the catalogue is a
build failure that escaped, and it is worth reporting as one.

## See also

- [../troubleshooting.md](../troubleshooting.md) for problems by symptom rather than by code
- [../writing/debugging.md](../writing/debugging.md) for finding the bar a runtime error came from
- [../writing/limits.md](../writing/limits.md) for the OS5xxx budgets
- [../alerts.md](../alerts.md) for the diagnostics an alert can raise
- [../faq.md](../faq.md) for the short answers
- [../glossary.md](../glossary.md) for diagnostic, stage, severity and catalogue
- [../../spec/errors.md](../../spec/errors.md) for the full catalogue
- [../../spec/language.md](../../spec/language.md) for the rules the codes enforce
