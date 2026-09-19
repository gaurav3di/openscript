# Scheduling

By the end of this page you will be able to run many strategies at once on start
and stop times that follow the exchange's own calendar, know what happens to an
open position when one of them stops, and bring a strategy back after a restart
without guessing what it was holding.

## One process per strategy

Each running strategy gets its own process. It has its own memory, its own log
file, its own resource limits and its own pinned script revision.

The cost is a little memory per strategy. What it buys is containment: a script
that exhausts its loop budget with OS5001, or takes too long on a bar with
OS5007, or fails a data request with OS6009, takes down one strategy and not the
desk. It also means the answer to "which script placed that order" is never
ambiguous, because processes and scripts are one to one.

Each process pins the revision it started with. Editing the script does not
change a strategy that is already running and holding a position. The next start
picks up the newer revision, which means a deploy is a stop and a start, and
that is deliberate: a strategy that changed its rules halfway through a trade
would be managing an entry that a different set of rules took.

## Three clocks, and which decision belongs to which

Three separate things decide when a strategy acts, and most scheduling problems
are one of them doing another one's job.

| Clock | Belongs to | Decides |
|---|---|---|
| The exchange session | The instrument | When bars exist and when an order can be worked |
| The schedule | The host | When the process is alive |
| The script's own timing | Your file | When, inside a live session, the rules may act |

The rule of thumb: the schedule decides whether the strategy is running, and the
script decides what it does while it is. Anything that is part of the strategy
belongs in the file, where it is version controlled, reviewed and backtested.
Anything that is about the process belongs in the schedule.

Two worked cases make the split concrete.

**"Do not trade in the first fifteen minutes."** That is a rule of the strategy.
It goes in the file, measured from `session.startTime` or from a `var` anchored
on `session.isFirstBar`, so that a backtest sees exactly the same rule.

**"Start the process at 09:00."** That is about the process, not the strategy.
It goes in the schedule, and the script neither knows nor cares.

If you put a strategy rule in the schedule, your backtest stops describing your
strategy, because the backtest runs the file and the schedule is not in it.

## Start and stop times

### Start early enough to be warm

A process that starts at the opening bell starts with no history, and a strategy
with no history has no values. Every windowed function is absent until its
window exists, absence propagates into the comparison and the absent condition
takes the false branch, so the strategy quietly does nothing until it is warm.
Nothing breaks. It simply does not trade, and you find out at lunchtime.

So the start time is a function of the file's warmup, not of the opening bell.
Work out the warmup exactly as for a backtest: take the longest chain of library
warmups and lookbacks in the entry condition, add any state that has to rebuild,
and convert it to bars at the interval you are running.

| File needs | On a 5 minute interval | Start the process |
|---|---|---|
| 200 bar average | 200 bars, about 17 hours of session | The previous day, or preload history |
| 20 bar breakout | 20 bars, 100 minutes | Well before the open, with preload |
| Session-anchored range | The session's own first bars | At or before the open |

Preloading history is what makes an on-time start work: the host hands the
process the bars before the first live one, the engine runs them exactly as a
backtest would, and the first live bar arrives with everything warm. Where the
host cannot preload enough, start the process earlier and accept that the first
part of the session is warmup.

A useful habit is to make the script say when it became warm, with a `print` on
the first bar where every value the entry reads is present. Then the log answers
the question instead of you inferring it from the absence of trades.

### Stop late enough to be flat

A stop time that arrives while a position is open does not close the position.
It stops the script. The position stays where it is, at the broker, with nothing
managing it.

So a stop time has to sit after the strategy's own last action, with room to
spare. Two settings do most of the work: `closeOnSessionEnd = true` in the
declaration, which flattens at the session close, and an explicit flat-by time
in the script.

```
version 1

strategy("Flat before the stop", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots",
         product = "intraday", closeOnSessionEnd = true,
         fillOn = "nextOpen", slippage = 1,
         commissionType = "perTrade", commission = 20)

flatBefore = input(15, "Be flat this many minutes before the close", min = 1, max = 120)

fast = ema(close, 9)
slow = ema(close, 21)

// session.endTime is the scheduled close the host states, so this is right on a
// short trading day too, where counting bars or minutes from the open is not.
toClose = isNone(session.endTime) ? none : session.endTime - time
closing = not isNone(toClose) and toClose <= flatBefore * 60000

if not closing and crossUp(fast, slow) and session.isOpen and pos.isFlat
    buy()

if pos.isLong and (crossDown(fast, slow) or closing)
    close()

plot(fast, "Fast", aqua, width = 2)
plot(slow, "Slow", orange, width = 2)
background(closing ? fade(silver, 92) : none)
```

The order of operations on a normal day is then: the script flattens, the
session closes, the schedule stops the process. Each step has room before the
next.

## The trading day

### Holidays and short days

The exchange calendar, not the weekday, decides whether there is a trading day.
A schedule that fires on weekdays will start a process on every holiday, where
it will sit with no bars, log nothing useful and stop again. That is harmless
and it is also noise that hides real failures, so bind the schedule to the
exchange's calendar rather than to a weekday rule.

Short days are the case that catches strategies rather than schedules. A session
that closes early makes every bar count wrong and every "minutes since the open"
calculation right. That is the argument for `session.endTime` and
`session.isLastBar` over arithmetic on the open: the host states the scheduled
close, so a script that reads it is correct on a short day without knowing that
the day was short.

`session.isLastBar` is true on the last bar of the schedule even if trading
stopped early, because it is derived from the stated close rather than from the
appearance of a new bar. A strategy that must be flat by the close acts on that,
not on the arrival of a bar that will never come.

Expiry days deserve their own note. An instrument that expires stops existing,
and a strategy holding it through settlement is holding whatever the exchange
settles it into. Put the expiry rule in the script, as a date test or as a
flat-by time on the expiry day, and do not rely on the schedule to protect a
position from a calendar event.

### Sessions that cross midnight

A session is what the exchange opens, and a calendar day is not the same thing.
An evening session that runs past midnight is one session and two dates. This is
why the `session` namespace exists and why state resets on `session.isFirstBar`
rather than on a change of date: a date test would split one session in half at
midnight, and nothing about the market changed at midnight.

For a window inside a session, `session.isIn("HHMM-HHMM")` reads a window whose
end is before its start as crossing midnight, which is what an overnight session
needs.

### Time zones

Every calendar function reads a timestamp in the chart's timezone unless a zone
argument names another, and a zone is always an IANA name, never a fixed offset.
A fixed offset is silently wrong for half the year anywhere that observes
daylight saving, and an unknown zone name is OS6005 rather than a quiet default.

The practical rule: schedule in the exchange's zone, write the script's own
timing in elapsed milliseconds from a session anchor where you can, and use
calendar functions where you must. Elapsed time from the session open says the
same thing in every timezone and needs no calendar at all.

## What happens to an open position when a strategy stops

### Three ways a strategy stops

| How it stops | What the process does | What the position does |
|---|---|---|
| The schedule's stop time | Exits cleanly | Stays open, unmanaged |
| An operator stops it | Exits cleanly | Stays open, unmanaged |
| It crashes, or the machine restarts | Exits uncleanly | Stays open, unmanaged |

The middle column differs and the right-hand column does not. **Stopping a
strategy stops the script, not the position.**

The engine does not flatten for you, and that is the right decision even though
it is the uncomfortable one. A stop that flattened would mean that restarting a
strategy for any reason, a deploy, a machine reboot, a configuration change,
would send market orders. Some of those restarts happen at the worst possible
moment, and an automatic flatten would turn every operational event into a
trading decision taken by nobody.

So the flattening belongs where a decision belongs: in the script, or in your
hands.

### Making the stop safe from inside the script

Three lines of defence, in the order they should fire:

1. A time exit in the script, comfortably before the scheduled stop, as in the
   example above.
2. `closeOnSessionEnd = true` in the declaration, so an intraday position cannot
   survive the session even if the time exit did not fire.
3. A resting stop order at the broker, placed with `exit(stop = ...)` when the
   position is opened, so there is protection that does not depend on your
   process being alive at all.

The third one is the only protection that survives a crash, which is why an
intraday strategy with a real stop level should send it rather than simulate it
by watching price bar by bar.

## Restart and recovery

### What survives and what does not

| Thing | Survives a restart |
|---|---|
| The position at the broker | Yes |
| Working orders at the broker | Yes, until they fill, expire or are cancelled |
| The script's `var` state | No |
| `pos.size` and the rest of the `pos` namespace | No, the new process starts flat |
| Drawing objects | No |
| The pinned revision | It is re-pinned at the next start |
| The log file | Yes, it is appended to |

A restarted strategy is a new process with no memory, running a file that starts
flat. If it was holding a position when it stopped, the broker still is and the
script no longer knows.

### Rebuildable state is the design rule

The way to make a strategy restart-friendly is to make its memory rebuildable
from bars. State that is recomputed from the session's own bars comes back
identically when a process restarts with those bars preloaded. State that
records something the script did cannot be rebuilt at all.

```
version 1

strategy("Rebuildable state", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots",
         product = "intraday", closeOnSessionEnd = true,
         fillOn = "nextOpen", slippage = 1,
         commissionType = "perTrade", commission = 20)

rangeMinutes = input(15,  "Opening range, in minutes", min = 1, max = 240)
windowMins   = input(120, "Entries allowed for this long after the open", min = 5, max = 390)

var openTime  = none
var rangeHigh = none
var rangeLow  = none
var traded    = false

// Everything below this line except traded is rebuilt from the session's own
// bars, so a process that restarts at 10:30 with the morning preloaded reaches
// the same state as one that has been running since the open.
if session.isFirstBar
    openTime  = time
    rangeHigh = high
    rangeLow  = low
    traded    = false

elapsed = isNone(openTime) ? none : time - openTime
forming = not isNone(elapsed) and elapsed < rangeMinutes * 60000

if forming and not session.isFirstBar
    rangeHigh = max(rangeHigh, high)
    rangeLow  = min(rangeLow, low)

// traded is the one thing bars cannot rebuild: a process that restarts after
// the entry comes back with it false. The window bounds the damage, because a
// restart after it cannot enter at all, whatever traded says.
inWindow = not isNone(elapsed) and elapsed < windowMins * 60000
ready    = not forming and inWindow and not traded and pos.isFlat

if ready and not isNone(rangeHigh) and close > rangeHigh
    traded = true
    buy()
    exit(stop = rangeLow)

plot(rangeHigh, "Range high", aqua,   width = 2, style = "step")
plot(rangeLow,  "Range low",  orange, width = 2, style = "step")
background(forming ? fade(silver, 92) : none)
```

The comment on `traded` is the honest part. Every strategy has at least one
piece of state like it, and the design question is not how to preserve it but
how to make its loss harmless: a bounded entry window, a once-per-session cap
expressed as a position check, or an entry condition that cannot be true twice.

### The reconciliation step

After any restart during a session, and before letting the strategy trade again:

1. Read the broker's position for the instrument.
2. Read the strategy's own `pos.size`, which will be zero.
3. If they disagree, decide who owns the position. Either flatten it by hand, or
   take it over by hand and leave the strategy flat.
4. Cancel any working orders the stopped process left behind, unless you are
   deliberately keeping a resting stop.
5. Only then let the strategy trade.

Skipping this step is how an account ends up with two positions in the same
instrument, one of which nothing is managing.

## Logs

Each running strategy writes its own log. `print(value)` writes one line, with
the bar's time attached, and the host rate limits it rather than the language;
a host that has to drop lines says how many it dropped rather than truncating
silently.

Log decisions, not values. A line per bar is a file nobody reads. A line per
decision is a file that answers "why did it do that" six weeks later.

```
version 1

strategy("Logged decisions", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots",
         product = "intraday", closeOnSessionEnd = true,
         fillOn = "nextOpen", slippage = 1,
         commissionType = "perTrade", commission = 20)

fast = ema(close, 9)
slow = ema(close, 21)

fn stamp() => date.format(time, "yyyy-MM-dd HH:mm")

if session.isFirstBar
    print(stamp() + " SESSION " + chart.symbol + " " + chart.interval)

// One line per decision, with the values the decision was made on. A reader six
// weeks from now needs the inputs to the choice, not the choice alone.
if crossUp(fast, slow) and session.isOpen and pos.isFlat
    print(stamp() + " ENTER long fast=" + text(fast, 2) + " slow=" + text(slow, 2))
    buy()

if pos.isLong and crossDown(fast, slow)
    print(stamp() + " EXIT long held=" + text(pos.barsHeld) +
          " profit=" + text(orElse(pos.openProfit, 0), 0))
    close()

plot(fast, "Fast", aqua, width = 2)
plot(slow, "Slow", orange, width = 2)
```

What earns a line:

| Log | Do not log |
|---|---|
| Every entry, with the values behind it | Every bar's indicator values |
| Every exit, with why and how long it was held | The same state repeated unchanged |
| The bar the strategy became warm | Anything you can see on the chart instead |
| A refused trade, and the reason it was refused | Absence during warmup, which is expected |
| A halt or a risk limit firing | Secrets, keys or account identifiers |

Make the lines greppable. A fixed leading token per kind of event, in capitals,
lets you pull one strategy's entries out of a week of logs with one search, and
costs nothing.

## Running many strategies at once

### The same instrument in two strategies

Each strategy tracks its own position. The broker tracks one net position per
instrument per account. Two strategies that both trade the same instrument will
each believe they hold their own, while the account holds the sum, and if one
goes long two lots while the other goes short two lots, the account is flat and
both strategies think they have a trade on.

There is no setting that fixes this, because there is no honest answer for how
one net position should be split between two scripts. The workable approaches
are to keep one strategy per instrument per account, to separate them by
account, or to combine the rules into one file so that one script owns the
position. Choose one deliberately before running the second strategy.

### What changes when you go from one to ten

| Area | Check |
|---|---|
| Margin | The sum of the worst cases, not the sum of the averages |
| Data | How many instruments the feed will serve at once |
| Start times | Stagger them, so ten processes do not preload history at the same second |
| Logs | One file per strategy, and a habit of reading them |
| Naming | A name that says instrument, idea and revision, because a picker full of "test 3" is useless |
| Resource limits | Per process, and they apply to the heaviest script, not the average one |
| Failure | What you do when three of the ten are stopped and you did not notice |

The last row is the one that bites. With one strategy you notice it is not
running. With ten you do not. Whatever the host offers for status, look at it at
a fixed point in the day rather than when something feels wrong.

### Revisions across many strategies

Every process pins its revision at start. That means a fleet can be running
several revisions of the same file at once, which is fine as long as you can
tell. Before a trading day, the question to be able to answer in one look is:
which revision is each process running, and is it the one that produced the
backtest I approved. A start that logs the revision answers it in the log.

## A restart checklist

1. Was the strategy flat when it stopped? If not, reconcile before anything
   else.
2. Cancel working orders you do not intend to keep.
3. Confirm the revision that is about to start is the one you meant.
4. Confirm enough history will be preloaded for the file's warmup.
5. Start the process and watch for the line that says it is warm.
6. Check the strategy's position against the broker's, once, by eye.
7. Note the restart in the log with a reason, because the next person to read
   that file is you.

## See also

- [paper-and-live.md](./paper-and-live.md) for what arming live changes and the
  pre-flight checklist
- [backtesting.md](./backtesting.md) for computing a file's warmup, which the
  start time depends on
- [reading-a-report.md](./reading-a-report.md) for judging a run before it is
  scheduled at all
- [../README.md](../README.md) for the documentation index
- [../../spec/stdlib.md](../../spec/stdlib.md) for the `session` and `date`
  namespaces
- [../../spec/language.md](../../spec/language.md) for persistence, the rollback
  rule and the strategy options
- [../../examples/README.md](../../examples/README.md) for the worked scripts
  these examples are drawn from
