# Orders: legs, entering, exiting, reversing, cancelling

By the end of this page you will be able to declare the contracts a strategy
trades, place a market, limit or stop order on one of them, name it so a later bar
can find it, decide what happens when the next signal arrives while the last order
is still working, and flatten or reverse a position without the engine refusing
you.

## The rule the whole page hangs on

**A strategy never places an order that computes a delta against the account's
position.** Every order states its own side and its own quantity outright.

The reason is not tidiness, and it is worth reading before the tables. An account
position is held per contract, not per strategy. A second strategy on the same
contract, a trade you placed by hand from a phone, or this same script started
twice all land in that one row. An order that reads the row and sends the
difference is therefore computing against somebody else's trade.

Work it through once. Two strategies trade the same contract. The first wants to
be long two lots, the second wants to be short two lots. The account row nets to
zero. Each strategy reads it, sees that it is not holding what it wants, and sends
a correction. Each correction moves the row, so each strategy reads a row the
other just changed, and the two undo each other for the rest of the session.
Neither one is wrong from where it is standing, both are placing orders all day,
and the account holds nothing either of them intended.

Now add the manual trade instead. You are long two lots by hand. A strategy that
targets a long of two lots reads the row, sees its target already met, and never
enters. It reports no trade and no loss, and the position it is credited with is
yours. When you flatten by hand, the strategy has a stop resting against a
position that no longer exists.

This is a rule rather than a default because the failure is silent. It costs
nothing on the day only one strategy is in the market, and it costs the whole
position on the day two are. What follows from it is the rest of this page: every
order names its own side and size, the strategy folds its position from its own
settled fills, and the account's row is reported rather than divided.

## The whole surface, in one table

Everything below is available only in a `strategy()` file. In a `study()` file the
compiler refuses the call with OS7001 and names the declaration to change.

| Call | For |
|---|---|
| `leg.fixed(name, symbol, ...)` | Declare a leg on a contract named outright |
| `leg.relative(name, underlying, expiry, strike, right, ...)` | Declare a leg on a contract named by description |
| `buy(qty = the declaration's, limit = none, stop = none, tag = "", leg = the only leg)` | Enter or add to a long position in one leg |
| `sell(qty = ..., limit = none, stop = none, tag = "", leg = ...)` | Enter or add to a short position in one leg |
| `close(tag = none, qty = none, leg = ...)` | Flatten a leg, or the part carrying one tag |
| `exit(tag = "", qty = none, limit = none, stop = none, profit = none, loss = none, leg = ...)` | Set the leg's stop or target from a call site |
| `cancel(tag)` | Cancel a working order that has not filled |
| `cancelAll()` | Cancel every working order this strategy placed |
| `order.place(side, qty, type = "market", price = none, trigger = none, tag = "", leg = ...)` | The general form, for a script that computes its side |
| `order.reverse(qty = none, tag = "", leg = ...)` | Close a leg's position and open the same size the other way |
| `order.working(tag)` | Whether an order with that tag is live and unfilled |
| `order.pending` | How many orders are live and unfilled |

Six bare names cover almost every script, and the `order` namespace holds the rest.
That split is the library's general rule: a call a script reaches for on most days
is bare, and the long tail is namespaced.

## Legs: the contracts a strategy trades

A strategy holds **one position per leg**. A leg is one contract the strategy
trades, named by a string and declared before the run starts.

A file that declares no leg has exactly one leg, the instrument its chart is
showing, and every order function acts on it with no leg named. That is the shape
of almost every script, and the examples below are written in it unless they say
otherwise.

```
leg.fixed("near",  "AAA-F1")
leg.fixed("far",   "AAA-F2")
```

Legs are declared at the top level and never inside a block or a function, under
OS3006, for the same reason a plot is: the set of contracts a strategy trades is
part of its fixed shape, known before bar 0, and a leg that appeared on some bars
and not others would leave the run's record with nothing stable to key on. Every
argument of a leg declaration is part of that fixed shape, so each must be a
compile-time constant: a literal, arithmetic over literals, or an `input()`. A
bar-dependent one is OS3003. Two legs declared with one name is OS3017.

**Every order function names the leg it acts on.** In a file with one leg the
`leg` argument defaults to that leg and is never written. In a file with more than
one, leaving it out is OS3012: there is no leg the engine could invent. A `leg`
that is not one of the declared names is OS3008, and the message lists the names
that are.

### A contract named by description

`leg.fixed` names a contract the host already knows. `leg.relative` names one by
description and the host resolves it:

| Argument | Says |
|---|---|
| `underlying` | The instrument the contract derives from |
| `expiry` | A rank: `0` is the nearest expiry, `1` the one after it |
| `strike` | An offset in strikes from the money: `0` is at the money, positive is above |
| `right` | `"none"`, `"call"` or `"put"` |

The engine never parses a symbol and never builds one. A symbol format built for
one market is meaningless in another, and portability is the whole objective, so
the description goes to the host and a resolved contract comes back. A description
the host cannot resolve is OS6007, before the first bar, and the strategy does not
start.

**A relative contract resolves exactly once, before bar 0, and the resolved
identity is what every later action uses.**

This is not a preference. It is how you avoid closing a position you do not hold.
Take a leg described as the nearest expiry, at the money, on the call side.
Entered on a quiet morning, it resolves to one contract and the entry order
carries that contract's name. If the same description were evaluated again at
exit, after the underlying has moved a hundred points, "at the money" now names a
different strike. The strategy would send a closing order for a contract it never
entered, which either fails or, worse, opens a brand new position in the wrong
direction, while the position it actually holds stays open with nothing managing
it. You would end the day with two positions where you meant to have none.

So the resolved identity is persisted with the run. A restart uses the contract
that was entered rather than the contract that is nearest now, and `leg.symbol()`
reads back the contract the orders actually carried.

| Call | Returns | Reads back |
|---|---|---|
| `leg.symbol(name)` | `string` | The resolved contract, which is what the orders carried |
| `leg.exchange(name)` | `string` | The exchange the orders were sent to |
| `leg.product(name)` | `string` | The product actually sent |
| `leg.expiry(name)` | `number` | The resolved contract's expiry, absent for a contract with none |
| `leg.strike(name)` | `number` | The resolved contract's strike, absent for a contract with none |

Those five are fixed for the run rather than per bar. Print them on the first bar
of a live strategy and the log answers "what did it actually trade" without
anybody having to reason about what was nearest that morning.

## One position per leg, and no order crosses zero

`buy(qty)` adds to a leg's position, `sell(qty)` subtracts from it, and `close()`
flattens it. Every one of those counts the strategy's own settled fills and
nothing else.

One position per leg, rather than one net book across every leg, because legs are
different contracts. Adding a position in one to a position in another produces a
number that is not a quantity of anything and cannot be sent anywhere.

**No order crosses zero.** An instruction that would take a leg from long to short
is sent as two orders: one that closes the outgoing position, one that opens the
replacement. Each carries its own position reference.

```
// The leg is long 5 here.
sell(qty = 8)        // two orders: close 5, then open a short 3
close()              // flat, whatever was held
```

A single order that crossed zero would leave a late fill with no way to say which
of the two positions it settled. During a flip a leg holds both at once, the
outgoing one and its replacement, and a fill that arrives after the flip has to
settle the position its own order named rather than whichever position is current.
That is what the second order buys you, and it is why the split is the engine's
job rather than a habit you are asked to remember.

One consequence catches everyone once. `sell()` does not mean "close a long". It
means "subtract from this leg's position", which closes a long if one is open and
keeps going into a short if the quantity is larger. To flatten, say so: `close()`.

**Direction is chosen by the function, never by the sign of the quantity.** A
negative quantity is a calculation that went the wrong way, not an order in the
other direction, and a quantity of zero is never what a script means. Both are
refused with OS7004, naming the function and the quantity that reached it.

```
wantedSize = 3 - pos.size          // this strategy's own position, not the account's

if wantedSize > 0
    buy(qty = wantedSize)
else if wantedSize < 0
    sell(qty = -wantedSize)
```

Read that example twice, because it is the one place the rule at the top of this
page is easy to misread. Sizing against `pos.size` is fine: `pos.size` is folded
from this strategy's own fills and describes nothing but this strategy. What the
language has no call for is the account's quantity, and there is no way to write
the same two lines against the account row, because a script that could read it
would compute against it.

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
a small tick from "nobody said". Guard it once and use the result.

```
version 1

strategy("Pullback limit", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots")

offsetAtr = input(0.5, "Enter this far below the close, in ATR", min = 0.1, max = 5)

atrValue = atr(14)
trend    = ema(close, 50)

// Computed once, at the top level, and tested before it is used. Every price
// that reaches an order function in this file has been through this gate.
wanted     = close - offsetAtr * atrValue
entryPrice = isNone(wanted) ? none : roundToTick(wanted)

if close > trend and pos.isFlat and not isNone(entryPrice) and not order.working("entry")
    buy(qty = 1, limit = entryPrice, tag = "entry")

plot(trend, "Trend", orange, width = 2)
plot(order.working("entry") ? entryPrice : none, "Resting bid", aqua, style = "step")
```

A limit or stop order named without its price is refused with OS7007, rather than
being filled in from the bar's close. An order kind wearing another kind's
behaviour is the worst kind of silent default: the report says "limit" and the
fills say "market".

## Order identity

An order is named by a **tag**, a string the script chooses. The tag is how a later
bar refers to an order that is still working, how `close(tag = ...)` picks out one
part of a position, and how every reading call finds a row in the strategy's own
ledger.

```
buy(qty = 2, limit = entryPrice, tag = "pullback")
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

The destination's own order id does exist, once the destination has answered, and
`order.id(tag)` reads it back as an opaque string the engine never parses. It is
what you quote when you ring somebody about an order, and it is `""` until there
is an answer.

| Call | Returns | Reads |
|---|---|---|
| `order.working(tag)` | `series bool` | Whether one named order is live and unfilled |
| `order.pending` | `series number` | How many orders are live in total |
| `order.id(tag)` | `series string` | The destination's own order id, `""` before it answers |
| `order.status(tag)` | `series string` | The ledger's folded status |
| `order.filled(tag)` | `series number` | Cumulative filled quantity, `0` before the first fill |
| `order.avgFill(tag)` | `series number` | Average fill price, absent before the first fill |
| `order.rejection(tag)` | `series string` | The destination's own rejection text, `""` when there is none |

Every one of those reads the strategy's own ledger and never the destination.
`order.filled(tag)` is **cumulative and never a delta**, which is the single most
important thing to know about reading orders back, and
[reading-the-books.md](./reading-the-books.md) is the page that explains why.

An unknown tag in any of them is OS7009, on the same ground as `cancel`: a tag
that names nothing is a script that has lost track of its own orders. Cancelling
something that is no longer live is refused with OS7009 too, not ignored, because
a script mutating an order that has gone has lost track of its own state and will
keep doing so. Test first with `order.working(tag)`.

Two habits that pay for themselves: give every order a tag, even when the script
has only one, and make the tag describe the intention (`"entry"`, `"stop"`,
`"target"`, `"reversal"`) rather than the bar it was placed on. The trade list, the
ledger and the refusal messages all quote the tag back at you.

## When an order is still working and the next signal arrives

This is the case that separates a strategy that survives contact with a live feed
from one that does not, so read the next three paragraphs twice.

The language fixes three things and deliberately leaves the fourth to you.

1. **A working order is not a position.** `pos.size` counts settled fills, not
   intentions. A resting limit order changes nothing in the `pos` namespace until
   it fills.
2. **Nothing is cancelled for you.** A new `buy()` does not replace a working
   `buy()`. You now have two orders resting and, if both fill, two entries.
3. **Two opposite orders on one leg on one bar are refused**, both of them, with
   OS7013 naming both call sites and the bar. Which one the engine should honour
   has no defensible answer: source order is an accident of layout, and "the last
   one wins" silently changes meaning when somebody reorders two blocks. Two
   opposite orders on two different legs are ordinary: that is what a two-sided
   position is.
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

wanted     = close - 0.5 * atrValue
entryPrice = isNone(wanted) ? none : roundToTick(wanted)

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
else if close > trend and pos.isFlat and not isNone(entryPrice) and order.pending == 0
    buy(qty = 1, limit = entryPrice, tag = "entry")

plot(trend, "Trend", orange, width = 2)
plot(order.working("entry") ? entryPrice : none, "Resting bid", aqua, style = "step")
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
| Flatten a leg | `close()` | Whatever is held, long or short |
| Flatten part | `close(qty = n)` | `n` is positive, whichever way the position points |
| Flatten one part by name | `close(tag = "runner")` | Closes the part carrying that tag |
| Set a stop or a target | `exit(...)` | Covered in the exits page |

A partial close needs a whole, valid quantity like any other order, so size it and
round it rather than passing a fraction:

```
version 1

strategy("Scale out", overlay = true, precision = 2,
         capital = 500000, qty = 2, qtyType = "lots")

atrValue    = atr(14)
targetLevel = pos.isFlat ? none : pos.avgPrice + 2 * atrValue
goLong      = crossUp(ema(close, 9), ema(close, 21))

// One scale out per position, not one per bar that the target is exceeded.
var scaled = false

if pos.isFlat
    scaled = false

if goLong and pos.isFlat
    buy(qty = 2, tag = "entry")

// Half off at the first target, the rest left to the trend. abs() because
// pos.size is signed and an order quantity never is; roundToLot because half a
// lot does not exist.
else if pos.isLong and not scaled and not isNone(targetLevel) and high > targetLevel
    half = order.roundToLot(abs(pos.size) / 2)
    if half > 0
        close(qty = half)
        scaled = true

plot(targetLevel, "First target", lime, style = "step")
```

## Reversing

Three ways, and they are not the same trade.

| Way | What happens | When to use it |
|---|---|---|
| `order.reverse()` | One decision, two orders: close the position, open the same size the other way | A stop-and-reverse system that is never flat |
| `sell(qty = abs(pos.size) + newQty)` | One instruction the engine splits into two orders, because no order crosses zero | When the new size differs from the old |
| `close()` on one bar, `sell()` on the next | Two decisions, with a bar of being flat between them | When the reversal should be reconsidered |

The first two produce the same two orders and the same two position references.
`order.reverse()` is the one to reach for when the strategy is always in the
market, because it says in one call what the other two spell out, and a reader does
not have to check the arithmetic to see that the size is unchanged.

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
`order.place` where it is not. A reader can see a `buy()` without running anything;
a reader of `order.place(side, ...)` has to work out what `side` holds, and that
work should buy something.

## Refusals, and how to read them

Every refused order reports a code and a reason, and none is dropped silently. The
codes you will actually meet:

| Code | Means | Usual cause |
|---|---|---|
| OS7002 | An order argument is absent | A stop or a size taken from a window that has not warmed up |
| OS7004 | Quantity is zero or negative | A size computed from a difference that went the wrong way |
| OS7005 | Quantity is not a multiple of the lot size | Units passed to an instrument that trades in lots |
| OS7006 | Price is not on a tick | A limit computed as a percentage and never rounded |
| OS7007 | A resting order has no price | An order kind named without its price |
| OS7008 | The entry was refused by pyramiding | No position guard on the entry |
| OS7009 | Unknown order tag | Cancelling or reading something that already filled |
| OS7011 | The order needs more capital than the strategy has | Fixed unit sizing against a small `capital` |
| OS7012 | The instrument is outside its session | No `session.isOpen` guard |
| OS7013 | Two opposite orders on one leg on one bar | Two independent `if` blocks that can both be true |
| OS7014 | The destination rejected the order | A product the account cannot trade, or a margin shortfall |
| OS7015 | The strategy has no order destination | No paper engine and no connection configured |

Three of these are worth a moment's thought rather than a quick fix. OS7008 is the
pyramiding limit doing its job: refusing is better than silently building a
position the declaration forbade, because the silent version reports a return the
stated rules never earned. OS7011 is the same argument about money: a backtest that
can spend capital it does not have reports a return nobody could have earned, so
the order is refused and the refusal is recorded, which keeps the equity curve
honest. OS7014 carries the destination's own words rather than a paraphrase of
them, because the destination is the only party that knows why it refused, and
`order.rejection(tag)` reads that text back.

## Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| A `sell` went short instead of flattening | `sell` subtracts, it does not close | `close()` |
| Two entries where the script meant one | Guarded on `pos.isFlat` alone while an order was still working | Add `and order.pending == 0` |
| OS3012 on every order | More than one leg declared and no `leg` named | Name the leg on every order |
| A closing order for a contract the strategy never held | A relative contract re-described at exit instead of read back | Read `leg.symbol(name)`; the resolution is fixed before bar 0 |
| The strategy never enters and reports no loss | An order that computed against the account row | Nothing to fix in the language: no call returns that row |
| Orders appear on history and not live | The condition is true intrabar and false at the close | Nothing to fix, that is the deferral working |

## See also

- [overview.md](./overview.md) for the per-bar loop these calls run inside
- [reading-the-books.md](./reading-the-books.md) for the ledger these orders land in, and why a fill can be reported twice
- [position-and-sizing.md](./position-and-sizing.md) for what to pass as `qty`
- [exits-and-brackets.md](./exits-and-brackets.md) for stops, targets, trails and the combined rules
- [costs-and-fills.md](./costs-and-fills.md) for where each of these orders is assumed to fill
- [../../spec/stdlib.md](../../spec/stdlib.md) section 17 for the full signature of every call named here
- [../../spec/errors.md](../../spec/errors.md) for the OS7xxx catalogue, with a before and after for each
- [../../examples/README.md](../../examples/README.md) for the worked strategies
