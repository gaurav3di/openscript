# Orders: entering, exiting, reversing, cancelling

By the end of this page you will be able to place a market, limit or stop order,
name it so a later bar can find it, decide what happens when the next signal
arrives while the last order is still working, and flatten or reverse a position
without the engine refusing you.

## The whole surface, in one table

Everything below is available only in a `strategy()` file. In a `study()` file the
compiler refuses the call and names the declaration to change.

| Call | For |
|---|---|
| `buy(qty = the declaration's, limit = none, stop = none, tag = "")` | Enter or add to a long position |
| `sell(qty = ..., limit = none, stop = none, tag = "")` | Enter or add to a short position |
| `close(tag = none, qty = none)` | Flatten the position, or the part carrying one tag |
| `exit(tag = "", qty = none, limit = none, stop = none, trail = none, trailOffset = none, profit = none, loss = none)` | Attach a bracket: a target, a stop, or a trailing stop |
| `cancel(tag)` | Cancel a working order that has not filled |
| `cancelAll()` | Cancel every working order this strategy placed |
| `order.place(side, qty, type = "market", price = none, trigger = none, tag = "")` | The general form, for a script that computes its side |
| `order.reverse(qty = none, tag = "")` | Flatten and open the same size the other way, in one decision |
| `order.working(tag)` | Whether an order with that tag is live and unfilled |
| `order.pending` | How many orders are live and unfilled |

Six bare names cover almost every script, and the `order` namespace holds the rest.
That split is the library's general rule: a call a script reaches for on most days
is bare, and the long tail is namespaced.

## One net position

A strategy holds **one net position** in the instrument the chart is showing.
`buy(qty)` adds to it, `sell(qty)` subtracts from it, and an order that crosses
zero is reported as one exit and one entry. `close()` flattens it.

There is no separate long book and short book. The reason is reconciliation: a net
position is what a broker actually gives back at the end of the day, and a
language whose model disagreed with the account would produce a backtest that
cannot be checked against a statement. If the backtest and the statement cannot be
compared, the backtest is decoration.

One consequence catches everyone once. `sell()` does not mean "close a long". It
means "subtract from the net position", which closes a long if one is open, and
keeps going into a short if the quantity is larger than the long. To flatten, say
so: `close()`.

```
// pos.size is 5 here
sell(qty = 8)        // flat, then short 3: one exit and one entry
close()              // flat, whatever was held
```

**Direction is chosen by the function, never by the sign of the quantity.** A
negative quantity is a calculation that went the wrong way, not an order in the
other direction, and a quantity of zero is never what a script means. Both are
refused with OS7004, naming the function and the quantity that reached it.

```
buy(qty = target - pos.size)          // refused when the difference is negative

delta = target - pos.size             // write it out instead
if delta > 0
    buy(qty = delta)
else if delta < 0
    sell(qty = -delta)
```

## Market, limit and stop

There is one entry function per direction, and the kind of order is decided by
which price arguments are present.

| `limit` | `stop` | Kind | Fills when |
|---|---|---|---|
| absent | absent | Market | At the next fill point the declaration names |
| present | absent | Limit | Price reaches the limit or better |
| absent | present | Stop | Price trades through the trigger |
| present | present | Stop limit | Price trades through the trigger, then rests as a limit |

One function with optional prices rather than six named functions, because the
trader's decision is direction and the price is a qualifier on it. You decide to
buy; whether you buy at the market or wait for a pullback is the next thought, not
a different thought.

Two rules apply to every price you pass:

**A price must fall on a tick.** A limit at a price between two ticks cannot exist
at the exchange, so it is refused with OS7006 naming the instrument, its tick and
the price. Rounding it for you would move the order away from the level the script
computed, and in a backtest that difference is free money or a free stop. Round it
yourself with `roundToTick(price)`.

**`roundToTick` is absent when the host has not supplied a tick size**, and an
order given an absent price is refused with OS7002 naming the argument. Absence is
the honest answer there: a script sizing an order in ticks has to be able to tell
"one paisa" from "nobody said". Guard it once and use the result.

```
version 1

strategy("Pullback limit", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots")

offsetAtr = input(0.5, "Enter this far below the close, in ATR", min = 0.1, max = 5)

atrValue = atr(14)
trend    = ema(close, 50)

// Computed once, at the top level, and tested before it is used. Every price
// that reaches an order function in this file has been through this gate.
wanted = close - offsetAtr * atrValue
entry  = isNone(wanted) ? none : roundToTick(wanted)

if close > trend and pos.isFlat and not isNone(entry) and not order.working("entry")
    buy(qty = 1, limit = entry, tag = "entry")

plot(trend, "Trend", orange, width = 2)
plot(order.working("entry") ? entry : none, "Resting bid", aqua, style = "step")
```

A limit or stop order named without its price is refused with OS7007, rather than
being filled in from the bar's close. An order kind wearing another kind's
behaviour is the worst kind of silent default: the report says "limit" and the
fills say "market".

## Order identity

An order is named by a **tag**, a string the script chooses. The tag is how a
later bar refers to an order that is still working, and how `close(tag = ...)`
picks out one part of a position.

```
buy(qty = 2, limit = entry, tag = "pullback")
...
if order.working("pullback")
    cancel("pullback")
```

The identity comes from the script rather than from the engine for a reason you
can see in the execution model. An order function does not place anything at the
moment it runs: it records the request, and the record is applied at the end of
the bar, and only if the bar is confirmed. There is no order yet to have an
identifier, and handing back a number at call time would name something that may
never exist. A tag is a name the script already knows, on a bar the script can
still change its mind on.

Cancelling or modifying something that is no longer live is refused with OS7009,
not ignored, because a script mutating an order that has gone has lost track of
its own state and will keep doing so. Test first:

| Call | Returns | Use it to |
|---|---|---|
| `order.working(tag)` | `series bool` | Ask whether one named order is live and unfilled |
| `order.pending` | `series number` | Ask how many orders are live in total |

Two habits that pay for themselves: give every order a tag, even when the script
has only one, and make the tag describe the intention (`"entry"`, `"stop"`,
`"target"`, `"reversal"`) rather than the bar it was placed on. The trade list and
the refusal messages quote the tag back at you.

## When an order is still working and the next signal arrives

This is the case that separates a strategy that survives contact with a live feed
from one that does not, so read the next three paragraphs twice.

The language fixes three things and deliberately leaves the fourth to you.

1. **A working order is not a position.** `pos.size` counts fills, not intentions.
   A resting limit order changes nothing in the `pos` namespace until it fills.
2. **Nothing is cancelled for you.** A new `buy()` does not replace a working
   `buy()`. You now have two orders resting and, if both fill, two entries.
3. **Two opposite orders on one bar are refused**, both of them, with OS7013
   naming both call sites and the bar. Which one the engine should honour has no
   defensible answer: source order is an accident of layout, and "the last one
   wins" silently changes meaning when somebody reorders two blocks.
4. **What should happen to the old order is a trading decision**, and the language
   does not have an opinion about your trading.

There are three sane policies, and a script should be written so a reader can tell
which one it is using at a glance.

| Policy | Written as | Suits |
|---|---|---|
| Cancel and replace | `cancel(tag)` then place the new one | A resting order that tracks a moving level |
| First come, first served | Guard with `not order.working(tag)` | An entry that is either taken at the price or not taken |
| Age out | Count the bars the order has been working and cancel it | A signal that goes stale |

The age-out pattern is the one most scripts want, and it is worth writing in full
because it shows how to count something about an order without asking the engine
to remember anything for you.

```
version 1

strategy("Limit entry that goes stale", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots")

waitBars = input(3, "Cancel the entry after this many bars", min = 1, max = 50)

atrValue = atr(14)
trend    = ema(close, 50)

wanted = close - 0.5 * atrValue
entry  = isNone(wanted) ? none : roundToTick(wanted)

// A plain var, reset whenever nothing is working, so it can only ever be
// counting the current order. It rolls back on a moving bar, so it counts bars
// and not ticks.
var barsWorking = 0

if order.working("entry")
    barsWorking = barsWorking + 1
else
    barsWorking = 0

if order.working("entry") and barsWorking >= waitBars
    cancel("entry")
else if close > trend and pos.isFlat and not isNone(entry) and order.pending == 0
    buy(qty = 1, limit = entry, tag = "entry")

plot(trend, "Trend", orange, width = 2)
plot(order.working("entry") ? entry : none, "Resting bid", aqua, style = "step")
```

Read the two branches in the order they are written. The cancel is tested first,
so on the bar an order ages out the script cancels and does not immediately place
another one at a stale price; the next bar re-evaluates from scratch. The `else
if` also keeps the two order calls from ever running on the same bar, which is the
mechanical way to stay clear of OS7013.

`cancelAll()` exists for the cases where the script has lost confidence in
everything it has working: a session ending, a data feed gap, a risk switch turned
off in the inputs. It cancels working orders only. It does not close a position,
because an order that has already filled is not a working order any more, and a
call named "cancel" that also liquidated would be the most expensive naming
mistake in the language.

## Exiting

| To | Call | Notes |
|---|---|---|
| Flatten everything | `close()` | Whatever is held, long or short |
| Flatten part | `close(qty = n)` | `n` is positive, whichever way the position points |
| Flatten one part by name | `close(tag = "runner")` | Closes the part carrying that tag |
| Attach a stop or target | `exit(...)` | Covered in the brackets page |

A partial close needs a whole, valid quantity like any other order, so size it and
round it rather than passing a fraction:

```
version 1

strategy("Scale out", overlay = true, precision = 2,
         capital = 500000, qty = 2, qtyType = "lots")

atrValue = atr(14)
target   = pos.isFlat ? none : pos.avgPrice + 2 * atrValue
goLong   = crossUp(ema(close, 9), ema(close, 21))

// One scale out per position, not one per bar that the target is exceeded.
var scaled = false

if pos.isFlat
    scaled = false

if goLong and pos.isFlat
    buy(qty = 2, tag = "entry")

// Half off at the first target, the rest left to the trend. abs() because
// pos.size is signed and an order quantity never is; roundToLot because half a
// lot does not exist.
else if pos.isLong and not scaled and not isNone(target) and high > target
    half = order.roundToLot(abs(pos.size) / 2)
    if half > 0
        close(qty = half)
        scaled = true

plot(target, "First target", lime, style = "step")
```

## Reversing

Three ways, and they are not the same trade.

| Way | What the account sees | When to use it |
|---|---|---|
| `order.reverse()` | One decision: flatten and open the same size the other way | A stop-and-reverse system that is never flat |
| `sell(qty = abs(pos.size) + newQty)` | One order that crosses zero, reported as one exit and one entry | When the new size differs from the old |
| `close()` on one bar, `sell()` on the next | Two decisions, with a bar of being flat between them | When the reversal should be reconsidered |

`order.reverse()` is the one to reach for when the strategy is always in the
market, because it says in one call what the other two spell out, and a reader
does not have to check the arithmetic to see that the size is unchanged.

```
version 1

strategy("Stop and reverse", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots", pyramiding = 1)

factor = input(3.0, "Band width, in ATR", min = 0.5, max = 20)
atrLen = input(10,  "ATR length", min = 1, max = 200)

// supertrend returns [line, direction]: direction is -1 long and 1 short, a
// number rather than a bool so that a flip reads as a change in it.
bands = supertrend(factor, atrLen)
band  = bands[0]
dir   = bands[1]

// bar.isFirst guards the flip test because != is total: on bar 0 the previous
// direction is absent, dir != dir[1] is true, and the strategy would trade a
// flip that never happened.
flipped = not bar.isFirst and dir != dir[1] and not isNone(dir)

if flipped and pos.isFlat
    if dir == -1
        buy(qty = 1, tag = "long")
    else
        sell(qty = 1, tag = "short")
else if flipped
    order.reverse(tag = "reversal")

plot(dir ==  -1 ? band : none, "Stop, long",  lime, width = 2)
plot(dir ==   1 ? band : none, "Stop, short", red,  width = 2)
```

## When the script computes its own side

`order.place` is the general form. It exists for scripts whose direction comes out
of a calculation rather than out of two branches, and it keeps such a script from
duplicating its entire entry block once for each direction.

```
version 1

strategy("Signed model", overlay = true, capital = 500000, qty = 1)

score = ema(close, 9) - ema(close, 21)
side  = isNone(score) ? "" : (score > 0 ? "buy" : "sell")

if side != "" and pos.isFlat and session.isOpen
    order.place(side, 1, tag = "model")
```

Use the bare functions where the direction is written in the source, and
`order.place` where it is not. A reader can see a `buy()` without running
anything; a reader of `order.place(side, ...)` has to work out what `side` holds,
and that work should buy something.

## Refusals, and how to read them

Every refused order reports a code and a reason, and none is dropped silently. The
codes you will actually meet:

| Code | Means | Usual cause |
|---|---|---|
| OS7002 | An order argument is absent | A stop or a size taken from a window that has not warmed up |
| OS7004 | Quantity is zero or negative | A size computed from a difference that went the wrong way |
| OS7005 | Quantity is not a multiple of the lot size | Units passed to an instrument that trades in lots |
| OS7006 | Price is not on a tick | A limit computed as a percentage and never rounded |
| OS7007 | A limit or stop order has no price | An order kind named without its price |
| OS7008 | The entry was refused by pyramiding | No position guard on the entry |
| OS7009 | Unknown order id | Cancelling something that already filled |
| OS7011 | The order needs more capital than the strategy has | Fixed unit sizing against a small `capital` |
| OS7012 | The instrument is outside its session | No `session.isOpen` guard |
| OS7013 | Two opposite orders on one bar | Two independent `if` blocks that can both be true |
| OS7014 | The destination rejected the order | A product the account cannot trade, or a margin shortfall |
| OS7015 | The strategy has no order destination | No paper engine or broker connection configured |

Two of these are worth a moment's thought rather than a quick fix. OS7008 is the
pyramiding limit doing its job: refusing is better than silently building a
position the declaration forbade, because the silent version reports a return the
stated rules never earned. OS7011 is the same argument about money: a backtest
that can spend capital it does not have reports a return nobody could have earned,
so the order is refused and the refusal is recorded, which keeps the equity curve
honest.

## See also

- [overview.md](./overview.md) for the loop these calls run inside
- [position-and-sizing.md](./position-and-sizing.md) for what to pass as `qty`
- [exits-and-brackets.md](./exits-and-brackets.md) for `exit` and `order.bracket`
- [costs-and-fills.md](./costs-and-fills.md) for where each of these orders is assumed to fill
- [../../spec/stdlib.md](../../spec/stdlib.md) for the full signature of every call named here
- [../../spec/errors.md](../../spec/errors.md) for the OS7xxx catalogue, with a before and after for each
- [../../examples/11-strategy-opening-range.oscript](../../examples/11-strategy-opening-range.oscript) for one entry per session, worked through
