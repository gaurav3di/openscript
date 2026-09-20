# Built-in variables

By the end of this page you will know every name a script can read without
declaring it first, what type each one has, and whether it is a series that
changes bar by bar or a single value fixed for the whole run.

This is a dictionary. It is meant to be searched, not read from the top. Every
entry gives the name, its type, whether it is a series, what it means, and one
line of code that uses it.

## How to read an entry

| Column | Holds |
|---|---|
| Name | The name exactly as a script writes it |
| Type | The type from the type list in the language specification |
| Series | Yes when the name holds one value per bar and accepts `[n]`, No when it is a single value fixed for the run |
| Means | What the value is |

A **series** name carries history. `close[1]` is the previous bar's close, and
`close[0]` is the same as `close`. A **single value** has no history, because it
never changed: asking `chart.symbol[1]` is asking what the instrument was called
one bar ago, which is not a question the data can answer, so the type system does
not let you ask it.

Two rules apply to every name on this page, and they are worth knowing before the
tables start.

**You may read them and you may not assign to them.** Every built-in lives in the
global scope, so `close = 5` is not an assignment but an attempt to declare a
second `close` in an inner scope, which is OS2002. The compiler names the built-in
and suggests another name. The reason is the same reason shadowing is banned
everywhere in the language: the most expensive bug in a per-bar script is a value
that is right in one place and stale in another, and two names spelled the same
way is the shortest route to it.

**Absent is a real answer.** Several names below are absent (`none`) rather than
zero in states where zero would be a lie. `volume` is absent on an instrument the
host reports no volume for, `chart.tickSize` is absent when the host has not said
what a tick is, and `pos.avgPrice` is absent while the strategy is flat. Test with
`isNone(x)` or supply a fallback with `orElse(x, fallback)`.

---

## Bar data

The prices and quantities of the bar being executed. Every one of these is a
`series number` with history, and every one of them produces a value on bar 0.

| Name | Type | Series | Means |
|---|---|---|---|
| `open` | `series number` | Yes | The bar's opening price |
| `high` | `series number` | Yes | The bar's highest traded price |
| `low` | `series number` | Yes | The bar's lowest traded price |
| `close` | `series number` | Yes | The bar's closing price, and the last traded price on a bar still forming |
| `volume` | `series number` | Yes | Quantity traded in the bar, absent where the host supplies none |
| `oi` | `series number` | Yes | Contracts outstanding at the end of the bar, absent where the host supplies none |
| `time` | `series number` | Yes | The instant the bar opened, UTC milliseconds |
| `timeClose` | `series number` | Yes | The instant the bar's interval ends. Planned, not in the first release |

```
plot(close - open, "Body", aqua)
```

### Derived prices

Four combinations of the four prices, provided because a script reaches for them
constantly and writing the arithmetic out every time invites a typo that nothing
catches.

| Name | Type | Series | Means |
|---|---|---|---|
| `hl2` | `series number` | Yes | `(high + low) / 2`, the bar's midpoint |
| `hlc3` | `series number` | Yes | `(high + low + close) / 3`, the typical price |
| `ohlc4` | `series number` | Yes | `(open + high + low + close) / 4`, the average price |
| `hlcc4` | `series number` | Yes | `(high + low + close + close) / 4`, the close-weighted average |

```
plot(ema(hlc3, 21), "Typical price mean", orange)
```

### Two notes that catch people

**`volume` is absent, not zero, when there is no volume for the instrument.** Zero
is a real reading that means nobody traded in that bar, and an index that never
reports volume at all is a different fact. Conflating them would make a volume
study draw a confident flat line on an instrument it cannot measure. Branch on
`chart.hasVolume`, not on the value.

**`close` is the one name with two roles.** Read bare it is the price. Written as
a call, `close()` is the order function that flattens a strategy's position. The
compiler tells them apart by syntax, which is unambiguous, and both spellings are
the ones a trader expects. The cost, stated so it is not discovered later, is that
`close` cannot be handed anywhere a function is expected, which costs nothing in
version 1 because there are no function values. In a `study()` file, `close(...)`
is OS7001.

---

## Bar state: the `bar` namespace

Facts about the execution itself rather than about the price. All are series and
all produce a value on bar 0.

| Name | Type | Series | Means |
|---|---|---|---|
| `bar.index` | `series number` | Yes | Position of this bar in the dataset, oldest is 0 |
| `bar.count` | `series number` | Yes | `bar.index + 1`, bars seen so far |
| `bar.isFirst` | `series bool` | Yes | This is the oldest bar supplied |
| `bar.isLast` | `series bool` | Yes | This is the newest bar supplied |
| `bar.isConfirmed` | `series bool` | Yes | This bar's interval has elapsed and it will not change again |
| `bar.isRealtime` | `series bool` | Yes | A live feed is driving updates, rather than a one-off history load |
| `bar.isNew` | `series bool` | Yes | The last update appended a bar rather than replacing one |
| `bar.updates` | `series number` | Yes | How many times this bar has been executed |

```
if bar.isConfirmed and crossUp(fast, slow)
    signal("BUY")
```

`bar.index` is a position in the data the engine was handed, not a permanent
address. Loading more history shifts every index by the number of bars added, so a
script that stores an index and compares it after more bars arrive is comparing
against something that moved underneath it. Store `time` instead, which does not
move.

`bar.isLast` is the flag a panel uses: a table shows one state, the current one, so
writing its cells on all fifty thousand bars costs fifty thousand writes to display
the last one.

`bar.updates` counts executions of the bar, not ticks in the market, and it is
mostly there for diagnosis. Counting with it needs `live var`, because a plain
`var` rolls back before each re-execution of the newest bar.

```
version 1

study("What the engine knows")

plot(bar.index, "Bar index", aqua)
plot(bar.count, "Bars so far", orange)
plot(bar.updates, "Executions of this bar", silver)
```

---

## Chart and instrument facts: the `chart` namespace

Everything the host knows about the instrument and the chart it is drawn on. Every
entry here is a **single value**, fixed for the whole run, so none of it accepts
`[n]`. `chart.now()` is the one call in the group.

| Name | Type | Series | Means |
|---|---|---|---|
| `chart.symbol` | `string` | No | The instrument's symbol, or `""` when the host names none |
| `chart.exchange` | `string` | No | The exchange the instrument trades on |
| `chart.interval` | `string` | No | The chart's interval in canonical form, such as `"5m"` or `"1D"` |
| `chart.intervalMinutes` | `number` | No | The interval in minutes, absent for a non-time interval |
| `chart.isIntraday` | `bool` | No | The interval is shorter than one day |
| `chart.timezone` | `string` | No | The chart's zone as an IANA name, the calendar its axis is labelled in |
| `chart.tickSize` | `number` | No | The instrument's smallest price increment, absent when the host has not said |
| `chart.lotSize` | `number` | No | Units in one lot, absent when the host has not said |
| `chart.pointValue` | `number` | No | Money per one point of price per unit, absent when unknown |
| `chart.currency` | `string` | No | Currency label for money in a report |
| `chart.instrumentType` | `string` | No | One of `"equity"`, `"future"`, `"option"`, `"index"`, `"currency"`, `"commodity"` or `"other"` |
| `chart.hasVolume` | `bool` | No | The host supplies volume for this instrument |
| `chart.now()` | `number` | No | The chart's wall clock, UTC milliseconds |
| `chart.isReplay` | `bool` | No | The bars are being replayed rather than loaded whole. Planned |
| `chart.expiry` | `number` | No | Expiry instant of a derivative instrument. Planned |
| `chart.strike` | `number` | No | Strike price of an option instrument. Planned |
| `chart.optionType` | `string` | No | `"call"`, `"put"` or `""`. Planned |

```
stopDistance = orElse(chart.tickSize, 0) * 10
```

`chart.tickSize` is absent rather than a guessed small number when the host has not
supplied it, because a script sizing a stop in ticks has to be able to tell "the
smallest increment is one paisa" from "nobody said". Anything derived from an
absent tick size is absent too, which is why `roundToTick(price)` returns `none` in
that state rather than handing back an unrounded price that looks rounded.

`chart.now()` is the only reading of a clock available while a bar runs. It is a
call rather than a value because it is the one thing in the language that is not
fixed for the run, and the conformance suite fixes what it returns, so a script
that uses it is still reproducible.

```
version 1

study("Instrument facts", overlay = true)

panel = table("Facts", 4, 2, position = "topRight")

if bar.isLast
    cell(panel, 0, 0, "Symbol")
    cell(panel, 0, 1, chart.symbol)
    cell(panel, 1, 0, "Interval")
    cell(panel, 1, 1, chart.interval)
    cell(panel, 2, 0, "Tick size")
    cell(panel, 2, 1, isNone(chart.tickSize) ? "not supplied" : text(chart.tickSize, 4))
    cell(panel, 3, 0, "Volume")
    cell(panel, 3, 1, chart.hasVolume ? "supplied" : "not supplied")
```

---

## Session facts: the `session` namespace

The instrument's trading session as the host defines it, not a window the script
invents. Everything here is a per-bar fact, so everything here is a series.

| Name | Type | Series | Means |
|---|---|---|---|
| `session.isOpen` (planned) | `series bool` | Yes | This bar falls inside the instrument's trading session |
| `session.isFirstBar` | `series bool` | Yes | This is the session's first bar |
| `session.isLastBar` | `series bool` | Yes | This is the session's last bar |
| `session.startTime` (planned) | `series number` | Yes | When this bar's session opened, absent before the session's first bar |
| `session.endTime` (planned) | `series number` | Yes | When this bar's session is scheduled to close |
| `session.barIndex` (planned) | `series number` | Yes | This bar's position within its session, first is 0 |
| `session.nextOpen` | `series number` | Yes | When the next session opens. Planned |

`session.isIn(spec, zone)` and `session.isHoliday(t)` are functions rather than
readable names and belong to the library reference, not here.

`session.isLastBar` is known because the host states the session's scheduled close,
so it is true on the last scheduled bar even when trading stopped early. A strategy
that must be flat by the close acts on this rather than waiting for a new bar to
appear, which arrives too late to do anything about.

```
version 1

study("Session shape", overlay = true)

var sessionOpen = none
if session.isFirstBar
    sessionOpen = open

plot(sessionOpen, "Session open", aqua)
background(session.isOpen ? none : fade(gray, 90))
```

The session's own open price has to be held in a `var`, because a plain assignment
inside the `if` would be a name local to that block and invisible on the line that
plots it.

---

## Position and strategy state: the `pos` namespace

Available only in a `strategy()` file. Reading one from a `study()` file is
OS7001. Every entry is a per-bar fact and reflects **fills, not intentions**: an
order placed on this bar and filled at the next bar's open changes none of these
until that fill happens.

| Name | Type | Series | Means |
|---|---|---|---|
| `pos.size` | `series number` | Yes | Net position in units, positive long and negative short, `0` when flat |
| `pos.isLong` | `series bool` | Yes | `pos.size > 0` |
| `pos.isShort` | `series bool` | Yes | `pos.size < 0` |
| `pos.isFlat` | `series bool` | Yes | `pos.size == 0` |
| `pos.avgPrice` | `series number` | Yes | Average price of the open position, absent while flat |
| `pos.entryTime` (planned) | `series number` | Yes | When the current position was opened, absent while flat |
| `pos.barsHeld` (planned) | `series number` | Yes | Bars since it was opened, `0` on the entry bar, absent while flat |
| `pos.entries` (planned) | `series number` | Yes | How many entries make up the current position |
| `pos.openProfit` (planned) | `series number` | Yes | Unrealised profit in money at this bar's close, absent while flat |
| `pos.openProfitPercent` (planned) | `series number` | Yes | The same as a percentage of the position's cost, absent while flat |
| `pos.maxProfit` (planned) | `series number` | Yes | Best unrealised profit this position has seen, absent while flat |
| `pos.maxLoss` (planned) | `series number` | Yes | Worst unrealised loss this position has seen, absent while flat |
| `pos.equity` (planned) | `series number` | Yes | Starting capital plus realised and unrealised profit |
| `pos.netProfit` (planned) | `series number` | Yes | Realised profit since the run began |
| `pos.tradeCount` (planned) | `series number` | Yes | Closed trades so far |
| `pos.winRate` | `series number` | Yes | Share of closed trades that made money. Planned |
| `pos.profitFactor` | `series number` | Yes | Gross profit over gross loss. Planned |
| `pos.maxDrawdown` | `series number` | Yes | Largest peak to trough fall in equity so far. Planned |

```
if pos.isLong and pos.barsHeld >= 20
    close()
```

The split between `0` and absent in this group is deliberate and worth memorising.
**`pos.size` is `0` while flat**, because zero is the true size and a script adding
it to something should get the right answer. **`pos.avgPrice` is absent while
flat**, because zero is a price, and a script comparing `close > pos.avgPrice`
against a zero would take a branch that looks correct and is not.

`pos.openProfit` is marked to this bar's close. Marking to anything else, a bid or
an ask, is not expressible in version 1.

### One readable name in the `order` namespace

| Name | Type | Series | Means |
|---|---|---|---|
| `order.pending` (planned) | `series number` | Yes | How many orders this strategy has live and unfilled |

`order.working(tag)` answers the same question for one tag, and is a function.

```
version 1

strategy("Hold for twenty bars")

if pos.isFlat and crossUp(close, sma(close, 50))
    buy(qty = 1)

if pos.isLong and pos.barsHeld >= 20
    close()

plot(pos.size, "Position", silver)
plot(pos.equity, "Equity", lime)
```

---

## Time

There is no separate time type in version 1. Every instant in the language is a
`number` holding milliseconds since the Unix epoch, in UTC. The names that carry
one are gathered here because a reader looking for "the time" will look for a
group rather than for a type.

| Name | Type | Series | Means |
|---|---|---|---|
| `time` | `series number` | Yes | When this bar opened |
| `timeClose` | `series number` | Yes | When this bar's interval ends. Planned |
| `session.startTime` (planned) | `series number` | Yes | When this bar's session opened |
| `session.endTime` (planned) | `series number` | Yes | When this bar's session is scheduled to close |
| `pos.entryTime` (planned) | `series number` | Yes | When the open position was entered |
| `chart.now()` | `number` | No | The chart's wall clock, as a call |

A timestamp is a UTC instant, but the calendar fields read out of it are not. Every
function in the `date` namespace reads a timestamp **in the chart's timezone**
unless a `zone` argument names another one, because a session study that disagreed
with the labels on the chart's own axis would be wrong in the way that is hardest
to see.

```
version 1

study("Time fields", overlay = true)

// or short-circuits, so date.isSameDay is never handed the absent time[1] on bar 0
newDay = bar.isFirst or not date.isSameDay(time, time[1])

background(newDay ? fade(aqua, 92) : none)
plot(date.hour(time), "Hour of the bar", orange)
```

---

## Names that look like variables and are not

| Name | What it actually is |
|---|---|
| `aqua`, `red`, `silver` and the other sixteen colours | Ordinary globals of type `color`, catalogued in [constants.md](./constants.md) |
| `math.pi`, `math.e` | Numeric constants, also in [constants.md](./constants.md) |
| `true`, `false`, `none` | Literals, and reserved words: see [keywords.md](./keywords.md) |
| `ema`, `plot`, `buy` | Library functions, catalogued in the standard library specification |
| `chart.now()`, `draw.count()`, `order.working(tag)` | Calls, not readable values |

A name a script declares with `input()` is not a built-in either. It is an ordinary
file-scope name whose value the settings dialog supplies before bar 0, and it has
history like any other top-level name.

---

## Built-in names inside a higher timeframe read

Inside the `expr` argument of `req.timeframe(...)` or `req.symbol(...)`, the bar
data names of this page mean **the requested instrument's bars at the requested
interval**, not the chart's. That is the whole point of the read.

```
dailyHigh = req.timeframe("1D", high)
dailyRsi  = req.timeframe("1D", rsi(close, 14))
```

A name from the file scope may be read inside `expr` only when it is a
compile-time constant: a literal, arithmetic over literals, or an `input()`.
Reading a per-bar name from the enclosing script is OS6003, because a value
computed on this chart's bars has no counterpart on the requested bars and there is
no honest answer for what it would mean there.

---

## Alphabetical index

Every readable built-in name in version 1, including the planned ones.

| Name | Group |
|---|---|
| `bar.count` | Bar state |
| `bar.index` | Bar state |
| `bar.isConfirmed` | Bar state |
| `bar.isFirst` | Bar state |
| `bar.isLast` | Bar state |
| `bar.isNew` | Bar state |
| `bar.isRealtime` | Bar state |
| `bar.updates` | Bar state |
| `chart.currency` | Chart facts |
| `chart.exchange` | Chart facts |
| `chart.expiry` | Chart facts, planned |
| `chart.hasVolume` | Chart facts |
| `chart.instrumentType` | Chart facts |
| `chart.interval` | Chart facts |
| `chart.intervalMinutes` | Chart facts |
| `chart.isIntraday` | Chart facts |
| `chart.isReplay` | Chart facts, planned |
| `chart.lotSize` | Chart facts |
| `chart.now()` | Chart facts, a call |
| `chart.optionType` | Chart facts, planned |
| `chart.pointValue` | Chart facts |
| `chart.strike` | Chart facts, planned |
| `chart.symbol` | Chart facts |
| `chart.tickSize` | Chart facts |
| `chart.timezone` | Chart facts |
| `close` | Bar data |
| `high` | Bar data |
| `hl2` | Derived price |
| `hlc3` | Derived price |
| `hlcc4` | Derived price |
| `low` | Bar data |
| `ohlc4` | Derived price |
| `open` | Bar data |
| `order.pending` (planned) | Strategy state |
| `pos.avgPrice` | Position state |
| `pos.barsHeld` (planned) | Position state |
| `pos.entries` (planned) | Position state |
| `pos.entryTime` (planned) | Position state |
| `pos.equity` (planned) | Strategy state |
| `pos.isFlat` | Position state |
| `pos.isLong` | Position state |
| `pos.isShort` | Position state |
| `pos.maxDrawdown` | Strategy state, planned |
| `pos.maxLoss` (planned) | Position state |
| `pos.maxProfit` (planned) | Position state |
| `pos.netProfit` (planned) | Strategy state |
| `pos.openProfit` (planned) | Position state |
| `pos.openProfitPercent` (planned) | Position state |
| `pos.profitFactor` | Strategy state, planned |
| `pos.size` | Position state |
| `pos.tradeCount` (planned) | Strategy state |
| `pos.winRate` | Strategy state, planned |
| `session.barIndex` (planned) | Session facts |
| `session.endTime` (planned) | Session facts |
| `session.isFirstBar` | Session facts |
| `session.isLastBar` | Session facts |
| `session.isOpen` (planned) | Session facts |
| `session.nextOpen` | Session facts, planned |
| `session.startTime` (planned) | Session facts |
| `time` | Bar data |
| `timeClose` | Bar data, planned |
| `volume` | Bar data |

---

## Where the specification is silent

Written down rather than guessed at, so that nobody plans around an answer that
does not exist yet.

- **The exact warmup of `session.startTime` and `session.endTime` before the
  session's first bar.** The library specification says they are available from
  the session's first bar, which leaves what a script reads on a bar before any
  session has opened. Treat it as absent and test with `isNone`.
- **Whether `chart.intervalMinutes` is absent or something else for a non-time
  interval.** The specification says absent for a non-time interval and does not
  enumerate what a non-time interval is in version 1.
- **The channel values of the named colours.** They are fixed in the library
  manifest and in the conformance suite, not in the specification text, so this
  page cannot list them.

---

## See also

- [constants.md](./constants.md) for the named colours, the maths constants and every closed vocabulary of string values
- [keywords.md](./keywords.md) for the reserved words a name may not be
- [operators.md](./operators.md) for `[n]`, `.` and the rest of the expression forms
- [../README.md](../README.md) for the documentation index
- [../../spec/language.md](../../spec/language.md) for the rules these names obey
- [../../spec/stdlib.md](../../spec/stdlib.md) for the functions that read them
