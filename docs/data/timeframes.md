# Timeframes

By the end of this page you can read the chart's own interval from inside a
script, convert a period stated in minutes or hours into a count of bars, and
write a study that means the same thing on a one minute chart as it does on a
daily one.

## What an interval is

A chart hands the engine a list of bars, and the **interval** is the rule that
decided where one bar ended and the next began. On a five minute chart every bar
covers five minutes of trading. On a daily chart every bar covers one trading
session. The script never sees the rule itself. It sees the bars the rule
produced, one per execution of the file, oldest first.

Every bar carries `time`, the instant it opened, as UTC milliseconds. That is
the only timestamp version 1 gives you for a bar: `timeClose` is listed in the
library as planned and is not available yet, so a script that needs the end of a
bar either adds the interval to `time` or asks the session for it with
`session.endTime`.

A bar is finished when its interval has elapsed. Until then it is still moving,
its `close` is the last traded price rather than a closing price, and
`bar.isConfirmed` is `false`. Everything a script does with an interval sits on
top of those two facts: a bar covers a known span of time, and the newest one is
not finished.

### Clock intervals and calendar intervals

Minutes and hours are measured by the clock. Days, weeks and months are measured
by the calendar and by the instrument's session.

That difference is not a technicality. A daily bar is not 1440 minutes of
trading: it is one session, which may be 375 minutes, or 390, or a half day
before a holiday. A monthly bar is 28, 29, 30 or 31 days depending on which
month it is. There is no constant you can multiply to turn one into the other,
so the language does not pretend there is one: `chart.intervalMinutes` is a
number on an intraday chart and is absent on a daily, weekly or monthly chart.

| Interval kind | Measured by | `chart.intervalMinutes` | `chart.isIntraday` |
|---|---|---|---|
| `"1m"` to `"4h"` and any minute count | The clock | The count in minutes | `true` |
| `"1D"` | The session | absent | `false` |
| `"1W"`, `"1M"` | The calendar | absent | `false` |

## How a timeframe is written

A timeframe is a count and a unit, written as a string.

| Written | Means | Note |
|---|---|---|
| `"1m"`, `"5m"`, `"15m"` | Minutes | |
| `"1h"`, `"4h"` | Hours | |
| `"1D"` | Days | |
| `"1W"` | Weeks | |
| `"1M"` | Months | |
| `"60"` | Sixty minutes | A bare number is read as minutes |

Two rules to hold on to:

- **The unit letter is case sensitive.** `"1M"` is one month and `"1m"` is one
  minute. They differ by roughly a factor of forty thousand, so the two are
  never allowed to be the same token.
- **A bare number is minutes**, so `"60"` and `"1h"` are the same timeframe.
  That form exists because an interval input hands the script a bare number, and
  a script should not have to reformat what the settings dialog gave it.

A string that is not one of these forms is rejected at compile time with OS6001,
naming the value. The compiler catches it rather than the host, because a
timeframe typed by hand into a literal is a typing mistake and there is no
reason to wait until the chart is loaded to say so.

## Reading the chart's own interval

Four facts describe the interval the script is running on. They live in the
`chart` namespace.

| Call | Type | Holds |
|---|---|---|
| `chart.interval` | `string` | The interval in canonical form, as written above |
| `chart.intervalMinutes` | `number` | The interval in minutes, absent for a calendar interval |
| `chart.isIntraday` | `bool` | The interval is shorter than one day |
| `chart.timezone` | `string` | The zone the chart's axis is labelled in |

These are plain values, not series. They carry no history and `chart.interval[1]`
does not compile, because the interval is constant for the whole run: changing
the chart's interval loads different bars and starts a new run. That is what
makes it safe to branch on one at the top level of a file and know the branch is
decided the same way on every bar.

```
version 1

study("What am I running on", overlay = true)

// A table is declared once, before the first bar, exactly like a plot. Only the
// contents of its cells are per bar.
panel = table("Chart", 3, 2, position = "topRight", textColor = silver)

// Written only on the newest bar. The panel shows one state, the current one,
// and writing it on every historical bar would be fifty thousand writes to
// display the last of them.
if bar.isLast
    cell(panel, 0, 0, "Interval")
    cell(panel, 0, 1, chart.interval, textColor = white)

    cell(panel, 1, 0, "Minutes per bar")
    cell(panel, 1, 1, isNone(chart.intervalMinutes)
                      ? "not a clock interval"
                      : text(chart.intervalMinutes, 0))

    cell(panel, 2, 0, "Intraday")
    cell(panel, 2, 1, chart.isIntraday ? "yes" : "no")
```

The absent case is written out rather than left to `text()`, because
`text(none)` is the string `"none"` and a panel that reads "none" tells the
reader nothing about why.

## Why a length in bars is not a length in time

Almost every library call takes a length in **bars**: `sma(close, 20)` averages
twenty bars, whatever a bar is on this chart. That is the right default, because
a bar is the unit the study is drawn in, but it means the same script describes
a different span of time on every interval.

| Chart interval | `sma(close, 20)` covers |
|---|---|
| `"1m"` | 20 minutes |
| `"5m"` | 100 minutes |
| `"15m"` | 5 hours |
| `"1h"` | 20 hours, which crosses at least two sessions |
| `"1D"` | About a month of trading |

Nothing there is wrong. A twenty bar average is a perfectly good idea on every
one of those charts. The problem starts when a study is built and tuned on one
interval, with a length chosen because it worked, and is then dropped on another
interval where the same number means something else. The fix is to decide, once,
which unit the study is actually about, and to say so in the input's title.

| The study is about | State the length in | Reason |
|---|---|---|
| The shape of the last N bars | Bars | The unit the pattern is made of |
| The last two hours of trading | Minutes, converted to bars | The unit the trader thinks in |
| Since the session opened | Milliseconds since `session.startTime` | Neither bars nor a fixed clock span |
| Yesterday, last week | A coarser interval read | See [higher-timeframes.md](./higher-timeframes.md) |

## Converting a period in time into a period in bars

The arithmetic is one division, and the three guards around it are what make it
correct.

```
bars = round(minutes / chart.intervalMinutes)
```

**Guard one: the interval may not be measured in minutes at all.**
`chart.intervalMinutes` is absent on a daily, weekly or monthly chart, and
absence propagates through the division, so `bars` is absent and every call that
takes it as a length fails at run time with OS4003 rather than drawing nothing.
Test with `chart.isIntraday` or `isNone` first.

**Guard two: a length must be a whole number of 1 or more.** A fractional length
is OS3004 at compile time and OS4003 at run time. It is rejected rather than
truncated because a length of 14.5 is a bug in the script and rounding it
quietly hides the bug. So round, and then floor the result at 1, because
`round(0.4)` is 0 and a length of zero is an error, not an empty average.

**Guard three: the answer is exact only inside a session.** Sixty minutes is
twelve five minute bars while the market is open, and it is not twelve bars
across a lunch break, an overnight gap or a holiday, because no bars exist in
those spans. A bar count is a count of bars that traded, not a span of wall
clock time. Where the distinction matters, measure in milliseconds instead: the
next section does.

Here is the whole pattern in a script.

```
version 1

study("Time based mean", overlay = true, precision = 2)

periodMinutes = input(120, "Average length, in minutes", min = 5, max = 1440)

// One place that decides what an interval the clock cannot measure means for
// this study. Everything below reads the answer rather than dividing again.
usable = chart.isIntraday

// The length is computed unconditionally and floored at 1, so sma() always gets
// a legal length. Hiding the output is done at the plot, with none, not by
// putting the call inside a branch: a stateful call inside a branch advances
// only on the bars where the branch runs and is absent on the rest, which is
// warning OS8001 and a broken line.
barsWanted = usable ? max(1, round(periodMinutes / chart.intervalMinutes)) : 1
line = sma(close, barsWanted)

plot(usable ? line : none, "Time based mean", aqua, width = 2)

// A study that cannot say what it means on this chart says so, once, rather
// than drawing a line whose length nobody can name.
note = table("Note", 1, 1, position = "bottomRight", textColor = silver)
if bar.isLast and not usable
    cell(note, 0, 0, "This study needs an intraday chart")
```

What the division actually produces, on a 120 minute input:

| Chart interval | 120 / interval | `round` | `max(1, ...)` | Span really covered |
|---|---|---|---|---|
| `"1m"` | 120 | 120 | 120 | 120 minutes |
| `"5m"` | 24 | 24 | 24 | 120 minutes |
| `"45"` | 2.67 | 3 | 3 | 135 minutes |
| `"4h"` | 0.5 | 1 | 1 | 240 minutes |
| `"1D"` | absent | absent | 1, by the guard | The study hides itself |

The last two rows are the honest part. On a four hour chart, "the last two
hours" cannot exist: the finest thing the chart knows is four hours, and one bar
is the closest answer there is. The study rounds, draws, and covers more than
the input asked for. If that is unacceptable for a particular study, test it and
hide the output, exactly as the daily case is handled above.

## Measuring in milliseconds instead

`time` is UTC milliseconds, so the difference between two bars' times is a real
duration, unaffected by how many bars happen to sit between them.

```
version 1

study("First minutes of the session", overlay = true, precision = 2)

windowMinutes = input(15, "Window, in minutes", min = 1, max = 240)

var openTime = none

// The reset is on the session's first bar, not on a date change: an evening
// session that runs past midnight is one session and two dates.
if session.isFirstBar
    openTime = time

// Milliseconds since the open rather than a bar count, so this says the same
// thing on a one minute chart and a fifteen minute one, and on a day the
// session opened late.
elapsed = isNone(openTime) ? none : time - openTime
inWindow = not isNone(elapsed) and elapsed < windowMinutes * 60000

background(inWindow ? fade(silver, 92) : none)
plot(inWindow ? high : none, "High in the window", aqua, style = "step")
```

Two units, two jobs:

| Use | When it is right | When it lies |
|---|---|---|
| A count of bars | The study is about the last N bars of price action | Across a session break, a holiday, or a feed with missing bars |
| Milliseconds from `time` | The study is about a span of trading time | Across an overnight gap, where the span includes hours nobody traded |

Neither is universally right. The point is that you choose, and the choice is
visible in the source.

## Warmup moves with the interval

A call that needs `len` bars is absent until `len` bars exist, exactly, and no
implicit warmup period exists beyond that. When the length comes from a
conversion, the number of absent bars at the left edge of the chart changes with
the interval, and a reader who does not expect it reads the gap as a bug.

| Chart interval | `periodMinutes = 120` | Length in bars | Absent bars at the start |
|---|---|---|---|
| `"1m"` | 120 minutes | 120 | 119 |
| `"5m"` | 120 minutes | 24 | 23 |
| `"1h"` | 120 minutes | 2 | 1 |

Warmups compose, too. `sma(ema(close, 10), 10)` is absent until bar 18, because
the inner call is absent for its first nine bars and the outer call needs ten
present values after that. If a converted length feeds a stack of calls, the
left edge of the chart can be empty for a surprising number of bars on a fine
interval. That is not a defect: it is the study saying it does not have the data
yet.

## Adapting a study to the interval it is on

Sometimes a study genuinely has two behaviours: one for a chart the clock
measures and one for a chart the calendar measures. Write both, and let the
interval choose.

```
version 1

study("Interval aware range", overlay = true, precision = 2)

// Two inputs, in two units, because there is no honest conversion between a
// month and a minute. The titles say which chart each one applies to, so the
// settings dialog explains itself.
barLookback     = input(20,  "Lookback on a daily or coarser chart, in bars", min = 2, max = 500)
minuteLookback  = input(240, "Lookback on an intraday chart, in minutes", min = 5, max = 1440)

// Declared before the if, then updated inside it. An assignment to a name that
// already exists in an enclosing scope updates that name; a name first assigned
// inside the block would not be visible after it.
len = barLookback
if chart.isIntraday
    len = max(1, round(minuteLookback / chart.intervalMinutes))

// The guard is also what makes the division safe: chart.intervalMinutes is
// never absent on a branch that chart.isIntraday selected.
top = highest(high, len)
bottom = lowest(low, len)

topPlot    = plot(top, "Lookback high", aqua, width = 2, style = "step")
bottomPlot = plot(bottom, "Lookback low", orange, width = 2, style = "step")
fill(topPlot, bottomPlot, fade(aqua, 93))
```

The `"step"` style is deliberate. These two levels change only when a new
extreme is set, so a sloping line between two values would draw prices that were
never read. Any value that is held constant between updates is drawn as a step,
and the same rule applies with more force to a coarser interval read.

## Mistakes worth naming

- **Dividing by `chart.intervalMinutes` with no absence guard.** The study works
  on every intraday chart, is silently empty on the daily one, and the reason is
  four lines away from the symptom.
- **Assuming `time - time[1]` is the interval.** It is, inside a session. It is
  an overnight gap at the open, a weekend on Monday, and a holiday at random. If
  you need the interval, read `chart.intervalMinutes`.
- **Storing a bar count and comparing it after more history loads.** A bar index
  is a position in the data the engine was given, not an address, and every
  index shifts when older bars are paged in. The compiler warns about it with
  OS8014 and the fix is to store `time` instead, which does not move.
- **Passing a fractional length.** `sma(close, 20 * 1.5)` is 30 and fine;
  `sma(close, len / 2)` is not, on any odd `len`. Round it where it is computed,
  not where it is used, so there is one place to read.
- **Taking a length from an interval input by accident.** An interval input
  returns a timeframe string such as `"60"`, not a number of bars. It belongs in
  a coarser interval read, not in a length argument.

## See also

- [higher-timeframes.md](./higher-timeframes.md) for folding these bars up into
  a coarser interval, and the three modes a read must declare
- [sessions-and-time.md](./sessions-and-time.md) for the session, the chart
  timezone, and the difference between a calendar day and a trading session
- [repainting.md](./repainting.md) for what happens when a study reads a bar
  that has not finished
- [other-instruments.md](./other-instruments.md) for reading bars that are not
  the chart's own
- [../README.md](../README.md) for the rest of the documentation
