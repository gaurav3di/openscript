# Sessions and time

By the end of this page you can tell a trading session from a calendar day,
detect the first and last bar of a session reliably, read calendar fields in the
zone the chart is labelled in, and handle a holiday in a language that has no
holiday calendar.

## One instant, two calendars

Every bar carries `time`: the instant it opened, in **UTC milliseconds**. That
number is the same everywhere, it never shifts for daylight saving, and it is
the only thing in the language that is safe to store and compare later.

A calendar is what turns that instant into a year, a month, a day and an hour,
and the calendar the language uses by default is the chart's own:

> **Every function in the `date` and `session` families reads a timestamp in the
> chart's timezone (`chart.timezone`) unless a `zone` argument names another.**

The reason is not convenience. A session study that disagreed with the labels on
the chart's own axis would be wrong in the way that is hardest to see: the
numbers would be consistent, and every one of them would be off by some hours
against what the reader is looking at. So the default is the axis, not UTC.

A zone is an IANA area and location name, such as `"Asia/Kolkata"` or
`"America/New_York"`, and never a fixed offset and never an abbreviation. A
fixed offset is silently wrong for half the year anywhere that observes daylight
saving, and several abbreviations mean two different offsets in two parts of the
world, which is exactly the ambiguity a session test cannot carry. An unknown
zone is OS6005.

```
h = date.hour(time)                        // the chart's zone
h = date.hour(time, "Asia/Kolkata")        // a named zone
h = date.hour(time, "IST")                 // OS6005: not a zone name
```

## The trading session

A session is the instrument's trading session as the host defines it, in its
instrument record. It is not a window the script invents, and that matters: the
host knows about the half day before a holiday and the script does not.

| Call | Returns | Means |
|---|---|---|
| `session.isOpen` | `series bool` | This bar falls inside the instrument's trading session |
| `session.isFirstBar` | `series bool` | This is the session's first bar |
| `session.isLastBar` | `series bool` | This is the session's last bar |
| `session.startTime` | `series number` | When this bar's session opened |
| `session.endTime` | `series number` | When this bar's session is scheduled to close |
| `session.barIndex` | `series number` | This bar's position within its session, first is 0 |
| `session.isIn(spec, zone)` | `series bool` | Whether this bar falls in a stated window |

Two more are listed in the library as planned and are not available yet:
`session.isHoliday(t)`, which needs a calendar the host supplies, and
`session.nextOpen`.

## A calendar day is not a session

This is the distinction the whole page turns on. A session is what an exchange
opens and closes. A date is what a calendar says. They line up on many
instruments and they do not line up on many others.

| Case | Sessions | Dates |
|---|---|---|
| A day session, 09:15 to 15:30 | One | One |
| An evening session running 17:00 to 02:00 | One | Two |
| A market with a morning and an evening session | Two | One |
| A half day before a holiday | One, shorter | One |
| A holiday | None | One |
| A weekend | None | Two |

Everything in the language that resets "per day" resets per **session**, for
this reason. `vwap` restarts when the session opens, not at midnight, because
the session is what the number means. A `"1D"` higher timeframe read folds by
the session rather than by the clock. A strategy's `closeOnSessionEnd` flattens
at the session close.

Write your own state the same way:

```
version 1

study("Session state", overlay = true, precision = 2)

// Reset on the session's first bar, never on a date change. An evening session
// that runs past midnight is one session and two dates, and a script that reset
// on the date would wipe its own state in the middle of the night.
var sessionOpen = none
var sessionHigh = none
var sessionLow  = none

if session.isFirstBar
    sessionOpen = open
    sessionHigh = high
    sessionLow  = low
else
    // The else arm is where the running extremes are updated, so the first bar
    // seeds them and no other bar can overwrite the seed with a max against an
    // absent value.
    sessionHigh = max(sessionHigh, high)
    sessionLow  = min(sessionLow, low)

plot(sessionOpen, "Session open", silver, style = "step")
sessionHighPlot = plot(sessionHigh, "Session high", aqua,   style = "step")
sessionLowPlot  = plot(sessionLow,  "Session low",  orange, style = "step")
fill(sessionHighPlot, sessionLowPlot, fade(aqua, 94))
```

On the very first bar of the dataset, `sessionHigh` may still be absent if that
bar is in the middle of a session rather than at its start, because the reset
never ran. `max(none, high)` is absent, so the plot is empty until the first
complete session begins. That is correct and visible: the study is not claiming
to know a session high for a session it only saw half of.

### The tests that look right and are not

| Written as | Fails when |
|---|---|
| `not date.isSameDay(time, time[1])` | An overnight session changes date in the middle of trading, and a market with two sessions a day changes session without changing date |
| `date.hour(time) == 9 and date.minute(time) == 15` | The session opens late, a special session runs at another hour, or the chart's interval does not put a bar boundary at 09:15 |
| `date.dayOfWeek(time) != date.dayOfWeek(time[1])` | The same two cases, plus bar 0, where `time[1]` is absent |
| `bar.index % barsPerDay == 0` | A half day, a missing bar, or any day whose bar count is not exactly what the script assumed |

Every one of those is a reimplementation of `session.isFirstBar` that knows less
than the host does. Use the host's answer.

Note the bar 0 problem in the third row, which applies to all of them:
`time[1]` on bar 0 is absent, the comparison is absent, and an absent condition
takes the false branch. So the naive tests are also quietly false on the oldest
bar of every dataset.

## The last bar of a session

`session.isLastBar` is known from the session's **schedule**, not from the
arrival of a new bar. It is true on the last scheduled bar even if trading
stopped early and no further bars arrive at all.

That is the property a strategy needs. A strategy that must be flat by the close
and waits to see a bar from the next session has already carried the position
overnight. Acting on `session.isLastBar` acts while there is still a bar to act
on.

```
version 1

strategy("Flat by the close", overlay = true,
         product = "intraday", closeOnSessionEnd = true, fillOn = "nextOpen")

entryWindow = input("0930-1445", "Entry window")
fastLen = input(9,  "Fast length", min = 1, max = 500)
slowLen = input(21, "Slow length", min = 1, max = 500)

fast = ema(close, fastLen)
slow = ema(close, slowLen)

// An order placed outside the session cannot be worked by the exchange, and
// holding it until the open would fill it at a price the script never saw, so
// it is refused with OS7012. Guarding entries with session.isOpen is cheaper
// than handling the refusal.
canEnter = session.isOpen and session.isIn(entryWindow) and not session.isLastBar

if canEnter and crossUp(fast, slow)
    buy(qty = 1)

if canEnter and crossDown(fast, slow)
    sell(qty = 1)

// The belt and the braces. closeOnSessionEnd flattens at the scheduled close;
// this exits one bar earlier, at a price that is still trading, because the
// closing auction is not where an intraday strategy wants to find out what its
// fill was.
if session.isLastBar and pos.size != 0
    close()
```

`closeOnSessionEnd = true` and the explicit exit are not redundant in the way
they look. The declaration option is the engine's guarantee. The explicit exit
is the script's own decision about *where in the last bars* it wants out, and it
is the one that shows up in the trade list with a price you can check.

## Time inside a session

Three ways to say where a bar sits in its session, and they answer different
questions.

| Want | Use | Note |
|---|---|---|
| How long since the open | `time - session.startTime` | Milliseconds, immune to missing bars |
| How many bars since the open | `session.barIndex` | Counts bars that exist, not time |
| How long until the close | `session.endTime - time` | Milliseconds, from the schedule |

Milliseconds and bar counts disagree whenever a bar is missing, and the
disagreement is information: if `session.barIndex` is 40 and the elapsed time is
an hour on a one minute chart, twenty minutes of that session did not trade.

```
version 1

study("Session clock", overlay = true)

panel = table("Session clock", 5, 2, position = "topRight", textColor = silver)

elapsedMinutes   = (time - session.startTime) / 60000
remainingMinutes = (session.endTime - time) / 60000

// Written on the newest bar only. The panel shows one state, the current one.
if bar.isLast
    cell(panel, 0, 0, "Session opened")
    cell(panel, 0, 1, date.format(session.startTime, "EEE dd MMM HH:mm"),
         textColor = white)

    cell(panel, 1, 0, "Scheduled close")
    cell(panel, 1, 1, date.format(session.endTime, "HH:mm"), textColor = white)

    cell(panel, 2, 0, "Minutes elapsed")
    cell(panel, 2, 1, text(elapsedMinutes, 0))

    cell(panel, 3, 0, "Minutes remaining")
    cell(panel, 3, 1, text(remainingMinutes, 0),
         textColor = remainingMinutes < 15 ? red : silver)

    cell(panel, 4, 0, "Bars this session")
    cell(panel, 4, 1, text(session.barIndex + 1, 0))
```

Everything in that panel is rendered with `date.format`, which takes a closed set
of placeholders and copies every other character through:

| Placeholder | Gives | Placeholder | Gives |
|---|---|---|---|
| `yyyy` | Four digit year | `HH` | Two digit hour, 24 hour |
| `MM` | Two digit month | `mm` | Two digit minute |
| `dd` | Two digit day | `ss` | Two digit second |
| `MMM` | Three letter month | `EEE` | Three letter weekday |

Month and weekday abbreviations are English and invariant. A script whose output
changed because the machine running it was configured for a different locale
would produce two different charts from one file, which the determinism rule
does not allow.

## Windows inside a session

`session.isIn` takes a window spec, which is a string of the form
`"HHMM-HHMM"` with an optional day list.

```
session.isIn("0915-1530")               // every day the instrument trades
session.isIn("0915-1530:12345")         // Monday to Friday only
session.isIn("1700-0200")               // crosses midnight, which is intended
session.isIn("0915-1530", "Asia/Kolkata")   // in a named zone
```

| Part | Means |
|---|---|
| `HHMM-HHMM` | Start and end, on the chart's clock unless a zone is given |
| `:12345` | Days, 1 for Monday through 7 for Sunday |
| End before start | The window crosses midnight |

A window whose end is before its start is read as crossing midnight rather than
as an error, because that is what an overnight session needs and there is no
other sensible reading. A malformed spec written as a literal is rejected at
compile time rather than producing a window that silently matches nothing.

Days are numbered with **Monday as 1**, matching `date.dayOfWeek`, so a trading
week is one contiguous range and a weekday test reads as
`date.dayOfWeek(time) <= 5`. Numbering Sunday as 1 splits the trading week
across the two ends of the range, which turns every weekday test into two
comparisons joined by `or`.

## Calendar fields

The `date` namespace turns a timestamp into fields and back. These are the ones
a trading script actually reaches for:

| Call | Gives |
|---|---|
| `date.year(t)`, `date.month(t)`, `date.day(t)` | Calendar date parts |
| `date.hour(t)`, `date.minute(t)`, `date.second(t)` | Clock parts |
| `date.dayOfWeek(t)` | 1 for Monday through 7 for Sunday |
| `date.dayOfYear(t)`, `date.weekOfYear(t)` | Position in the year |
| `date.isSameDay(a, b)` | Whether two instants fall on one calendar day |
| `date.startOfDay(t)`, `date.startOfWeek(t)`, `date.startOfMonth(t)` | Midnight at the start of the day, the Monday, the first of the month |
| `date.from(year, month, day, hour, minute, second)` | Build a timestamp from fields |
| `date.format(t, pattern)` | Render a timestamp |

Every one of them takes an optional trailing `zone`. A field outside its range
given to `date.from`, such as a month of 13, is OS4010 rather than a silent
rollover into the next year.

An anchor a user picks is an input of kind `"time"`, which returns a number:

```
anchorTime = input("2025-01-01 09:15", "Anchor", kind = "time")

// The stored value is a wall clock string, so a saved layout restores to the
// same clock in another timezone. What the script receives is the timestamp,
// converted once, before bar 0, which is what comparing against time needs.
started = time >= anchorTime
```

## Holidays

**There is no holiday calendar in version 1.** `session.isHoliday(t)` is listed
as planned and arrives when a host supplies a calendar. Until then, a holiday is
not a flag a script can read. It is a shape in the data:

> On a holiday, there are no bars.

That one sentence has consequences worth spelling out.

- **Never count calendar days to find a previous session.** "Five days ago" is
  four sessions in a normal week with one holiday, and it is not a fixed number
  of bars either. Use a confirmed `"1D"` higher timeframe read with history taken
  inside the expression, which counts daily bars and therefore counts sessions.
- **Never assume `time - time[1]` is one interval.** It is one interval inside a
  session, an overnight gap at the open, a weekend on the first session of the
  week, and several days after a holiday.
- **Never assume a session has a fixed number of bars.** A half day is a real
  session with fewer of them, and `session.isLastBar` will be true earlier than
  the usual clock time.
- **Two instruments can have different holidays.** That is one of the ways a
  `req.symbol` read produces absent bars, and it is covered in
  [other-instruments.md](./other-instruments.md).

A script can still notice that sessions are missing, which is often all it needs
to widen a stop or skip a trade:

```
version 1

study("Session gaps", overlay = true)

// Midnight to midnight in the chart's own zone, so the subtraction below counts
// calendar days rather than 24 hour blocks. A day is 23 or 25 hours long where
// daylight saving is observed, which is exactly why this is rounded.
today     = date.startOfDay(time)
yesterday = isNone(time[1]) ? none : date.startOfDay(time[1])
daysSkipped = isNone(yesterday) ? none : round((today - yesterday) / 86400000)

// A normal Monday follows a Friday and skips three calendar days. Any other
// session follows the previous one and skips one. More than that means at least
// one session the exchange would normally have held did not happen.
expected = date.dayOfWeek(time) == 1 ? 3 : 1
missing = session.isFirstBar and not isNone(daysSkipped) and daysSkipped > expected

if missing
    signal("SESSION MISSING", orange, at = "above")

// A gap in the data is a gap in every average that spans it, so a study that
// cares about continuity says where the seams are rather than pretending the
// series is even.
background(missing ? fade(orange, 88) : none)
```

That test is a heuristic and the comments say so: it assumes a Monday to Friday
week, which is not true of every market in the world, and it cannot tell a
public holiday from an exchange outage. It is honest about the thing it can
actually observe, which is that a session the pattern expected did not arrive.
When a host supplies a calendar, `session.isHoliday` will answer the question
properly and this script becomes three lines shorter.

## The wall clock

`chart.now()` is the chart's wall clock in UTC milliseconds, and it is the only
reading of a clock available during a bar. Everything else in a script is a
function of the bars.

Use it to ask how stale the chart is, not to compute anything historical:

```
// How long ago the newest bar opened. On a live chart this counts up; on a
// static one it is however long ago the data was loaded.
ageMinutes = (chart.now() - time) / 60000
```

A study that fed `chart.now()` into a calculation would produce a different
value every time it ran, which is why the determinism rule names it explicitly
as the one exception and why the conformance suite fixes its value.

## Mistakes worth naming

- **Resetting on a date change instead of `session.isFirstBar`.** Correct on a
  day session, wrong on every overnight one, and the bug appears at 00:00 in a
  market nobody is watching.
- **Waiting for the next session's first bar to flatten.** By then the position
  is overnight. Act on `session.isLastBar`.
- **Using a fixed offset as a timezone.** Right for half the year.
- **Comparing `date.hour(time)` against a hard coded open.** The chart's
  interval decides where bar boundaries fall, and the exchange decides when it
  opens. Both change.
- **Storing `bar.index` to mark "the bar the session opened on".** Every index
  shifts when more history loads, which the compiler warns about with OS8014.
  Store `session.startTime` or `time`.

## See also

- [timeframes.md](./timeframes.md) for intervals, and for measuring a window in
  milliseconds rather than in bars
- [higher-timeframes.md](./higher-timeframes.md) for daily and weekly reads,
  which fold by the session rather than by the clock
- [other-instruments.md](./other-instruments.md) for what happens when two
  instruments keep different hours or different holidays
- [repainting.md](./repainting.md) for acting on the session's last bar without
  acting on a bar that is still moving
- [../README.md](../README.md) for the rest of the documentation
