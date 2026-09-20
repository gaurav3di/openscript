# Time, session and calendar functions

By the end of this page you will be able to read a bar's timestamp as a
calendar, render it as text, test whether a bar falls inside a trading session
or a window you name, and do all of it in the same timezone the chart's own axis
is labelled in.

## How time is carried

Time is a `number`: milliseconds since the Unix epoch, UTC. There is no separate
time type in version 1, so a timestamp can be compared, subtracted and stored
like any other number, and the functions on this page convert between that
number and calendar fields.

| Name | Type | Means |
|---|---|---|
| `time` | `series number` | The bar's opening instant, UTC milliseconds |
| `timeClose` (planned) | `series number` | The instant the bar's interval ends |
| `chart.timezone` | `string` | The chart's IANA zone, the calendar its axis is labelled in |
| `chart.now()` | `number` | The chart's wall clock, UTC milliseconds |
| `chart.intervalMinutes` | `number` | The interval in minutes, `none` for a non-time interval |

Those five are documented with the rest of their namespaces in
[series.md](./series.md); they are repeated here because every function below
takes one of them as an argument.

## The zone every calendar field is read in

**Every function on this page reads a timestamp in the chart's timezone unless a
`zone` argument names another.** A session study that disagreed with the labels
on the chart's own axis would be wrong in the way that is hardest to see: the
numbers would look reasonable and land on the wrong bars.

A zone is an IANA name, never a fixed offset. A fixed offset is silently wrong
for half the year anywhere that observes daylight saving, and a script written
in winter that breaks in summer is a script whose author has already moved on.
An unknown zone name is a data error (OS6005).

```
hourHere  = date.hour(time)                        // the chart's own zone
hourThere = date.hour(time, "Europe/London")       // another zone, named
```

None of the `date` functions has a warmup: given a present timestamp they
produce a value on bar 0.

---

## 1. Calendar fields

`t` is a timestamp in UTC milliseconds, usually `time`. In every signature
below, `zone` is a `string` whose default is `chart.timezone`.

### `date.year(t, zone = chart.timezone)`

Calendar year.
Parameters: `t` `number` required; `zone` `string` default `chart.timezone`.
Returns `number`.

```
newYear = date.year(time) != date.year(time[1])
```

### `date.month(t, zone = chart.timezone)`

Month, 1 to 12.
Parameters: `t` `number` required; `zone` `string` default `chart.timezone`.
Returns `number`.

```
isQuarterEnd = date.month(time) % 3 == 0
```

### `date.day(t, zone = chart.timezone)`

Day of the month, 1 to 31.
Parameters: `t` `number` required; `zone` `string` default `chart.timezone`.
Returns `number`.

```
firstOfMonth = date.day(time) != date.day(time[1]) and date.day(time) == 1
```

### `date.dayOfWeek(t, zone = chart.timezone)`

1 for Monday through 7 for Sunday.
Parameters: `t` `number` required; `zone` `string` default `chart.timezone`.
Returns `number`.

```
weekday = date.dayOfWeek(time) <= 5
```

Monday is 1 so that a weekday test reads as a range and a trading week is
contiguous. Numbering Sunday as 1, which some calendars do, splits the trading
week across both ends of the range and makes every weekday test two comparisons
joined by `or`.

### `date.dayOfYear(t, zone = chart.timezone)`

1 to 366.
Parameters: `t` `number` required; `zone` `string` default `chart.timezone`.
Returns `number`.

```
sessionsThisYear = date.dayOfYear(time)
```

### `date.hour(t, zone = chart.timezone)`

0 to 23.
Parameters: `t` `number` required; `zone` `string` default `chart.timezone`.
Returns `number`.

```
morning = date.hour(time) < 12
```

### `date.minute(t, zone = chart.timezone)`

0 to 59.
Parameters: `t` `number` required; `zone` `string` default `chart.timezone`.
Returns `number`.

```
onTheHour = date.minute(time) == 0
```

### `date.second(t, zone = chart.timezone)`

0 to 59.
Parameters: `t` `number` required; `zone` `string` default `chart.timezone`.
Returns `number`.

```
atOpenSecond = date.second(time) == 0
```

### `date.weekOfYear(t, zone = chart.timezone)`

Week number, with weeks starting on Monday.
Parameters: `t` `number` required; `zone` `string` default `chart.timezone`.
Returns `number`.

```
newWeek = date.weekOfYear(time) != date.weekOfYear(time[1])
```

---

## 2. Building and truncating a timestamp

### `date.from(year, month, day, hour = 0, minute = 0, second = 0, zone = chart.timezone)`

Build a timestamp from calendar fields.
Parameters: `year` `number` required; `month` `number` required; `day` `number`
required; `hour` `number` default `0`; `minute` `number` default `0`; `second`
`number` default `0`; `zone` `string` default `chart.timezone`.
Returns `number`.

```
cutoff = date.from(2025, 1, 1, 9, 15)
```

### `date.startOfDay(t, zone = chart.timezone)`

Midnight at the start of `t`'s day.
Parameters: `t` `number` required; `zone` `string` default `chart.timezone`.
Returns `number`.

```
minutesIntoDay = (time - date.startOfDay(time)) / 60000
```

### `date.startOfWeek(t, zone = chart.timezone)`

Midnight at the start of `t`'s Monday.
Parameters: `t` `number` required; `zone` `string` default `chart.timezone`.
Returns `number`.

```
weeklyAnchor = time == date.startOfWeek(time)
```

### `date.startOfMonth(t, zone = chart.timezone)`

Midnight on the first of `t`'s month.
Parameters: `t` `number` required; `zone` `string` default `chart.timezone`.
Returns `number`.

```
monthlyVwap = vwapAnchor(hlc3, date.startOfMonth(time) != date.startOfMonth(time[1]))
```

### `date.isSameDay(a, b, zone = chart.timezone)`

Whether two timestamps fall on one calendar day.
Parameters: `a` `number` required; `b` `number` required; `zone` `string`
default `chart.timezone`.
Returns `bool`.

```
sameDay = date.isSameDay(time, time[1])
```

Prefer `date.isSameDay(time, time[1])` over comparing day numbers. Two bars a
month apart can both fall on the 12th, and a script that compares only the day
of the month will happily call them the same day.

### `date.add(t, unit, count, zone = chart.timezone)` (planned)

Calendar arithmetic that respects month lengths and daylight saving.
Parameters: `t` `number` required; `unit` `string` required; `count` `number`
required; `zone` `string` default `chart.timezone`.
Returns `number`.

```
nextMonth = date.add(time, "month", 1)
```

Adding thirty days to a timestamp is arithmetic anyone can write, and it is
wrong across a month boundary and wrong again on the two days a year the clocks
move. That is why the calendar-aware form is a named function rather than a note
telling you to multiply.

---

## 3. Rendering a timestamp

### `date.format(t, pattern, zone = chart.timezone)`

Render a timestamp as text.
Parameters: `t` `number` required; `pattern` `string` required; `zone` `string`
default `chart.timezone`.
Returns `string`.

```
cell(panel, 0, 1, date.format(time, "yyyy-MM-dd HH:mm"))
```

The pattern accepts these placeholders and copies every other character through
unchanged. The set is small and closed so that two engines cannot differ on what
a pattern means.

| Placeholder | Renders |
|---|---|
| `yyyy` | Four digit year |
| `MM` | Two digit month |
| `dd` | Two digit day |
| `HH` | Two digit hour, 24 hour clock |
| `mm` | Two digit minute |
| `ss` | Two digit second |
| `MMM` | Three letter month |
| `EEE` | Three letter weekday |

Month and weekday abbreviations are English and invariant, for the same
determinism reason that `str.upper` is not locale aware: a script whose output
changed with the machine's configuration could not be compared against itself.

| Pattern | Renders as |
|---|---|
| `"yyyy-MM-dd"` | `2025-03-14` |
| `"dd MMM yyyy"` | `14 Mar 2025` |
| `"EEE HH:mm"` | `Fri 09:15` |
| `"HH:mm:ss"` | `09:15:00` |

---

## 4. The `session` namespace

The session is the instrument's trading session as the host defines it, not a
window the script invents. Everything here is a per-bar fact.

| Call | Returns | Warmup | For |
|---|---|---|---|
| `session.isOpen` (planned) | `series bool` | bar 0 | This bar falls inside the instrument's trading session |
| `session.isFirstBar` | `series bool` | bar 0 | This is the session's first bar |
| `session.isLastBar` | `series bool` | bar 0 | This is the session's last bar |
| `session.startTime` (planned) | `series number` | the session's first bar | When this bar's session opened |
| `session.endTime` (planned) | `series number` | the session's first bar | When this bar's session is scheduled to close |
| `session.barIndex` (planned) | `series number` | bar 0 | This bar's position within its session, first is 0 |
| `session.isIn(spec, zone = chart.timezone)` | `series bool` | bar 0 | Whether the bar falls in a window you name |
| `session.isHoliday(t)` (planned) | `bool` | n/a | Whether a date is a trading holiday, once a calendar is supplied |
| `session.nextOpen` (planned) | `series number` | bar 0 | When the next session opens |

```
if session.isFirstBar
    openPrice = open

remaining = (session.endTime - time) / 60000
```

`session.isLastBar` is knowable only because the host states the session's
scheduled close, so it is true on the last bar of the schedule even if trading
stopped early that day. A strategy that must be flat by the close acts on this
rather than waiting for a new bar to appear, which arrives after the close and
is therefore too late to be useful.

### `session.isIn(spec, zone = chart.timezone)`

Whether the bar falls inside a stated window.
Parameters: `spec` `string` required; `zone` `string` default `chart.timezone`.
Returns `series bool`. Warmup: bar 0.

```
if session.isIn("0915-1530")
    background(fade(navy, 96))
```

The spec is `"HHMM-HHMM"` with an optional day list after a colon: `"0915-1530"`
or `"0915-1530:12345"`. Days are 1 for Monday through 7 for Sunday, matching
`date.dayOfWeek`. A window whose end is before its start crosses midnight and is
read that way, which is what an overnight session needs. A malformed spec is an
argument error (OS3008) at compile time when it is a literal, so a typo is
caught before the script ever runs rather than quietly matching nothing.

| Spec | Means |
|---|---|
| `"0915-1530"` | Every day, from 09:15 to 15:30 in the chart's zone |
| `"0915-1530:12345"` | The same window, Monday to Friday only |
| `"2300-0500"` | An overnight window that crosses midnight |
| `"0915-0915"` | An empty window, not a full day |

---

## 5. Three worked examples

### Trading only inside a window

```
version 1
study("Session filter", overlay = true)

window = input("0915-1500", "Trading window")
zone   = input("Asia/Kolkata", "Zone")

inWindow = session.isIn(window, zone)

fast = ema(close, 9)
slow = ema(close, 21)

// The cross is computed on every bar, not inside the if. A stateful call that
// runs only on some bars advances only on those bars, and its value is absent
// on the others.
crossed = crossUp(fast, slow)

if inWindow and crossed
    signal("BUY")

background(inWindow ? none : fade(gray, 94))
```

Shading the bars outside the window rather than the ones inside it is
deliberate: the eye should be drawn to what the script is acting on, and the
greyed bars then read as what they are, the part of the chart being ignored.

### A weekly clock, drawn where the week turns

```
version 1
study("Week markers", overlay = true)

newWeek = date.weekOfYear(time) != date.weekOfYear(time[1])

// time[1] is absent on bar 0, so the comparison is absent, so the condition
// takes the false branch. The first bar of the dataset is not marked, which is
// correct: nothing is known about the week before it.
if newWeek
    draw.line(time, low, time, high, color = fade(silver, 60), style = "dotted",
              extendLeft = true, extendRight = true)
    draw.label(time, high, date.format(time, "EEE dd MMM"),
               color = none, textColor = silver)
```

### Minutes since the open, on any intraday interval

```
version 1
study("Minutes since open", precision = 0)

elapsed = (time - session.startTime) / 60000

plot(elapsed, "Minutes", aqua, style = "step")

// Absent before the session's first bar of the dataset is seen, which is why
// the comparison is guarded rather than trusted.
if not isNone(elapsed) and elapsed >= 30 and elapsed < 35
    signal("SETTLED")
```

Working in milliseconds and dividing is more robust than comparing calendar
fields, because a window measured in minutes since the open is the same rule on
a one minute chart and a fifteen minute chart, while an hour and minute test has
to be rewritten for each interval.

## See also

- [series.md](./series.md) for `time`, `bar.index` and the `chart` facts these functions read
- [string.md](./string.md) for building the text `date.format` goes into
- [input.md](./input.md) for the time input, which returns a timestamp a script can compare against `time`
- [drawing.md](./drawing.md) for anchoring a drawing to a time rather than to a bar index
- [strategy.md](./strategy.md) for flattening at the session close
- [../../../spec/stdlib.md](../../../spec/stdlib.md) for the specification these entries are derived from
