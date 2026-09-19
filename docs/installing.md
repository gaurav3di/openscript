# Installing, sharing and removing scripts

By the end of this page you will know where your scripts live on disk, why a file
you drop into that folder works immediately with no build and no restart, how to
send one to somebody else so that it does the same thing on their machine, and
how to take one away cleanly.

## Contents

1. [There is nothing to install](#there-is-nothing-to-install)
2. [Where the files live](#where-the-files-live)
3. [Naming a file, and naming a script](#naming-a-file-and-naming-a-script)
4. [How a file is picked up](#how-a-file-is-picked-up)
5. [Editing a script outside the editor](#editing-a-script-outside-the-editor)
6. [Putting the folder under version control](#putting-the-folder-under-version-control)
7. [Sharing a script](#sharing-a-script)
8. [Receiving a script: read it first](#receiving-a-script-read-it-first)
9. [Writing a script that travels](#writing-a-script-that-travels)
10. [Removing a script](#removing-a-script)
11. [Troubleshooting](#troubleshooting)

---

## There is nothing to install

A script is one plain text file. It has no dependencies, there is no package to
fetch, no manifest to register it in, no plugin to load and nothing to compile
ahead of time. "Installing" a script means putting a file in a folder, and
"uninstalling" one means deleting it.

That is not a simplification for the sake of a quick start. It is a consequence
of the two decisions the whole project rests on: the compiler runs where you are,
and it emits **data** rather than code. There is no generated artifact anywhere
for an install step to produce, and nothing that could need rebuilding when the
set of scripts changes.

## Where the files live

Scripts live in one folder, one file per script, with the extension `.oscript`.
The folder's exact path is set by the host and shown in the editor; it sits with
your own configuration rather than inside the application, so an application
update never touches it, and it is excluded from the application's own version
control so your scripts are never overwritten by one.

A folder in ordinary use looks like this:

```
openscript/
    deviation-bands.oscript
    deviation-bands-long.oscript
    rsi.oscript
    intraday/
        opening-range.oscript
        session-vwap.oscript
    archive/
        old-ema-cross.oscript
```

Facts about that folder, all of them worth knowing before you organise it:

| Fact | Consequence |
|---|---|
| One file is one script | There is no multi-script file and no include, so a file is always the whole thing |
| The extension is `.oscript` | A file with another extension is ignored, which is how you park a draft |
| Subfolders are allowed | Use them for your own sake. They do not affect how a script behaves |
| Nothing else belongs there | No generated files, no cache, no lock file. What you see is everything there is |
| The folder is yours | Copy it, back it up, sync it, keep it in version control |

Two things that are **not** in the folder, and it matters where they are instead:
the input values you changed in a study's settings dialog belong to the chart's
saved layout, not to the script, and the revision history belongs to the editor's
store. A file is the source and only the source.

## Naming a file, and naming a script

A script has two names and they do different jobs.

**The file name** is what you share, diff and search for. Keep it lowercase, use
hyphens rather than spaces, and describe the script rather than its version:
`opening-range.oscript`, not `Opening Range v3 FINAL.oscript`. The history is the
editor's job, and a name that records a version number stops being true at the
next save.

**The title in the declaration** is what everyone sees:

```
version 1

study("Opening range", overlay = true, precision = 2, group = "Intraday")
```

The title is the legend row and the entry in the picker. The optional `group`
option is the category the picker files it under, and it is the fastest way to
make a folder of thirty scripts navigable. Neither name has to match the other,
although a reader will thank you if they are close.

## How a file is picked up

Save a file into the folder and it is available. No rebuild, no restart, no
reload of anything, and no step in between. Four reasons, and each one is a
design decision rather than a convenience:

**There is no build step to run.** The compiler turns source text into a compiled
program at the moment you press Apply, in milliseconds. Nothing is compiled ahead
of time, so nothing is stale.

**Nothing is generated at install time.** A script does not produce a module, a
bundle or a registration entry that would have to be rebuilt when the set of
scripts changes. The folder is the list.

**The compiled program is data, not code.** Loading a new script never means
loading new code, which is why this works under a strict security policy with
nothing for anyone to approve, and why it cannot require a restart: a process
that loads data does not have to be restarted to load different data.

**The picker reads the folder.** Adding, renaming and deleting are all just file
operations, and the list follows the folder rather than a registry that could
disagree with it.

The one thing that is not instant is a script already on a chart. That is
deliberate and is the pinning rule: a chart keeps the revision it was added with
until you accept its prompt to update. See
[editor-tour.md](./editor-tour.md#the-pinning-rule).

## Editing a script outside the editor

Nothing stops you. The file is text, and the editor is a view onto it rather than
a gate in front of it. Use your own editor, a terminal, a script that generates
scripts, whatever you like.

The rules the file has to obey, all of them checked when it is compiled:

| Rule | Detail | Error if broken |
|---|---|---|
| UTF-8 | A byte order mark at the start is accepted and ignored | |
| LF or CRLF line endings | CRLF is normalised before anything else, so a file written on one operating system compiles identically on another | |
| ASCII outside string literals | A typographic quote or a non-breaking space pasted in from a web page or a word processor is rejected where it sits | OS1001 |
| Spaces, never tabs, in indentation | Four spaces is the convention | OS1002 |
| Consistent indentation within a block | Every line of one block carries exactly the same leading whitespace | OS1003 |

The ASCII rule surprises people, so here is the reason: identifiers are ASCII so
that two names which look identical on screen can never be different names, and
so that a file is byte-stable across editors, locales and normalisation forms.
String literals carry the full Unicode range, which is where text for humans
belongs. The rejection happens at the offending character with a named
replacement, because an invisible non-breaking space otherwise produces a
baffling parse error three tokens later.

If a script arrives from a word processor, paste it into a plain text editor
first. The compiler will tell you exactly which character to replace, but there
may be forty of them.

## Putting the folder under version control

The folder is plain text files, so it behaves the way you expect. This is the
part of the project that most repays five minutes of setup:

- A diff of a script is a readable diff, because the language has one layout
  rule and a formatter that does not reflow anything else.
- A history of your scripts survives moving machines, reinstalling, and anything
  that happens to the editor's own store.
- A strategy that traded real money can be tied to a commit, which is a stronger
  record than a revision number that only exists in one place.

The editor's revision history and version control do different jobs and do not
conflict. Revisions are automatic, fine grained and local to the editor, and they
are what pinning refers to. Commits are deliberate, coarse and portable. Keep
both.

## Sharing a script

Send the file. That is the whole mechanism: a file in a chat message, an
attachment, a repository, a gist, a USB stick. The recipient drops it in their
folder and it appears in their picker.

What travels in the file:

| Travels | Does not travel |
|---|---|
| The language version line | The values you set in the settings dialog |
| The declaration and all its options | The chart it was on, and that chart's layout |
| Every input and its **default** value | The revision history |
| The whole calculation and everything drawn | Backtest runs and their reports |
| Your comments | Any instrument fact the host supplied |

The version line is what makes the file mean the same thing on the other machine.
A file that declares `version 1` is parsed by the version 1 front end, today and
under every later release, and the compatibility promise is that it produces the
same numbers. A file with no version line is compiled as whatever is newest on
the machine that opens it, which may not be the version it was written under.
Write the line. It costs one line and it is the only thing standing between your
script and somebody else's compiler being newer than yours.

A shared script deserves a header. The convention, which the example scripts all
follow, is what it does and which features it leans on, then the reasons inline:

```
// Deviation bands: a moving average with a standard deviation band around it,
// and a marker where price closes back inside the band.
//
// Inputs: basis length, band width in deviations, and the source series.
// Nothing here is instrument specific; it works on any interval.

version 1

study("Deviation bands", overlay = true, precision = 2)
```

Comments inside the body should say **why** a line is written the way it is, not
what it does. A reader who wants to know what `ema` is has the library reference;
a reader who wants to know why the average is computed at the top level instead
of inside the branch that uses it has nothing else.

## Receiving a script: read it first

A script you did not write can place orders. Read it before you run it. The
whole file, not the first ten lines, and specifically these seven things:

| Look for | Because |
|---|---|
| `study(` or `strategy(` on the declaration | A strategy can place orders. A study cannot, ever |
| `buy`, `sell`, `close(`, `exit`, `order.` | What it would actually do, and in which direction |
| `capital`, `qty`, `qtyType`, `pyramiding` | The size it will trade, which is somebody else's account size, not yours |
| `slippage`, `commission` | Both at zero means its backtest numbers are fiction |
| `onUnconfirmed = true` | It acts on bars that are still moving, and the guarding is then the script's own |
| `mode = "lookahead"` on a `req.` read | It reads a coarse bar's finished value before it finished. It repaints on history by design and cannot be traded as it backtests |
| A symbol written as a literal | It is pinned to one instrument, and probably not yours |

None of those are reasons to refuse a script. They are the things you have to
know about a script before its results mean anything.

The safest first run of any strategy you did not write is a backtest, then paper.
Paper is the default and arming live is a separate deliberate act, which means
you cannot reach live by accidentally dropping a file in a folder. See
[first-strategy.md](./first-strategy.md#paper-is-the-default-live-is-a-separate-act).

## Writing a script that travels

If you expect anyone else to run it, three habits do most of the work.

**Do not hard-code an instrument.** This works only where it was written:

```
bias = req.symbol("SYMBOL", "1D", ema(close, 20) > ema(close, 50))
```

This works anywhere, and puts the choice in the settings dialog:

```
biasSymbol = input("SYMBOL", "Bias instrument")

bias = req.symbol(biasSymbol, "1D", ema(close, 20) > ema(close, 50))
```

**Do not assume an instrument fact exists.** `chart.lotSize`, `chart.tickSize`
and `chart.pointValue` are **absent** when the host has not stated them, rather
than being guessed at a plausible value, so that a script can tell a real lot
size from nobody having said. Test before you rely on one:

```
lot   = orElse(chart.lotSize, 1)
units = floor(rawQty / lot) * lot
```

**Do not assume a session, a timezone or a calendar.** Measure from the session
itself rather than from a wall clock, and the script says the same thing wherever
it is run:

```
var openTime = none

if session.isFirstBar
    openTime = time

// Milliseconds since the session opened. No calendar, no timezone, no
// assumption about when an exchange happens to trade.
elapsed = isNone(openTime) ? none : time - openTime
forming = not isNone(elapsed) and elapsed < 15 * 60000
```

## Removing a script

Delete the file. There is nothing else to clean up: no registration to undo, no
cache to clear, no generated artifact to remove.

What happens to everything that referred to it:

| Thing | After the file is deleted |
|---|---|
| The picker | The script is gone from the list |
| A chart already showing the study | Keeps drawing it, because the chart holds the compiled program from the revision it pinned. It is gone at the next reload |
| A backtest report | Unaffected. A run records the source that produced it, so an old result stays readable |
| A running strategy | Stop it first. A script that a live process is running is not a file to delete out from under it |
| Your version control history | Unaffected, which is the reason to have it |

Two distinctions that catch people out.

**Removing a study from a chart is not deleting the script.** Taking a study off
a chart is a chart action; the file is untouched and the script is still in the
picker.

**Renaming a file is not renaming a script.** The title in `study(...)` is what
the legend and the picker show, and it does not change when the file does. Rename
both, or accept that they disagree.

If you might want it back, move it rather than deleting it. A subfolder called
`archive`, or an extension that is not `.oscript`, both make a script invisible to
the picker while leaving the text exactly where you can find it.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| The file is not in the picker | The extension is not `.oscript` | Rename it |
| The file is not in the picker | It is not in the script folder, or it is in a folder outside it | The editor shows the folder path |
| It compiles here and not on a colleague's machine | No `version` line, and the two compilers are different versions | Add `version 1` as the first line |
| Every line reports OS1001 | The file came through a word processor or a web page | Repaste through a plain text editor |
| OS1002 on every indented line | The file was written with tabs | Convert the leading tabs to spaces, four per level |
| The study draws nothing | It compiled and every plotted value is absent | Check the warmup of the longest call in it, and check the date range has enough bars |
| The chart did not change after a save | The chart pinned an older revision | Accept the prompt, or add the study again |
| A save is refused | A live process is running that script | Stop it, save, start it again |

## See also

- [getting-started.md](./getting-started.md) for what a script is and what Apply does
- [first-study.md](./first-study.md) for building one from an empty file
- [first-strategy.md](./first-strategy.md) for orders, paper mode and arming live
- [editor-tour.md](./editor-tour.md) for revisions, comparing them and the pinning rule
- [../examples/README.md](../examples/README.md) for twelve scripts to drop into the folder and read
- [../spec/language.md](../spec/language.md) for the source text rules in full
