# Exits, stops and the risk levels

By the end of this page you will be able to attach a stop and a target to a leg,
trail one behind a move with an arming trigger, put a combined stop across a whole
multi-leg position, square off on the clock, on the session's end or before an
expiry, cap a day's loss, and read a log after a bad day to find out which rule
fired.

> **Much of this page is marked planned.** A strategy's ledger, its legs and its
> book are what the marked calls are folded from, and no engine holds one in this
> release. A marked call is refused where you wrote it, with a message that says
> it is planned, rather than compiling and then failing to load. The six order
> functions, the three `order` calls that place an order and the five position
> facts read from the account's own row are not marked, because those run.

## An exit is either a rule you write or a level the engine holds

Every exit in a strategy is one of two things, and confusing them is the most
expensive mistake on this page.

| | A level the engine holds | A rule in the script |
|---|---|---|
| Written as | `exit(...)`, `leg.stop`, `leg.target`, `leg.trail`, the `book` rules | `if ... close()` |
| Evaluated | Once per bar, after the script's own statements, in a fixed order | Wherever you wrote it, in source order |
| When it acts | On the bar the level is reached, at the level | On the bar the condition is true, at the declaration's fill point |
| Sends | A stop order or a limit order at its level | An ordinary market order |
| Emits | A named event saying which rule fired | Nothing, unless you wrote a `print` |
| Survives your machine going away | It is an order at the destination once it fires, and the rule is part of the run | No |

A level is a promise the engine keeps and records. A script rule is a promise you
are keeping, checked once per bar when the script runs, and not at all if the
process is not running. Both are legitimate; they are not interchangeable. A
strategy whose stop is the difference between a bad day and a ruinous one should
be a level, and a strategy whose exit is "when the trend reading turns" can only
be a rule, because no engine knows what your trend reading is until your script
computes it.

## The three levels the language has

The risk rules sit at three levels, and knowing which level a rule belongs to is
most of knowing what it does.

| Level | Rules |
|---|---|
| Per leg | A stop, a target, a trailing stop with its arming trigger |
| Per strategy | A combined stop, a combined target, a lock profit that arms then advances a floor, and trail every stop to entry |
| Per session | An entry window, an exit time, the end of day square off, an expiry square off, and a daily loss limit |

Each call sets a level that stays in force until it is replaced or removed, and
passing `none` as the level removes it. These are not order functions: an absent
level removes a rule rather than being refused with OS7002, because removing a
stop is a thing a script means to do and there is no order to refuse.

## Per leg: a stop, a target and a trail

| Call | Sets |
|---|---|
| `leg.stop(name, price)` (planned) | Close the leg when its price reaches `price` against the position |
| `leg.target(name, price)` (planned) | Close the leg when its price reaches `price` in favour of the position |
| `leg.trail(name, distance, arm = none)` (planned) | Follow the best price the leg has seen, `distance` behind it |
| `exit(tag = "", qty = none, limit = none, stop = none, profit = none, loss = none, leg = ...)` | The same stop and target, set from a call site |
| `order.bracket(tag = "", profit = none, loss = none, leg = ...)` | The same pair, given as distances from the entry |

**A leg carries at most one stop and at most one target at a time.** `exit()` sets
them from a call site and `leg.stop()` and `leg.target()` set them as standing
levels; they are two spellings of one thing, and the last call to run on a bar is
the one in force. `leg.stopPrice(name)` and `leg.targetPrice(name)` read back the
level actually in force, whichever call set it.

`exit` prices may be absolute (`limit`, `stop`) or distances from the entry
(`profit`, `loss`, in the instrument's own price units), and `order.bracket` is the
distance form on its own. Giving both an absolute and a distance for the same side
is OS3010, because the two would have to be reconciled and any rule for that would
surprise somebody.

**There is no pair of orders to keep in step.** A leg carries one stop and one
target, they are levels rather than two resting orders, and reaching either one
closes the leg. The other level then has no position to act on, so nothing has to
cancel anything and neither of the two cases that ruin a hand-built bracket, both
filling on a gap or one surviving the other, can arise. Calling `exit` or
`order.bracket` again replaces the levels rather than adding a second pair, which
is the other half of the same property. The general case, one arbitrary order
cancelling another arbitrary order, is named in the library as planned and is not
in version 1; where you need it today, write the cancel yourself with
`cancel(tag)`.

**A stop belongs below a long entry and a target above it, and the other way round
for a short.** The wrong side is refused with OS7010, naming the side, the entry
price, the leg and the price that was passed. It is an error rather than a warning
because a stop on the wrong side fills immediately, which in a backtest turns every
trade into an instant loss that looks like a strategy result.

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
// level was set is a line that was never a stop.
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
on, while the entry fills at the next bar's open, which is the default and the
honest one. The gap between the two is real and the report shows it, rather than
hiding it by recomputing the stop from the fill.

### The trail, exactly

A trailing stop is `leg.trail` of `stdlib.md` section 17.9. That section is where
`distance` and `arm` are defined, where the arming and the ratchet are stated, and
where a leg carrying both a stop and an armed trail is settled. Read it before you
write one.

There is no `trail` argument on `exit`, because a trail is a rule evaluated on
every bar rather than a price an order can rest at, and one rule with one spelling
is easier to hold in the head than the same rule written two ways.

`leg.stopPrice(name)` returns the level actually in force rather than the one the
script last wrote, which is why you plot the readback rather than your own
variable when you want to see what is really protecting the position.

`leg.stop`, `leg.target` and `leg.trail` each name their leg, so a file that wants
a standing trail declares its leg even when it trades a single contract:

```
version 1

strategy("Trail behind a swing", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots", pyramiding = 1)

symbolName = input("AAA", "Contract")
stopMult   = input(2.0,   "Initial stop, in ATR", min = 0.2, max = 20)
trailAtr   = input(3.0,   "Trail this far behind, in ATR", min = 0.2, max = 20)
armAtr     = input(1.0,   "Arm the trail after this much profit, in ATR", min = 0.1, max = 20)

// One leg, declared so that the standing levels below have a name to key on.
leg.fixed("main", symbolName)

atrValue = atr(14)
fast     = ema(close, 9)
slow     = ema(close, 21)
ready    = not isNone(atrValue)

// The file declares one leg, so the leg argument on buy defaults to it and is
// not written. The standing levels below name it, because each of them keys on
// a declared name.
if crossUp(fast, slow) and not leg.isOpen("main") and ready
    buy(qty = 1, tag = "entry")
    leg.stop("main", roundToTick(close - stopMult * atrValue))
    leg.trail("main", trailAtr * atrValue, arm = armAtr * atrValue)

// The readback, not the variable: while the trail is armed this is the trail's
// level, and before that it is the initial stop, because the more protective of
// the two is the one in force.
plot(leg.stopPrice("main"), "Stop in force", red, width = 2, style = "step")
plot(fast, "Fast", aqua)
plot(slow, "Slow", orange)
```

## Per strategy: the combined rules

`book` is the strategy's own book: every leg it has declared, taken together. Its
profit is the sum, in money, of every leg's open profit and of everything the
strategy realised since the book was last flat.

| Call | Sets |
|---|---|
| `book.stop(amount)` (planned) | Square off every leg when the book's profit falls to `-amount` |
| `book.target(amount)` (planned) | Square off every leg when the book's profit reaches `amount` |
| `book.lockProfit(arm, lock, step = none, advance = none)` (planned) | Arm a floor at a profit, then advance it as profit grows |
| `book.trailStopsToEntry(at)` (planned) | Move every leg's stop to its own entry once the book is `at` in profit |
| `book.direction(filter)` (planned) | `"long"`, `"short"` or `"both"`: which sides an entry may take |

| Call | Reads |
|---|---|
| `book.profit` (planned) | The book's profit in money, open and realised since it was last flat |
| `book.dayProfit` (planned) | The same measured from this session's open |
| `book.isOpen` (planned) | Whether any leg holds a position |

The combined stop and the combined target are the reason the book exists. Two legs
sold together, hedging each other, are meaningless to manage separately: stopping
each leg on its own is the classic way to take two losses on a day the two legs
were doing their job. **Measure the stop on the sum, never on a leg.**

**The lock profit, exactly.** `book.lockProfit(arm, lock, step, advance)` does
nothing until the book's profit first reaches `arm`; at that moment a floor exists
at `lock`. When `step` and `advance` are given, the floor stands at
`lock + n * advance`, where `n` is the largest whole number for which the book's
profit has reached `arm + n * step`. The floor never moves down. When the book's
profit falls to the floor or below while a floor exists, every leg is squared off.
`step` and `advance` are given together or not at all; one without the other is
OS3009.

Read that as a sentence: "once I am four thousand up, I am not giving back more
than two thousand of it, and for every two thousand further I go, I raise that
line by fifteen hundred". The arming is what stops the floor from acting on a trade
that never got going, and the floor never moving down is what stops it from
becoming a second, looser stop halfway through a good day.

## Per session: windows, times and the day's limit

| Call | Sets |
|---|---|
| `book.entryWindow(spec)` (planned) | New entries only inside this window, written as `"HHMM-HHMM"` with an optional day list |
| `book.exitAt(time)` (planned) | Square off every leg at this `"HHMM"` in the chart's timezone |
| `book.squareOffAtExpiry(minutesBefore = 0)` (planned) | Square off a leg this many minutes before its contract expires |
| `book.dailyLoss(amount)` (planned) | Square off and stop entering for the day when the day's loss reaches `amount` |

The end of day square off is not a call here. It is the declaration's
`closeOnSessionEnd` option, which already exists, and it is named below for the
event it emits. One spelling of one rule.

A `filter` that is not `"long"`, `"short"` or `"both"`, a window that does not
parse, and a time that is not four digits are each OS3008: a value outside the set
selects no rule, and defaulting quietly would change what the script does.

Two notes that save a day each. `book.dailyLoss` tests `book.dayProfit`, which is
measured from this session's open rather than from the start of the run, so the
limit means today and not the whole backtest. And `book.squareOffAtExpiry` is the
rule that keeps a strategy from holding a contract through settlement, which is a
calendar event no price rule can see coming.

```
version 1

strategy("Two legs, one book", precision = 2,
         capital = 500000, qty = 1, qtyType = "lots",
         product = "intraday", closeOnSessionEnd = true,
         fillOn = "nextOpen", slippage = 1,
         commissionType = "perTrade", commission = 20)

underlying = input("AAA", "Underlying")
lots       = input(1,     "Lots per leg", min = 1, max = 100)

// Declared before bar 0 and resolved once. Every later action uses the contract
// the host resolved here, never the description, which is why the exit closes
// what the entry opened.
leg.relative("upper", underlying, expiry = 0, strike =  2, right = "call", side = "sell", qty = lots)
leg.relative("lower", underlying, expiry = 0, strike = -2, right = "put",  side = "sell", qty = lots)

// Session rules.
book.entryWindow("0930-1030:12345")
book.exitAt("1500")
book.squareOffAtExpiry(15)
book.dailyLoss(15000)

// Combined rules, which mean something here because the book enters as a unit.
book.stop(6000)
book.target(9000)
book.lockProfit(4000, 2000, step = 2000, advance = 1500)
book.trailStopsToEntry(3000)

// One decision sends both legs their declared side and quantity. The entry
// window does the timing, so the script's own condition says only what it is
// about: once per session, and only while the book is flat.
var enteredToday = false

if session.isFirstBar
    enteredToday = false

if not enteredToday and not book.isOpen
    book.enter(tag = "unit")
    enteredToday = true

plot(book.profit, "Book profit", aqua, width = 2)
```

## When a level is tested, and in what order

**Every rule above is evaluated once per bar, after the script's own statements
for that bar have run, in this order.** The order is part of the language rather
than an implementation detail: two engines that tested a combined stop before a
leg stop would close different positions from the same script on the same bar.

1. The daily loss limit.
2. The exit time, then the end of day square off, then the expiry square off.
3. The combined stop, then the combined target.
4. The lock profit: arm the floor, then advance it, then test it.
5. The trail to entry.
6. Each leg in declaration order: its stop, then its target, then its trail, which
   is armed, then advanced, then tested.

**A rule that squares the book off ends the sequence for that bar.** The rules
below it have nothing left to act on and emit nothing. The book rules are tested
before the leg rules because a breached combined limit takes the whole book off
either way, and the record should name the rule that did it.

**How a level is tested.** On a confirmed bar a level is reached when the bar's
traded range reaches it: `low <= level` for a long leg's stop and a short leg's
target, `high >= level` for a long leg's target and a short leg's stop. On a bar
that is still moving the level is tested against the last price only, and the test
is taken again when the bar closes.

**When one bar's range contains both a leg's stop and its target, the stop is
taken.** Nothing in a bar says which came first, and assuming the better of the
two is how a backtest invents money that was never made.

**Where the exit fills.** A stop sends a stop order at its level and a target sends
a limit order at its level, so a backtest fills where the level was rather than at
the next bar's open. When the bar's open is already beyond the level, the fill is
at the open, because the level was gone before the bar began. The declaration's
slippage applies to a stop and not to a target: a stop takes the price on the other
side and pays for it, and a limit fills at its own price or not at all.

A level's exit order is an order like any other. It lands in the strategy's ledger,
it folds like any other order, and it obeys the lot and tick rules, so a stop that
rounds to no whole lot is OS7005 and a level off the tick is OS7006.

**Not raised yet.** OS7005 is in the catalogue and nothing raises it: nothing
compares an order's quantity with the lot size its leg trades in.

## The named events, and reading a log after a bad day

Every transition a rule causes is emitted as a named event carrying the bar's time,
the leg where there is one, the rule's own level and the value that crossed it. A
trader reading a log after a bad day needs to know which rule fired, and "the
position closed" is not an answer.

| Event | Emitted when |
|---|---|
| `legStopHit` | A leg's stop was reached and the leg was closed |
| `legTargetHit` | A leg's target was reached and the leg was closed |
| `trailArmed` | A leg's trailing stop armed, because profit reached `arm` |
| `trailAdvanced` | A leg's trailing stop moved in the leg's favour |
| `combinedStopHit` | The book's profit fell to the combined stop and the book was squared off |
| `combinedTargetHit` | The book's profit reached the combined target and the book was squared off |
| `lockProfitArmed` | The book's profit first reached `arm` and a floor exists |
| `lockProfitFloorAdvanced` | The floor moved up a step |
| `lockProfitTriggered` | The book's profit fell to the floor and the book was squared off |
| `trailToEntryActivated` | Every leg's stop was moved to its own entry |
| `sessionEndSquareOff` | `closeOnSessionEnd` flattened the book at the session's close |
| `expirySquareOff` | A leg was closed because its contract was about to expire |
| `exitTimeSquareOff` | `book.exitAt` flattened the book at its time |
| `dailyLossHit` | The day's loss reached the limit; the book is off and no entry is taken for the rest of the day |
| `entryRefused` | An entry was refused by the direction filter, the entry window or a daily loss already hit, naming which |

### How to read the log

The question after a bad day is never "did it lose money". It is "which rule
decided that, and was the rule the one I wrote". Work the log in this order:

1. **Find the last square off event of the day.** One of `combinedStopHit`,
   `lockProfitTriggered`, `dailyLossHit`, `exitTimeSquareOff`,
   `sessionEndSquareOff` or `expirySquareOff` ended the book. That event names the
   rule and carries the level and the value that crossed it, so you can see
   immediately whether the level was the one you set.
2. **Read upwards to the last `entryRefused`.** If entries stopped before the loss,
   the direction filter, the entry window or an earlier daily loss was the cause,
   and the event says which of the three.
3. **Check for `trailArmed` without `trailAdvanced`.** A trail that armed and never
   advanced means the trade went your way by `arm` and then straight back. That is
   a sign the arming distance is too small for the instrument, not a sign the trail
   is broken.
4. **Check the order of the events against the evaluation order above.** A
   `combinedStopHit` with no `legStopHit` on the same bar is exactly right: the
   book rule took the position off and the leg rules had nothing left to act on.
   A `legStopHit` on every leg where you expected one `combinedStopHit` means you
   set leg stops and no combined stop.
5. **Only then look at prices.** By this point you know which rule fired, and the
   remaining question is whether its level was sensible, which is a question about
   your parameters rather than about the run.

An event is a record, not a value. No call reads one, because a script that
branched on its own stop having fired would be deciding twice what the rule already
decided once, and the second decision would be the one nobody tested.

## Two strategy shapes, and why a combined stop fits only one

A strategy takes one of two shapes, and the shape decides what a stop means.

**As a unit.** `book.enter(tag = "")` sends every declared leg its declared side
and quantity in one decision, and `book.exit(tag = "")` closes every open leg. This
is the shape a multi-leg position is written in when the legs only make sense
together.

**Per leg.** `leg.enter(name, ...)` and `leg.exit(name, ...)` take one leg at a
time, on that leg's own signal, filtered by `book.direction`. Legs open and close
at different moments. `buy`, `sell`, `close`, `exit`, `order.place` and
`order.reverse` are this same pair written the short way, which is why the single
instrument scripts on this page are per-leg strategies without ever saying so.

| Call | Does |
|---|---|
| `book.enter(tag = "")` (planned) | One order per declared leg, entering the whole book as a unit |
| `book.exit(tag = "")` (planned) | One order per open leg |
| `leg.enter(name, side = the leg's, qty = the leg's, limit = none, stop = none, tag = "")` (planned) | One order, entering one leg on its own signal |
| `leg.exit(name, qty = none, limit = none, stop = none, tag = "")` (planned) | One order, exiting one leg |

**This is what a combined stop means, and why it means it.** `book.profit` is
measured from the last moment the book was flat.

In a strategy that enters as a unit, that moment is the start of the current trade,
because the book goes flat between trades by construction. A combined stop is
therefore a stop on that trade, and the sentence "square off when this trade is six
thousand down" is exactly what the rule does.

In a per-leg strategy the book may never be flat: one leg closes as another opens,
and a third has been running since Tuesday. The measurement would run from a moment
no rule chose and no reader could name, so a combined stop there is a stop on an
arbitrary window. That is worse than having no stop at all, because it looks like
one: it will fire, it will square the book off, and nobody will be able to say what
window it measured.

So the language refuses the combination rather than defining it:

- A file that calls `book.enter` or `book.exit` and also calls any per-leg entry or
  exit is refused at compile time. A leg entered outside the unit leaves the book
  holding a position it did not enter as a unit, and the measurement stops being
  the trade.
- A file that calls `book.stop`, `book.target`, `book.lockProfit` or
  `book.trailStopsToEntry` without calling `book.enter` is refused at compile time,
  with the fix naming `leg.stop` and `leg.target`.

Both refusals hold in a one-leg file as well, although nothing there could go
wrong. One rule that is always true is easier to hold in the head than one rule
with an exception, and a script that grows a second leg later would otherwise start
meaning something different on the day it grew it.

What a per-leg strategy uses instead of a combined stop: a stop and a target on
each leg, a trail on each leg, and the session rules, all of which are measured
from something a reader can name.

## Exits on the clock, in the script

The session rules cover the cases that are about the clock alone. Where the rule is
about the trade rather than the clock, it stays in the script:

| Kind | Written with | Good for |
|---|---|---|
| Bars held | `pos.barsHeld` | An idea with a horizon measured in bars |
| Minutes since the open | `session.startTime`, or `time` minus a stored open | An intraday rule stated in clock time |
| The session's last bar | `session.isLastBar` | Being flat before the close, on a short day too |
| Every session | `closeOnSessionEnd = true` | The blanket rule, set once in the declaration |
| A weekday | `date.dayOfWeek(time)` | A weekly recurrence, which a list of dates cannot be |

```
version 1

strategy("Give up on a trade that has not worked", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots",
         product = "intraday", closeOnSessionEnd = true)

holdMinutes = input(120, "Give up after this many minutes", min = 5, max = 1440)
barsCap     = input(60,  "And never hold more than this many bars", min = 2, max = 500)

fast   = ema(close, 9)
slow   = ema(close, 21)
goLong = crossUp(fast, slow)

// The session open, taken from the session rather than from the calendar: an
// evening session that runs past midnight is one session and two dates.
var openedAt = none

if session.isFirstBar
    openedAt = time

elapsed = isNone(openedAt) ? none : time - openedAt

if goLong and pos.isFlat and session.isOpen
    buy(qty = 1, tag = "entry")

// One branch, so none of these can fire on the same bar as the entry above.
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
branch, and that is not redundancy for its own sake. The declaration is the blanket
rule that applies even on the bars the script's own logic did not anticipate: a
holiday truncation, a feed that stops early, a condition that was absent.
`session.isLastBar` is known from the session's scheduled close, so it is true on
the last scheduled bar even if trading stopped early, which is what a strategy that
must be flat should be acting on. A new bar arriving is the wrong trigger, because
by then the close has happened.

## Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Every trade closes instantly at a loss | A stop on the wrong side of the entry (OS7010) | Stop below a long, target above it |
| The plotted stop is not the stop that filled | The script's own variable was plotted, not the level in force | Plot `leg.stopPrice(name)` |
| The trailing stop drifts back down | Expecting `leg.trail` to behave like a variable you update | It cannot: the level only ever moves in the leg's favour |
| The trail never arms | `arm` is larger than the trade ever gets | Lower it, or leave it absent to arm on the first fill |
| Two losses on a day the two legs hedged each other | A stop per leg where the position is one unit | `book.stop`, with `book.enter` |
| The file will not compile after adding `book.stop` | A combined rule in a file with no book entry | Use `leg.stop` and `leg.target`, or enter as a unit |
| The day's limit fires on day one of a long backtest | Reading `book.dailyLoss` as a run-wide limit | It tests `book.dayProfit`, measured from this session's open |
| The position survives the session | Neither `closeOnSessionEnd` nor `book.exitAt` | Set one, and keep the script's own rule too |
| A stop and a target both inside one bar, and the report shows the stop | That is the rule | Drop to an interval where the two are rarely in one bar |

## See also

- [orders.md](./orders.md) for the legs and entries these levels are attached to
- [reading-the-books.md](./reading-the-books.md) for the ledger a level's exit order lands in
- [position-and-sizing.md](./position-and-sizing.md) for sizing measured against the stop distance
- [costs-and-fills.md](./costs-and-fills.md) for what a stop actually fills at
- [overview.md](./overview.md) for the per-bar loop these rules run inside
- [../running/reading-a-report.md](../running/reading-a-report.md) for the events in a finished run's record
- [../../spec/stdlib.md](../../spec/stdlib.md) sections 17.9 to 17.12 for the exact rules, the evaluation order and the two shapes
- [../../examples/README.md](../../examples/README.md) for the worked strategies
