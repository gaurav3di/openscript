# Publishing

By the end of this page you will be able to package a script so that somebody
who did not write it can use it correctly, and version it so that nobody's
chart, backtest or running strategy changes underneath them.

## What publishing is, here

A script is a plain text file in a folder. Publishing it means putting that file
somewhere other people can get it, with enough around it that they can use it
without asking you questions. There is no store to submit to, no approval, and
no platform that owns the result. That is the point of the language, and it puts
the whole responsibility for being usable on the file and its neighbours.

The thing being published is not only the code. It is a package:

| Part | Required | Holds |
|---|---|---|
| The script file, `.oscript` | Yes | The code, with a header comment |
| A README | Yes | What it does, what it needs, what it does not do, the inputs |
| A licence | Yes | What others may do with it. Without one, legally, nothing |
| A changelog | Yes, from the second version | What changed, and whether the numbers moved |
| Test bars and settings | Strongly recommended | The data and inputs your published numbers were produced from |
| A version number | Yes | On the file, in the header, and in the declaration's title |

## The header comment

The first thing in the file, before the `version` line, is prose. The
declaration is the second thing. This is the one place in a script where a
comment says **what** rather than why, because it is the only part most readers
will read before running it.

```
// Deviation bands, version 1.2.0
//
// A simple moving average with bands a chosen number of standard deviations
// above and below it, and a marker on the bar a chosen source closes outside
// them.
//
// Needs: nothing beyond the chart's own bars. No volume, no other instrument,
// no session information.
// Warmup: the bands are absent until bar length - 1. At the default length of
// 20 that is the first 19 bars of the chart.
// Repaints: no. There is no higher timeframe read and no lookahead in this
// file, and signals wait for a bar to close.
// Built for: any instrument, any interval. Tested on daily and five minute
// bars of a liquid index future.
// Does not: place orders, size a position, or say anything about direction.
//
// Licence: Apache-2.0. See LICENSE beside this file.

version 1

study("Deviation bands", short = "Bands 1.2", overlay = true,
      precision = 2, group = "Volatility")

length   = input(20,    "Length", min = 2, max = 500,
                 tooltip = "Bars in the average and in the deviation")
widthDev = input(2.0,   "Band width, in standard deviations", min = 0.1, max = 10)
src      = input(close, "Source")
```

Six lines of that header are doing specific work.

- **The version number appears in the header and in the legend.** `short` is the
  legend name, so a user with three versions of a study on one chart can tell
  which is which without opening the settings.
- **"Needs" is a compatibility statement.** A study that needs volume draws
  nothing on an instrument the host has no volume for, and the reader should
  find that out from the header rather than from an empty pane.
- **"Warmup" is stated in bars and in the default setting.** Warmup is a promise
  in this language, so it can be stated exactly.
- **"Repaints" is stated even when the answer is no.** The answer is verifiable
  from the source: a repainting read has to name its mode on the line that does
  it. Saying so in the header saves every reader that check.
- **"Built for"** tells a reader whether they are the intended user.
- **"Does not"** is the line that prevents most misunderstandings, and it is the
  one everybody leaves out.

The `group` and `tooltip` arguments matter more than they look. A settings
dialog is the only documentation a large share of your users will ever read, so
write the titles as full phrases with units in them, and put anything a title is
too short to say in a tooltip.

## Versioning

Use three numbers, and give them meanings that match what a reader of a trading
script actually needs to know.

| Part | Increment when | Examples |
|---|---|---|
| Major | **The numbers change** for the same inputs on the same bars | A deviation switched from the population to the sample divisor; a window changed from inclusive to exclusive of the current bar; a fix to a genuinely wrong formula |
| Minor | Behaviour is added but existing numbers do not move | A new optional plot, a new input with a default that reproduces the old behaviour, a new alert |
| Patch | Nothing observable changes | A comment, a rename, a faster calculation that produces identical output on every bar |

The test for a major bump is mechanical and you already have it: run the old and
the new version over the same fixed bars with the same settings, and plot the
difference. If the difference is not a flat zero on every bar, it is a major
bump, whatever the change looked like in the diff.

This is the same distinction the language makes about itself. A bug fix that
changes a number is a version change, because a chart that silently redraws
itself after an update is worse than a chart that is slightly wrong in a
documented way. What the project promises for the language, you promise for your
script.

```
// 1.0.0: stdev defaults to the population divisor, which is what the band
// studies a chart must reproduce use.
dev = widthDev * stdev(src, length)

// 2.0.0: the sample divisor, requested for a statistical use. The numbers move
// on every bar, so this is a new major version and not an edit to 1.x.
dev = widthDev * stdev(src, length, sample = true)
```

If both readings have real users, the kinder answer is neither a fork nor a
silent change: add an input, keep the old default, and ship it as a minor
version.

```
// 1.1.0: both readings, and the old one is still what you get by default.
sampleDev = input(false, "Use the sample divisor",
                  tooltip = "Off reproduces version 1.0.0 exactly")

dev = widthDev * stdev(src, length, sample = sampleDev)
```

## A published version is immutable

**Once a version is published, its file never changes again.** Not for a typo in
a comment, not for a one character fix, not for "nobody has downloaded it yet".
A change becomes a new version number.

This is not ceremony. It is the only thing that makes any of the following true:

- **Results stay reproducible.** A chart, a backtest run and a live process each
  pin the script revision they started with, and a host records the hash of the
  source and the hash of the compiled program against them. A published file
  that changes while keeping its name breaks the link between a stored result
  and the code that produced it, and every number anyone quoted from it becomes
  unverifiable.
- **A bug report can be answered.** "Version 1.2.0 on these bars gives 41.7" is
  a report you can act on. "The latest version gives 41.7" is not, if the latest
  version has been three different files.
- **Nothing changes under a running strategy.** Editing a script must not
  silently change a study on somebody's chart or a strategy holding a position.
  The host guarantees this for a pinned revision; you guarantee it for a
  published file.

In practice:

- Put the version in the file name, in the header, and in the declaration's
  title or `short` name. Three places, because each one is visible in a
  different context.
- Keep old versions available. Somebody is running one, and their alternative to
  downloading it is to stop trusting their own results.
- If a version is dangerous, mark it withdrawn in the changelog and say why,
  rather than deleting it. A file that vanishes leaves the people who have it
  with no way to find out what was wrong.
- A file you have given to exactly one person is published. The rule is about
  whether anyone else has it, not about how many.

## The changelog

One entry per version, newest first, and each entry answers one question before
anything else: **did the numbers move?**

```
## 2.0.0

Numbers changed. The deviation now uses the sample divisor, so every band
value differs from 1.1.0. Re-run any backtest that used this study.

## 1.1.0

Numbers unchanged with default settings. Adds a "Use the sample divisor"
input, off by default, which reproduces 1.0.0 exactly.
Adds an alert on a close outside the upper band.

## 1.0.0

First release.
```

Three categories cover everything and keep the important one first: numbers
changed, behaviour changed, appearance changed. A reader deciding whether to
upgrade a study that a strategy depends on needs the first line and nothing
else.

## What to document for somebody who did not write it

The README carries what does not fit in the header. A workable template:

**What it does.** Two or three sentences, in the language a trader uses rather
than the language the code uses. Say what the lines on the chart mean, not which
functions produced them.

**The inputs.** A table, because a settings dialog is a list and a list does not
explain relationships.

| Input | Default | Range | Means |
|---|---|---|---|
| Length | 20 | 2 to 500 | Bars in both the average and the deviation |
| Band width | 2.0 | 0.1 to 10 | Standard deviations from the average to each band |
| Source | `close` | any price | Which price the average is computed from |

**What it needs.** Volume, a session definition, another instrument, a minimum
history, a particular timeframe. Every one of these turns into an empty pane or
a wrong number when it is missing, and every one of them is invisible in the
code to somebody who does not read the whole file.

**Warmup.** How many bars before it draws, as a formula over the inputs, plus
what it looks like at the defaults.

**Whether it repaints, and in what sense.** There are three honest answers and
your reader needs the right one. A script with no higher timeframe read and no
unconfirmed action does not repaint. A script reading a forming higher timeframe
bar changes its value within the current period, so a signal can be withdrawn. A
script using a lookahead read repaints on history by design, and the host marks
it as repainting in the legend, so saying so in the README costs you nothing and
buys trust.

**What it does not do.** The shortest section and the one that prevents the most
disappointment.

**How to reproduce the published numbers.** The bars, the settings and the
instrument facts you used, ideally as files beside the script. This is the same
material as a test case and there is no reason to build it twice.

**Known limitations.** Where it is wrong, where it is untested, and what you
would not use it for. A limitation you disclose is a feature of the
documentation. A limitation somebody else discovers is a bug report and a lost
reader.

## A licence

A script published with no licence grants nobody any rights, whatever the
author's intention was. Anyone careful enough to check will not use it, and
anyone who uses it anyway is doing so without permission. So choose one and put
it in the package.

The two families, described generically:

- **A permissive licence** lets anyone use, modify and redistribute the code,
  including inside something closed, usually requiring only that the notice
  travels with it.
- **A copyleft licence** requires that derived work is published under the same
  terms, which keeps the derivative open and, in exchange, makes it unusable
  inside a closed product.

This project's own code is under Apache-2.0, chosen deliberately over a copyleft
licence: a trading platform that wants to embed the language must be able to do
so without publishing its own source, or the language cannot become a shared
standard. A script is not a language, so that reasoning does not automatically
transfer. Pick the family that matches what you want to happen to your work,
name it in the header, and put the full text in the package as a `LICENSE` file.

Two related points that are not about licences and get confused with them. A
strategy is not investment advice, and a line in the README saying what it is
and is not is worth writing. And if your script was derived from somebody else's
published script, say so and honour their terms; the whole reason this ecosystem
is plain text files is so that provenance can be seen.

## Before you publish: the checklist

| Check | Why |
|---|---|
| The debug harness is gone | Debug plots, panels, labels and prints are noise in somebody else's chart, and a debug plot that is always absent earns OS8009 |
| The file compiles with no warnings | Every OS8xxx describes a shape that is nearly always a bug, and a clean file tells a reader that anything unusual was meant |
| The `version` line is present | Without it the file is compiled by the newest front end, which is the one thing that can change under it (OS8003) |
| Every input has a title, and a range where one makes sense | The settings dialog is the documentation most users read |
| Nothing is hard-coded that should be an input | A symbol, an exchange, a session window, a date |
| No credentials, keys, account numbers or broker identifiers appear anywhere | A script is a text file that travels |
| The numbers are reproducible from the bars and settings in the package | Section 4 of [testing.md](./testing.md) |
| The header states needs, warmup, repainting and what it does not do | These four answer most of the questions you would otherwise be asked |
| The version number appears in the file name, the header and the legend | Three contexts, three places |
| The licence file is present and the header names it | See above |

Here is what the last of the harness looks like on its way out.

```
// Before publishing: a probe, two debug plots and a panel nobody else wants.
watchBar = input(-1, "Dump state on this bar index, -1 for none")
if bar.index == watchBar
    print("basis " + text(basis, 8) + " dev " + text(dev, 8))
plot(dev, "debug: deviation", fuchsia, scale = "left")

// After: gone. If it was worth keeping, it belongs in the test case beside the
// script, not in the study every reader loads.
```

## After publishing

**When a bug is reported, ask for three things**: the version, the settings, and
the bars. With those you can reproduce it exactly, because nothing else in the
language varies: there is no randomness, no wall clock reading during a bar, and
no engine-dependent arithmetic. A report that cannot be reproduced from those
three is a report about the host or about the data, and that is worth knowing
too.

**When somebody says it repaints**, the answer is in the source and takes one
line to give. A higher timeframe read names its mode on the line that performs
it, and the default mode never repaints. Point at the line.

**When you want to change it**, go back to the top of this page. The fix is a
new version, the changelog says whether the numbers moved, and the old file
stays where it is.

## See also

- [testing.md](./testing.md) for producing the reproducible numbers a package quotes
- [style-guide.md](./style-guide.md) for the header, naming and comment conventions used here
- [debugging.md](./debugging.md) for the harness this page tells you to remove
- [limits.md](./limits.md) for the host requirements worth stating in a README
- [profiling.md](./profiling.md) for knowing what to say about a script's cost
- [../../README.md](../../README.md) for the project's own licence and the reason for it
- [../../examples/](../../examples/) for headers written in this style
