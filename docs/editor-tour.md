# A tour of the editor

By the end of this page you will know how to write a script with autocomplete and
inline errors helping you, put it on a chart, save it as a revision, compare two
revisions, restore an older one, and why the chart you are looking at does not
change when you edit the file behind it.

## Contents

1. [What is in the panel](#what-is-in-the-panel)
2. [Typing: highlighting and layout](#typing-highlighting-and-layout)
3. [Autocomplete](#autocomplete)
4. [Inline errors, and the code on each one](#inline-errors-and-the-code-on-each-one)
5. [Warnings are not errors, and are worth reading](#warnings-are-not-errors-and-are-worth-reading)
6. [Apply: putting the script on the chart](#apply-putting-the-script-on-the-chart)
7. [Save: every save is a revision](#save-every-save-is-a-revision)
8. [Comparing two revisions](#comparing-two-revisions)
9. [Restoring one](#restoring-one)
10. [The pinning rule](#the-pinning-rule)
11. [A full pass, start to finish](#a-full-pass-start-to-finish)

---

## What is in the panel

The editor is a panel beside the chart, not a separate application and not a
separate page. It has five parts:

| Part | Holds |
|---|---|
| The script list | Every script you own, which is every `.oscript` file in your folder |
| The editing surface | The source text, with highlighting and a gutter |
| The diagnostics list | Every error and warning in the current text, each with its code |
| The controls | Apply, save, and the revision history |
| The log | Whatever `print(...)` wrote, with each line's bar time |

The editor is a view onto files on disk. Creating a script writes a file, saving
writes to it, and a file somebody else puts in the folder appears in the list.
Nothing is hidden in a database that you cannot get at with your own tools. See
[installing.md](./installing.md) for the folder itself.

## Typing: highlighting and layout

Highlighting distinguishes six things: keywords, built-in names, string and
number literals, colours, comments, and everything else. Colours are shown in
their own colour, which is more useful than it sounds the first time you write
`fade(aqua, 92)` and cannot picture it.

The layout rules are short, and the editor helps with all of them.

**Indentation is spaces, and four of them is the convention.** A tab in leading
whitespace is error OS1002. Tabs are rejected rather than expanded because a
tab's width is an editor setting, so a file whose meaning depended on one would
change meaning when somebody else opened it. The editor inserts spaces when you
press the tab key.

**Every line of one block carries exactly the same indentation.** One line out by
a single space is OS1003, and the message names both the indentation it found and
the indentation the block opened at.

**One statement per line, and no separators.** There is no semicolon; writing one
is OS1007 with the fix "put the second statement on its own line". There are no
braces and no `end` keyword. A block is the run of lines indented more deeply
than its header, and it ends at the first line that is not.

The formatter, where the editor offers one, produces four space indentation and
does not reflow anything else. One layout rule means every script in the world
looks the same and a diff shows a logic change rather than a formatting argument.

## Autocomplete

Autocomplete is generated from the standard library manifest: the same file the
compiler checks calls against and the reference is generated from. It cannot
offer you a function that does not exist, and it cannot be out of date with
respect to the compiler, because there is one source and all three read it.

Type a few letters of a name and you get the matches. Each one shows four things:

```
ema(src, len)                  series number
Warmup: bar len - 1
Exponential mean, weight 2 / (len + 1), seeded on bar len - 1
with the simple average of those len values.
```

The signature, the return type, the exact warmup, and one line on what it is for.
The warmup is there because it is the thing you will otherwise get wrong: it is
not a hint, it is the promise that the call returns `none` on exactly those bars
and no others.

Four places autocomplete does more than complete a word:

**Namespaces.** Type `pos.` and you get the position facts and nothing else. The
namespaces are the ones `language.md` section 15.2 lists, and they exist precisely
so that the bare global scope stays small enough to memorise and autocomplete over
the whole library stays useful.
Everyday functions are bare: it is `ema(close, 9)` and `aqua`, never a prefix and
a dot.

**Named arguments.** Inside a call, it offers the argument names with their
defaults, so you can see that `plot` has a `style` before you go looking for one:

```
plot(basis, "Basis", orange, width = 2, style = "step")
```

**Option values.** Where an argument accepts a fixed set of strings, those are
the completions. `style` offers `"line"`, `"lineWithMarkers"`, `"step"`,
`"area"`, `"histogram"` and `"column"`, and nothing else. Writing a value outside
the set is error OS3008, which names the ones that exist.

**Your own names.** Everything you have assigned above the cursor, plus your
`fn` declarations and their parameters. Names below the cursor are not offered,
because reading a name before the line that assigns it is error OS2001: the file
is the body of a per-bar loop and the loop runs in source order.

Functions are the one exception to that ordering, and autocomplete reflects it: a
`fn` may be called before its declaration appears, because a function declaration
is not a per-bar statement.

## Inline errors, and the code on each one

Diagnostics appear as you type, not when you press Apply. They are underlined in
the text, listed in the diagnostics panel and marked in the gutter, and each one
carries a stable code.

The full rendering:

```
14 |     len = 9
   |     ^^^
OS2002: len is already declared at line 1, so a second one cannot be declared here.
Fix: rename this one, or drop the inner declaration and let the assignment update the len at line 1.
```

Four parts, and the fourth is the one that matters. **Every diagnostic states a
fix**, and the fix names an action on the source in front of you: a replacement,
a line to move, a call to wrap, a guard to add. A diagnostic that cannot say
something concrete is treated as a defect in the diagnostic, not as a fact of
life. Three shapes are banned outright from the catalogue: a fix that restates
the message, a fix that says the behaviour is undefined, and a fix that names
only a document to go and read.

Fourteen of the codes carry a mechanical fix the editor can apply for you,
including a tab in the indentation (OS1002), a mismatched indent (OS1003), a
semicolon (OS1007), a missing comma between arguments (OS1014) and a missing
version line (OS8003). The rest need a decision, so they tell you what the
decision is rather than guessing.

Where each kind comes from, which is worth knowing because it tells you when it
can appear:

| Stage | Reading | Codes |
|---|---|---|
| Characters into tokens | The text | OS1001 to OS1005 |
| Tokens into a tree | The structure | OS1006 to OS1022 |
| Checking | Names, types, scope, every call site, before any bar runs | OS2xxx, OS3xxx and all the warnings |
| Running a bar | The data | OS4xxx, OS5xxx |
| The host answering | Bars, instruments, order destinations | OS6xxx, OS7xxx |

Everything in the first three rows appears while you type. The last two cannot:
they need bars, so they appear after Apply, on the chart, as the study reporting
itself as errored with the message attached.

The eight you will see most while writing:

| Code | Says |
|---|---|
| OS1012 | This bracket is never closed |
| OS1014 | Missing comma between arguments |
| OS2001 | This name is not defined at this point in the file |
| OS2002 | That name already exists in an enclosing scope |
| OS2003 | These two types do not mix here |
| OS3002 | This function has no argument by that name (and here are the ones it has) |
| OS3006 | This call has to be at the top level |
| OS3007 | `input()` has to be at the top level |

OS3002 is the one that repays reading the message rather than guessing. It lists
every argument name the function has and names the closest one to what you wrote:

```
5 | plot(v, "V", colour = aqua)
  |              ^^^^^^
OS3002: plot has no argument called colour.
Fix: use one of value, title, color, width, style, offset, overlay, precision, format, scale; color is the closest to what was written.
```

## Warnings are not errors, and are worth reading

A warning never stops anything. The script compiles, applies and runs. It is
marked on its line and in the gutter, and the code is in the OS8xxx range so you
can tell from a bare code in a log which kind it was.

Every warning exists because the shape it describes is almost always a mistake:

| Code | Shape | Why it is almost certainly wrong |
|---|---|---|
| OS8001 | A stateful call inside a branch | It advances only on that branch's bars and is absent on the rest, which draws a broken line that looks like bad data |
| OS8003 | No version declaration | The file was compiled as whatever version is newest today, which may not be the one you wrote it under |
| OS8004 | A branch on a possibly absent condition changes a value used later | Warmup silently changes an answer, off the left edge of the screen |
| OS8010 | A name is assigned and never read | Either a leftover, or a line you meant to use |
| OS8015 | This loop never runs | Usually a descending `for` written without `step -1` |
| OS8016 | Unreachable code | |
| OS8017 | The condition is constant | |
| OS8018 | An input is declared and never read | A settings row that does nothing |

The two that cost real money are OS8001 and OS8004. Both are about absence
arriving somewhere it is not visible, and both are much cheaper to fix on the
line where the editor puts them than to find later on a chart.

**Not raised yet.** OS8004 is in the catalogue and nothing raises it: the
checker does not follow which names a branch on a possibly absent condition
assigns.

## Apply: putting the script on the chart

Apply compiles the current text and hands the result to the chart. On a script
of ordinary size, everything before the bars run takes milliseconds: the four
compile steps happen once, and it is the fifth step, running the program over
every bar, that takes the time.

What Apply does, in order:

1. Compiles. If there is any error, nothing else happens and the chart keeps
   showing whatever it was showing. The diagnostics list is your result.
2. Builds the study's fixed shape from the compiled program: the settings dialog
   from your `input()` calls, the legend row from the title, the pane from
   `overlay`, the columns from your `plot` calls, the levels, the bands and the
   table. This is why those calls are top level only: the shape has to exist
   before the first bar runs.
3. Runs the program over the loaded bars, oldest first.
4. Draws.

Re-applying replaces the study on the chart with the new one. The settings dialog
is rebuilt from the inputs the new source declares. A saved value is filed under
the name the input was assigned to, or under its title where it was assigned to
none, so renaming that is a new row at its default rather than a relabelled one,
and every other edit, including inserting a row above it, leaves the value where
it was. Two inputs sharing a title is error OS3017, for the same reason.

Apply does not save. A script you applied and did not save is on the chart and
not in your history, which is fine while you are experimenting and not fine at
the end of it.

## Save: every save is a revision

There is no "save as" and no separate "commit this version". **Every save writes
a revision**, and a revision holds:

| Field | Holds |
|---|---|
| Number | 1, 2, 3, and up. It never restarts and never skips |
| Timestamp | When it was written |
| Message | Optional, and worth the eight seconds |
| Source | The complete text, not a patch |
| Hash | Of that source, so a run can prove which text produced it |

Complete source rather than a patch, because a revision has one job, which is to
still be readable and runnable in two years without needing anything else to
reconstruct it.

The message is optional and is the difference between a history you can read and
a list of timestamps. "Stop from ATR instead of the previous swing low" takes
eight seconds to type and answers the question you will actually be asking in
three months, which is not what changed but why.

## Comparing two revisions

The history lists every revision with its number, time and message. Pick two and
you get a line by line comparison.

Revision 6:

```
if enterLong and pos.isFlat
    entryStop = lowest(low, 10)
    buy(qty = 1)
    exit(stop = entryStop)
```

Revision 7:

```
if enterLong and pos.isFlat and not isNone(atrValue)
    entryStop = close - stopMult * atrValue
    buy(qty = 1)
    exit(stop = entryStop)
```

The comparison is over plain text, because the script is plain text. That is one
of the quieter benefits of a language that lives in files: a diff of two
revisions of a script reads like a diff of anything else, and a reviewer who has
never seen the language can still see that a stop moved from a swing low to a
volatility multiple and that a guard was added.

Two habits make the history worth having:

- Save before a change you are not sure about, not after. A revision you can
  return to costs nothing to write and everything to not have.
- Save when a backtest result is one you might want again. The run records the
  revision, and a revision that was never saved is a result you cannot reproduce.

## Restoring one

Restore takes an old revision and makes it the current text.

**Restoring writes a new revision rather than deleting the ones after it.**
Restoring revision 6 when the latest is 9 gives you revision 10 whose content is
revision 6's. Nothing is destroyed, the numbering stays a straight line, and the
history tells the truth about what happened, including the fact that you went
back.

A restore does not by itself change anything that is running or anything on a
chart. That is the next section, and it is the most important rule in the
editor.

## The pinning rule

**A chart pins the script revision the study was added with. A backtest run
records the revision that produced it. A live process pins the revision it
started with.**

Editing a script does not silently change a study already on a chart, a result
already produced, or a strategy already holding a position. When a chart is
showing an older revision than the latest, it says so and offers the update:

```
Deviation bands, long only
revision 7, latest is 9. Update?
```

You decide. Nothing decides for you.

| Surface | Pins | Updates when |
|---|---|---|
| A study on a chart | The revision it was added with | You accept the prompt, or add it again |
| A backtest run | The revision that produced it, plus the compiled program's hash | Never. A run is a record |
| A running strategy | The revision it started with | You stop it and start it again |

Why this is worth the extra machinery: the alternative is that a script is a
live wire. You tidy a comment, and a chart in another tab redraws; you change a
length while testing an idea, and a strategy holding a position starts using it
between the entry and the exit. Neither of those is a thing anybody wants, and
both of them are what happens when a saved script is a single moving target
rather than a numbered series of fixed ones.

The same rule is what makes a backtest result mean something. A report that
records revision 7 and the hash of the program it compiled to is a result you can
reproduce next year. A report that records "the script" is a story about a file
that has since changed.

## A full pass, start to finish

Ten steps, which is the whole workflow:

1. New script. You get an empty file with a name.
2. Type the declaration. `study("Test", overlay = true)`.
3. Autocomplete offers `ema` as you type `em`, with its signature and its warmup.
4. You write `plot(ema(close, len), "EMA", aqua)` and get OS2001 on `len`,
   because you have not assigned it yet.
5. You add `len = input(20, "Length", min = 2, max = 500)` above the plot. The
   underline goes.
6. Apply. The line appears on the chart. Roughly a second, most of it the bars.
7. Save, with a message: "first version, EMA with a length input".
8. Edit: you add a second average and a fill, and get OS8018 until you use the
   new input.
9. Apply again, look at it, save again. That is revision 2.
10. You preferred the first one. Compare revision 1 and 2, restore revision 1,
    which becomes revision 3. The chart still shows whichever revision it pinned
    until you accept its prompt.

At no point in that list did anything get generated, built, installed or
restarted.

## See also

- [getting-started.md](./getting-started.md) for what Apply actually does, step by step
- [first-study.md](./first-study.md) for building a study one addition at a time
- [first-strategy.md](./first-strategy.md) for what pinning means once orders are involved
- [installing.md](./installing.md) for the folder the editor is a view onto
- [../spec/errors.md](../spec/errors.md) for every error code, its cause, its fix and an example
- [../spec/stdlib.md](../spec/stdlib.md) for the library that autocomplete is generated from
