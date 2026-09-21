# Revisions

By the end of this page you will know what a save actually writes, how to read a
script's history, how to compare two revisions and restore one, and why editing a
script can never change the study already on your chart, the report of a backtest
you ran last month, or the strategy that is holding a position right now.

## What a save writes

A save is not a file write. It compiles first, and a script that does not compile
is not a revision: a history full of entries that never ran would be a history you
cannot restore from. Once the source compiles, the save appends one row.

| Field | Holds |
|---|---|
| Number | A revision number that only ever goes up |
| Timestamp | When the save happened |
| Message | Your one line, optional but worth writing |
| Source | The complete text of the script, not a diff |
| Hash | A digest of that text, so two revisions can be compared without reading them |
| Language version | The version the revision compiled under |

**The full source, not a diff.** A revision has to stand on its own years later.
A chain of diffs is only as reliable as its weakest link, and the one moment you
need revision 3 is the moment you cannot afford to reconstruct it from twelve
patches.

**The language version, recorded whether or not the file names it.** This is the
field that keeps the compatibility promise: a script that compiles under language
version 1 compiles under every later release of the compiler and produces the same
numbers, because every past front end is kept and selected by the declared
version. A file that declares nothing is compiled by the newest front end, and the
compiler says so with warning OS8003.

```
version 1

study("Range breakout", overlay = true, precision = 2)

len = input(20, "Lookback", min = 2, max = 500)

hi = highest(high, len)[1]
lo = lowest(low, len)[1]

plot(hi, "Upper", aqua)
plot(lo, "Lower", orange)
```

The first line is the cheapest insurance in the language. Without it, the revision
carries the version the host recorded, which is correct but invisible: nobody
reading the file in a folder six months from now can see what it was parsed as.
With it, the file says so itself, and the answer travels with the text.

## The history

The history is the list of every revision of one script, newest first, with its
number, timestamp, message and the size of the change. It is append only. Nothing
in the workflow removes a revision, and that is deliberate: a history you can
prune is a history that cannot be used as evidence about what you were running on
a day when something went wrong.

A message is one line, and the useful ones say what moved rather than what was
typed.

| Message | Worth |
|---|---|
| "update" | Nothing |
| "fix" | Nothing |
| "tidy up, no change to numbers" | High. It tells a future reader they can skip the diff |
| "stop moved from 2 ATR to 2.5 ATR; every chart on the old default will change" | High. It names the consequence |
| "added the volume filter, entries drop by about a third on the test range" | High |
| "renamed len to lookback; saved settings will reset" | The highest kind: it warns about the layout |

Write the message at the moment you save, while you still know why. A message
written later is a guess about your own intentions.

## Comparing two revisions

A comparison shows the two sources side by side with the differing lines marked.
What you are reading it for is not the text; it is which of three things moved.

| Change | Moves the numbers | Moves the dialog | Orphans a saved layout |
|---|---|---|---|
| A comment, or a rename of a name nothing else reads | No | No | No |
| A formula or a length in the calculation | Yes | No | No |
| An input's default changed | Yes, for every reader who never overrode it | No | No |
| An input's bounds tightened | No, unless a stored value is now outside them | No | A stored value outside the new bounds stops the study |
| An input added | No, until something reads it | Yes, one new row on its default | No |
| An input renamed or removed | Yes | Yes | Yes, the stored value has nothing to attach to |
| A plot's title changed | No | Yes | Yes, the stored colour and thickness are orphaned |
| A plot added or removed | No | Yes | No for the others |
| `overlay`, `range`, `precision` or `scale` changed | No | Yes | The pane placement changes |

The two rows that catch people are the middle ones. Changing a default changes the
study for everyone who accepted it and for nobody who did not, so two readers of
the same revision legitimately see two different pictures. Renaming an input
changes the key the layout stores against, so the value comes back on the new
default. Neither is a bug and neither can be fixed by the host, because there is
nothing left to match on.

Here is a comparison worth reading twice. Revision 4:

```
version 1

study("Volatility bands", overlay = true, precision = 2)

len  = input(20,  "Length", min = 2, max = 500)
mult = input(2.0, "Width",  min = 0.2, max = 10)

basis = sma(close, len)
band  = mult * stdev(close, len)

plot(basis,        "Basis", orange, width = 2)
plot(basis + band, "Upper", aqua)
plot(basis - band, "Lower", aqua)
```

Revision 5:

```
version 1

study("Volatility bands", overlay = true, precision = 2)

length = input(20,  "Length", min = 2, max = 500)
mult   = input(2.5, "Width",  min = 0.2, max = 10)
src    = input(hlc3, "Source")

basis = sma(src, length)
band  = mult * stdev(src, length)

plot(basis,        "Basis", orange, width = 2)
plot(basis + band, "Upper band", aqua)
plot(basis - band, "Lower", aqua)
```

Four changes, and each lands in a different column of the table above.

- `mult` defaulting to `2.5` instead of `2.0` changes the bands for every reader
  who left the row alone, and changes nothing for a reader who had already set it
  to `3`.
- `len` renamed to `length` orphans every stored value for that row, so a reader
  who had it at `50` comes back at `20`.
- `src` added gives every reader a new row set to `hlc3`, which also changes the
  numbers, because revision 4 read `close`.
- "Upper" retitled to "Upper band" orphans the stored colour and thickness for
  that one column.

Three of those four would have been invisible in a summary that said "tuned the
bands". That is what a comparison is for.

## Restoring

Restoring revision 4 does not delete revisions 5 onward. It writes revision 6,
whose source is revision 4's source, with a message saying where it came from.

The history is append only for the same reason a trade log is: the one thing a
history is for is being able to go back to what you went back from. A restore that
truncated the list would destroy the record of the experiment at exactly the
moment the experiment failed, which is the moment the record is worth most.

A restore is a save, so everything a save does applies. It compiles first. It
records the language version. It does not move a single pin.

## Pinning, which is the rule that keeps a chart still

**A chart, a backtest run and a running strategy each hold the revision they
started with. Editing a script never silently changes a study on a chart or a
strategy holding a position.**

| Holder | Pins | Moves to a new revision when |
|---|---|---|
| A study on a chart | The revision that was current when it was added, stored in the saved layout | You accept the chart's offer to update |
| A backtest run | The revision it ran, plus the compiled program's hash and the settings it ran with | Never. A run is a record, not a view |
| A running strategy | The revision it started with | You stop it and start it again |
| The editor | Nothing. It shows a working copy | Every save, which is what a save is |

A chart holding an older revision says so and offers the newer one: revision 7,
latest is 9, update. It never takes the offer for you. That single sentence of
behaviour is why all three of the following are true.

### Why the chart pins

A study on a chart is a measurement, and a measurement that can change while you
are looking at it is not a measurement. If saving an edit reached back into every
open chart, then the level you drew a conclusion from an hour ago would already be
a different level, and you would have no way to know which one you actually saw.

There is a second, quieter reason. The saved layout stores input values against
names and style overrides against titles, and those names belong to a particular
revision of the script. A chart that silently took a revision where an input was
renamed would come back with rows on their defaults, having lost a configuration
the reader never chose to lose.

### Why the backtest run pins

A report that cannot be reproduced is not a result. A run records the revision it
compiled, the hash of the compiled program, the input values, the date range, the
instrument and the cost settings, so re-running it months later either gives the
same numbers or gives a difference you can name. That is also what makes two runs
comparable at all: if a run only stored a pointer to "the script", then comparing
last week's result with today's would be comparing two unknown things.

### Why the running strategy pins, and this is the one that costs money

A running strategy holds open positions and per-bar state. Consider this file
running live with a position open.

```
version 1

strategy("Breakout, bracketed", overlay = true,
         capital = 500000, qty = 1, qtyType = "lots",
         fillOn = "nextOpen", slippage = 1)

len      = input(20,  "Breakout lookback", min = 2, max = 500)
stopMult = input(2.0, "Stop, in ATR",      min = 0.2, max = 20)

hi = highest(high, len)[1]
atrValue = atr(14)

// The stop is held rather than recomputed, so the level being watched is the
// level that was actually sent on the entry bar, not a level derived from
// today's volatility.
var stop = none

if pos.isFlat and close > hi
    stop = close - stopMult * atrValue
    buy(qty = 1)

if pos.isLong and close < stop
    close()
    stop = none

plot(hi, "Breakout level", aqua, width = 2)
plot(pos.isLong ? stop : none, "Stop", red, width = 2)
```

The position was entered under a `stop` computed on the entry bar. Now suppose a
save changed `stopMult` or changed how `stop` is set. If the running process
picked that up, the strategy would be managing a position it entered under one
rule with a different rule, and the level in `var stop` would have come from code
that is no longer in the file. In the worst shape, an edit that reorders or renames
the persistent values leaves the process holding a position and no stop at all.

So the process keeps its revision until you stop it and start it again, which is a
decision with a moment attached to it rather than a side effect of pressing save.
Save as often as you like while a strategy is running. Nothing you save reaches it.

## Moving a running strategy to a new revision

1. Decide what happens to the open position. A restart begins with fresh
   persistent state: every `var` is initialised again on the first bar the new
   process reaches. A position that was open is still open at the broker, and the
   new process learns the position from the account, but it does not inherit the
   stop level the old one was holding in a `var`.
2. Flatten first if the strategy's exit depends on state it computed at entry,
   which is the common case and is true of the script above.
3. Stop the process, then start it. The run log names the revision it started, so
   the record says which code was in charge from which minute.

A host refuses an action that would change a running script rather than performing
it quietly, for the same reason the pin exists at all.

## What a revision does not pin

A revision fixes your source and the language version. It fixes nothing else, and
three of those are worth knowing before you rely on one.

**It does not pin the data.** `bar.index` is a position inside the dataset the
engine was given, and loading more history shifts every index. A persistent value
holding a bar index is warning OS8014 for exactly this reason. Store `time`, which
does not move.

**Not raised yet.** OS8014 is in the catalogue and nothing raises it: the
checker does not follow a bar index into a persistent value.

```
version 1

study("Minutes since the crossing", precision = 0)

fast = ema(close, 9)
slow = ema(close, 21)
up   = crossUp(fast, slow)

// time, never bar.index. An index is a position inside the dataset the engine
// was given, so paging in older history moves it; an instant does not move.
var signalTime = none
if up
    signalTime = time

plot(isNone(signalTime) ? none : (time - signalTime) / 60000,
     "Minutes since the crossing", aqua)
```

**It does not pin the instrument, the interval or the settings.** Two charts can
hold revision 7 with different input values and different intervals and produce
two different pictures, correctly. This is why a report about a study has to name
the revision and the settings, and why a backtest run records both.

**It does not pin the market data provider's history.** A backtest re-run against
a provider that has since corrected or extended its bars is a different run, and
the compiled program's hash matching while the numbers differ is the signal that
the data moved rather than the script.

## A working habit

- **Keep the `version` line.** One line, first in the file, and the revision can
  never be parsed by a front end you did not choose.
- **Save at the point where you would be annoyed to lose the work**, and write the
  one line message then.
- **Before a live run, save.** The run pins the number it started with, and a run
  that started from an unsaved working copy has no revision to point at.
- **Say so when a rename resets a saved layout.** Readers accept it when they are
  told and treat it as a bug when they are not.
- **Restore rather than retype.** Going back to revision 4 by hand produces a
  revision that is nearly revision 4, and "nearly" is the part that will cost an
  afternoon.

## See also

- [inputs.md](./inputs.md) for the names a saved layout keys on, and why renaming
  an input is a change your readers will see
- [settings-and-style.md](./settings-and-style.md) for what a saved layout stores
  beside the pinned revision
- [running/backtesting.md](./running/backtesting.md) for the run that records a
  revision, and [running/reading-a-report.md](./running/reading-a-report.md) for
  what a recorded run lets you compare
- [running/sandbox-and-live.md](./running/sandbox-and-live.md) for starting and
  stopping the process that holds a revision
- [language/persistence.md](./language/persistence.md) for the `var` state a
  restart begins again
- [../spec/language.md](../spec/language.md) section 4 for the version declaration
  and the compatibility promise it rests on
