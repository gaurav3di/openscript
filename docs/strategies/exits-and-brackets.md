# Exits and brackets

By the end of this page you will be able to attach a stop and a target to an
entry, trail a stop behind a move, exit on the clock, and hold one stop over a
position built from more than one leg.

## An exit is either a rule or an order

Every exit in a strategy is one of two things, and confusing them is the most
expensive mistake on this page.

| | A resting order | A rule in the script |
|---|---|---|
| Written as | `exit(...)`, `order.bracket(...)` | `if ... close()` |
| Lives | At the order destination | In the script |
| Acts | Whenever the market reaches the price | On the bars the script runs |
| Through a gap | Fills at the first price available, which is not the trigger | Acts on the next bar, at that bar's fill point |
| Visible to you | As a working order | Only as the code that produced it |
| Survives your machine going away | Yes | No |

A resting stop is a promise somebody else is holding. A script stop is a promise
you are holding, checked once per bar when the script runs, and not at all if the
chart is closed. Both are legitimate; they are not interchangeable. A strategy
whose stop is the difference between a bad day and a ruinous one should be using
a resting order, and a strategy whose exit is "when the trend reading turns" can
only be a rule, because no exchange knows what your trend reading is.

## The bracket: a stop and a target attached to an entry

```
exit(tag = "", qty = none, limit = none, stop = none,
     trail = none, trailOffset = none, profit = none, loss = none)
```

`exit` attaches a bracket to a position: a target, a stop, or a trailing stop.
There are two ways to say where each leg goes, and one rule about mixing them.

| Argument | Is | Example |
|---|---|---|
| `stop` | An absolute price for the stop | `stop = 24180.5` |
| `limit` | An absolute price for the target | `limit = 24450` |
| `loss` | A distance from the entry, in the instrument's price units | `loss = 60` |
| `profit` | A distance from the entry, in the same units | `profit = 120` |
| `trail`, `trailOffset` | The two distances a trailing stop needs | below |
| `qty` | How much of the position the bracket covers | `qty = 1` |
| `tag` | Which part of the position it is attached to | `tag = "entry"` |

**Giving both an absolute price and a distance for the same side is refused.** The
two would have to be reconciled, and every rule for reconciling them surprises
somebody. Say it once, in whichever form the strategy is actually described in.

**A stop below a long entry, a target above it, and the other way round for a
short.** A stop on the wrong side is refused with OS7010, naming the side, the
entry price, the leg and the price that was passed. The reason it is an error
rather than a warning: a stop on the wrong side fills immediately, which in a
backtest turns every trade into an instant loss that looks like a strategy result.

Here is the whole pattern, with the two habits that make it debuggable: the levels
are computed once and held in `var`, and they are plotted.

```
version 1

strategy("Bracketed breakout", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots",
         product = "intraday", pyramiding = 1, closeOnSessionEnd = true,
         fillOn = "nextOpen", slippage = 1,
         commissionType = "perTrade", commission = 20)

length     = input(20,  "Breakout lookback", min = 2, max = 500)
stopMult   = input(2.0, "Stop, in ATR",   min = 0.2, max = 20)
targetMult = input(3.0, "Target, in ATR", min = 0.2, max = 40)

atrValue      = atr(14)
breakoutLevel = highest(high, length)[1]

// Held in var so that what is plotted is what was sent, not what would be
// computed from today's volatility. A stop line that keeps moving after the
// order was placed is a line that was never an order.
var entryStop   = none
var entryTarget = none

ready = not isNone(atrValue) and not isNone(breakoutLevel)

// Clear the last trade's levels first, before the entry below can set fresh
// ones. Written the other way round, this block would wipe the levels on the
// entry bar itself, because the position is still flat until the fill.
if pos.isFlat
    entryStop   = none
    entryTarget = none

if ready and pos.isFlat and session.isOpen and close > breakoutLevel
    entryStop   = roundToTick(close - stopMult * atrValue)
    entryTarget = roundToTick(close + targetMult * atrValue)
    buy(qty = 1, tag = "entry")
    exit(tag = "entry", stop = entryStop, limit = entryTarget)

plot(breakoutLevel, "Breakout level", aqua, style = "step")
plot(entryStop,   "Stop",   red,  style = "step")
plot(entryTarget, "Target", lime, style = "step")
```

Note where the levels are computed. They come from the bar the decision was made
on, while the order fills at the next bar's open, which is the default and the
honest one. The gap between the two is real and the report shows it as slippage,
rather than hiding it by recomputing the stop from the fill.

## One leg cancelling the other

A bracket is two orders that are also one decision: when the stop fills, the
target is cancelled, and when the target fills, the stop is cancelled. That is
what makes it a bracket rather than two unrelated orders, and it is why the two
legs are attached in one call rather than placed separately. Placing them
separately leaves you exposed to the case both are filled, which on a gap day is
not a theoretical concern.

Three consequences worth knowing:

- **A partial fill leaves a partial bracket.** Passing `qty` covers part of the
  position, and the rest is unprotected until something covers it. Bracket the
  whole position unless you mean to leave part of it running.
- **A bracket belongs to the position, not to the bar.** `order.bracket(...)`
  attaches or replaces the bracket on the open position, so calling it again with
  new distances moves the levels rather than adding a second pair.
- **The general case, one arbitrary order cancelling another arbitrary order, is
  named in the library as planned and is not in version 1.** Where you need it
  today, write the cancel yourself with `cancel(tag)` on the bar the other order
  fills.

```
version 1

strategy("Replace the bracket as risk changes", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots", pyramiding = 3)

stopMult = input(2.0, "Stop, in ATR", min = 0.2, max = 20)

atrValue = atr(14)
trend    = ema(close, 50)
newHigh  = high > highest(high, 20)[1]
goLong   = close > trend and newHigh and pos.entries < 3 and not isNone(atrValue)

if goLong
    buy(qty = 1, tag = "entry")

// One stop for the position, replaced only when something about the position
// changed. Replacing it on every bar would re-send an identical order fifty
// thousand times over a long dataset.
sized = not isNone(atrValue) and pos.isLong
moved = not bar.isFirst and pos.entries != pos.entries[1]

if sized and moved
    order.bracket(loss = stopMult * atrValue, profit = 3 * stopMult * atrValue)

plot(trend, "Trend", orange)
plot(pos.isFlat ? none : pos.avgPrice - stopMult * atrValue, "Stop", red, style = "step")
```

## Trailing stops

A trailing stop is described by two distances, both in the instrument's own price
units: `trail`, how far the trade must run in your favour before the stop starts
to follow, and `trailOffset`, how far behind the price the stop then sits. Attach
it the same way as any other bracket leg.

```
exit(tag = "entry", trail = 3 * atrValue, trailOffset = 2 * atrValue)
```

That is the resting version, held by the destination. The other version is a rule
in the script, and it exists because the most useful trailing stops do not follow
the price at a fixed distance: they follow a level the market drew, such as the
lowest low of the last few bars, or a volatility band.

```
version 1

strategy("Trail behind the swing low", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots", pyramiding = 1)

trailLen = input(5,   "Trail behind the lowest low of", min = 2, max = 100)
stopMult = input(2.0, "Initial stop, in ATR", min = 0.2, max = 20)

atrValue = atr(14)
swingLow = lowest(low, trailLen)
fast     = ema(close, 9)
slow     = ema(close, 21)
goLong   = crossUp(fast, slow)

var stopLevel = none

// First, so that the entry below can set a fresh stop on the same bar. The
// position is still flat on the bar the entry is decided, so a clearing block
// written after the entry would wipe the level it just set.
if pos.isFlat
    stopLevel = none

if goLong and pos.isFlat and not isNone(atrValue)
    stopLevel = close - stopMult * atrValue
    buy(qty = 1, tag = "entry")

// max, never min: a trailing stop only ever moves in one direction. Written
// with min by mistake, it follows the price back down and never stops anything.
if pos.isLong and not isNone(stopLevel) and not isNone(swingLow)
    stopLevel = max(stopLevel, swingLow)

if pos.isLong and not isNone(stopLevel) and close < stopLevel
    close()
    stopLevel = none

plot(stopLevel, "Trailing stop", red, width = 2, style = "step")
plot(fast, "Fast", aqua)
plot(slow, "Slow", orange)
```

Two lines in that script are the whole of trailing a stop correctly, and both are
worth saying out loud. `max(stopLevel, swingLow)` is the ratchet: a trailing stop
that can move both ways is not a stop, it is a moving average with a bad name. And
the stop is cleared when the position closes, because a `var` keeps its value
forever otherwise, and the next trade would inherit the last trade's stop.

The script version acts on the close of a bar. The market can trade below your
level and come back within the bar and this stop will not have noticed. That is
not a defect to fix in the script; it is the difference between the two columns of
the first table on this page, and the way to remove it is to rest the stop at the
destination instead.

## Exits on the clock

Time exits are the least glamorous and among the most useful. A position that has
not worked in five hours is usually not going to, and an intraday position carried
into the closing auction costs more than it gains.

| Kind | Written with | Good for |
|---|---|---|
| Bars held | `pos.barsHeld` | An idea with a horizon measured in bars |
| Minutes since the open | `session.startTime`, or `time` minus a stored open | An intraday rule stated in clock time |
| The session's last bar | `session.isLastBar` | Being flat before the close |
| Every session | `closeOnSessionEnd = true` | The blanket rule, set once in the declaration |
| A weekday | `date.dayOfWeek(time)` | A weekly recurrence, which a list of dates cannot be |

```
version 1

strategy("Flat by lunch, flat by the close", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots",
         product = "intraday", closeOnSessionEnd = true)

holdMinutes = input(120, "Give up on a trade after this many minutes", min = 5, max = 1440)
barsCap     = input(60,  "And never hold more than this many bars", min = 2, max = 500)

fast   = ema(close, 9)
slow   = ema(close, 21)
goLong = crossUp(fast, slow)

// The session open, taken from the session rather than from the calendar: an
// evening session that runs past midnight is one session and two dates.
var openTime = none

if session.isFirstBar
    openTime = time

elapsed = isNone(openTime) ? none : time - openTime

if goLong and pos.isFlat and session.isOpen
    buy(qty = 1, tag = "entry")

// Three clock exits, in one branch, so none of them can fire on the same bar as
// the entry above.
else if pos.isLong and not isNone(elapsed) and elapsed >= holdMinutes * 60000
    close()
else if pos.isLong and orElse(pos.barsHeld, 0) >= barsCap
    close()
else if pos.isLong and session.isLastBar
    close()

plot(fast, "Fast", aqua)
plot(slow, "Slow", orange)
background(pos.isFlat ? none : fade(aqua, 94))
```

`closeOnSessionEnd = true` is in the declaration as well as the `session.isLastBar`
branch, and that is not redundancy for its own sake. The declaration is the
blanket rule that applies even on the bars the script's own logic did not
anticipate: a holiday truncation, a feed that stops early, a condition that was
absent. `session.isLastBar` is known from the session's scheduled close, so it is
true on the last scheduled bar even if trading stopped early, which is what a
strategy that must be flat should be acting on. A new bar arriving is the wrong
trigger, because by then the close has happened.

## One stop across more than one leg

"More than one leg" means two different things, so here are both.

### Several entries in one instrument

A strategy holds one net position, so several entries are already one thing. The
stop belongs to the position and is measured from `pos.avgPrice`, not from any one
entry's price. The bracket example earlier on this page does exactly that: it
replaces the bracket whenever `pos.entries` changes, so the distance is always
measured from the current average.

The mistake to avoid is a stop per entry. Three entries with three stops is three
separate opinions about one position, and on the day they all trigger you take
three losses in an order that depends on which one happened to be nearer.

### Two instruments held as one position

This is the option seller's case: two legs sold together, hedging each other, and
meaningless to manage separately. The rule is one sentence, and it is the most
important sentence on this page. **Measure the stop on the sum, never on a leg.**
Stopping each leg separately is the classic way to take two losses on a day the
two legs were doing their job.

Version 1 draws a hard boundary here, and it is better to know it now than to
discover it in a backtest. A strategy holds **one net position in the instrument
the chart is showing**. Orders are single instrument. What the language does give
you is the reading: `req.symbol` fetches another instrument's values, absence
propagates through the addition so a half priced pair is absent rather than half a
position, and `alert` carries a message the host can route.

So the shape of a two leg script today is: the chart carries one leg, the script
reads the other, the decision is made once on the sum, and the second leg is
routed by the host from an alert.

```
version 1

strategy("Two legs, one stop", precision = 2,
         capital = 500000, qty = 1, qtyType = "lots",
         product = "intraday", closeOnSessionEnd = true)

// A plain text input, because the instrument picker is named in the library as
// planned and is not in version 1 yet.
otherLeg    = input("",  "The other leg's symbol")
entryMinute = input(20,  "Enter this many minutes after the open", min = 0, max = 1440)
stopPct     = input(30,  "Stop, in percent of the entry premium", min = 1, max = 500)
targetPct   = input(50,  "Target, in percent of the entry premium", min = 1, max = 99)

// The other leg, at this chart's own interval, in the mode that never repaints.
otherPrice = req.symbol(otherLeg, chart.interval, close)

// The position is the sum, so the sum is what is managed. If one leg has no bar
// at this time the total is absent rather than half a total, which is exactly
// why absence propagates through arithmetic instead of being absorbed.
premium = close + otherPrice

var openTime     = none
var entryPremium = none

if session.isFirstBar
    openTime = time

elapsed = isNone(openTime) ? none : time - openTime
priced  = not isNone(premium)
timeUp  = not isNone(elapsed) and elapsed >= entryMinute * 60000

// Clear first, so a position closed by the session end rule does not leave its
// entry premium behind for the next day to measure against.
if pos.isFlat
    entryPremium = none

if priced and timeUp and pos.isFlat
    sell(qty = 1, tag = "leg")
    entryPremium = premium
    alert("SELL " + otherLeg, id = "other-leg-entry")

// Positive when the seller is losing, which is the direction the stop cares
// about, so both comparisons below read the way they are spoken. Absence does
// the guarding: if either leg has no price, movePct is absent and neither test
// below is true.
movePct = (premium - entryPremium) / entryPremium * 100

hit    = not isNone(movePct) and movePct >= stopPct
banked = not isNone(movePct) and movePct <= -targetPct

if pos.isShort and hit
    close()
    entryPremium = none
    alert("BUY " + otherLeg, id = "other-leg-exit")
    signal("STOP")
else if pos.isShort and banked
    close()
    entryPremium = none
    alert("BUY " + otherLeg, id = "other-leg-exit")
    signal("TARGET")

// No ternary needed on any of these: entryPremium is absent while flat, absence
// propagates through the arithmetic, and a plot given an absent value draws a
// gap rather than a zero.
plot(premium, "Combined premium", orange, width = 2)
plot(entryPremium, "At entry", fade(silver, 40), style = "step")
plot(entryPremium * (1 + stopPct / 100), "Stop", red, style = "step")
plot(entryPremium * (1 - targetPct / 100), "Target", lime, style = "step")
```

Read the plots at the bottom before the logic. Three lines, drawn only while a
position is open, showing the combined premium against the level it was sold at
and the two levels that end the trade. A combined position you cannot see on a
chart is a combined position you are managing from memory.

## Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Every trade closes instantly at a loss | Stop on the wrong side of the entry (OS7010) | Stop below a long, target above it |
| The plotted stop is not the stop that filled | The level is recomputed each bar instead of held | Hold it in `var` at the entry |
| The new trade uses the old trade's stop | The `var` was never cleared | Clear it when `pos.isFlat` |
| The trailing stop drifts back down | `min` where `max` was meant | A trailing stop moves one way only |
| The exit never fires during warmup | The level is absent and the comparison is absent | That is correct, and it is why the entry should be guarded too |
| Both bracket legs filled on a gap | The two were placed as separate orders | Attach them in one `exit` call |
| The position survives the session | Neither `closeOnSessionEnd` nor a last bar rule | Set the declaration option and keep the rule |

## See also

- [orders.md](./orders.md) for the entries these exits are attached to
- [position-and-sizing.md](./position-and-sizing.md) for sizing measured against the stop distance
- [costs-and-fills.md](./costs-and-fills.md) for what a stop actually fills at
- [overview.md](./overview.md) for the per-bar loop these rules run inside
- [../../spec/stdlib.md](../../spec/stdlib.md) for `exit`, `order.bracket` and the `pos` namespace
- [../../examples/12-strategy-short-premium.oscript](../../examples/12-strategy-short-premium.oscript) for two legs managed as one position
