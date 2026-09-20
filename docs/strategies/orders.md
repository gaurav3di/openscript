# Orders: legs, entering, exiting, reversing, cancelling

By the end of this page you will be able to declare the contracts a strategy
trades, place a market, limit or stop order on one of them, name it so a later bar
can find it, decide what happens when the next signal arrives while the last order
is still working, and flatten or reverse a position without the engine refusing
you.

> **Much of this page is marked planned.** A strategy's ledger, its legs and its
> book are what the marked calls are folded from, and no engine holds one in this
> release. A marked call is refused where you wrote it, with a message that says
> it is planned, rather than compiling and then failing to load. The six order
> functions, the three `order` calls that place an order and the five position
> facts read from the account's own row are not marked, because those run.

## The rule the whole page hangs on

**A strategy never places an order that computes a delta against the account's
position.** Every order states its own side and its own quantity outright. The
engine does not read the account's position, under `stdlib.md` section 17.1, and
what follows here is why that rule is worth the words.

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
| `leg.fixed(name, symbol, ...)` (planned) | Declare a leg on a contract named outright |
| `leg.relative(name, underlying, kind, ...)` (planned) | Declare a leg on a contract named by description |
| `buy(qty = the declaration's, limit = none, stop = none, tag = "", leg = the only leg)` | Enter or add to a long position in one leg |
| `sell(qty = ..., limit = none, stop = none, tag = "", leg = ...)` | Enter or add to a short position in one leg |
| `close(tag = none, qty = none, leg = ...)` | Flatten a leg, or the part carrying one tag |
| `exit(tag = "", qty = none, limit = none, stop = none, profit = none, loss = none, leg = ...)` | Set the leg's stop or target from a call site |
| `cancel(tag)` | Cancel a working order that has not filled |
| `cancelAll()` | Cancel every working order this strategy placed |
| `order.place(side, qty, type = "market", price = none, trigger = none, tag = "", leg = ...)` | The general form, for a script that computes its side |
| `order.reverse(qty = none, tag = "", leg = ...)` | Close a leg's position and open the same size the other way |
| `order.working(tag)` (planned) | Whether an order with that tag is live and unfilled |
| `order.pending` (planned) | How many orders are live and unfilled |

Six bare names cover almost every script, and the `order` namespace holds the rest.
That split is the library's general rule: a call a script reaches for on most days
is bare, and the long tail is namespaced.

**A default and an absent value are two different things, and an order is where
the difference costs money.** Leave an argument out and you get the default the
table prints: `buy()` is the size your declaration sets, and `buy(qty = 1)` with
neither price is a market order. Write an argument whose value comes out absent
and you get the other case, which is refused with OS7002 naming the argument.
`buy(qty = 1, stop = lowest(low, 20))` is refused on every bar until the window
has twenty lows behind it, rather than going out as a market order at a price
nobody chose. Guard it, and the guard is the whole fix:

```
version 1
strategy("Stop entry", overlay = true, precision = 2, qty = 1)

trigger = lowest(low, 20)
if not isNone(trigger) and close > ema(close, 50)
    buy(qty = 1, stop = trigger)
```

## Legs: the contracts a strategy trades

A strategy trades the legs it declared. A leg names a contract outright with
`leg.fixed` or describes one with `leg.relative`, and the host resolves the
description before bar 0; a file that declares no leg has exactly one leg, the
instrument its chart is showing, and every order acts on it with no leg named
(`stdlib.md` sections 17.1 and 17.6). That last shape is almost every script, and
the examples below are written in it unless they say otherwise.

```
leg.fixed("near",  "AAA-F1")
leg.fixed("far",   "AAA-F2")
```

A leg declaration is one of the top level only calls that `language.md` section
15.3 lists, under OS3006, for the same reason a plot is: the set of contracts a
strategy trades is part of its fixed shape, known before bar 0, and a leg that
appeared on some bars and not others would leave the run's record with nothing
stable to key on. You cannot hide a leg by passing `none`: declare it at the top
level and decide per bar whether to send it an order. Every argument of a leg
declaration is part of that fixed shape, so each must be a compile-time constant:
a literal, arithmetic over literals, or an `input()`. A bar-dependent one is
OS3003. Two legs declared with one name is OS3017.

**Every order function names the leg it acts on.** In a file with one leg the
`leg` argument defaults to that leg and is never written. In a file with more than
one, leaving it out is OS3012: there is no leg the engine could invent. A `leg`
that is not one of the declared names is OS3008, and the message lists the names
that are.

**In this release, writing `leg` at all is OS3023.** The declarations above are
planned, so no file can declare a leg, so there is no name the argument could
carry. It is refused whatever you write there and whether you wrote the name or
computed it, because the value is not what is wrong: the fix is to take the
argument out and the order acts on the only leg there is. Before this was
refused, `buy(qty = 1, leg = "a")` followed by `close(leg = "b")` flattened the
position and said nothing.

### A contract named by description

`leg.fixed` names a contract the host already knows. `leg.relative` names one by
description and the host resolves it. A relative contract is described by the
fields of `stdlib.md` section 17.6, which is also where each field's meaning and
the arguments' own refusals are fixed.

The engine never parses a symbol and never builds one. A symbol format built for
one market is meaningless in another, and portability is the whole objective, so
the description goes to the host and a resolved contract comes back. A description
the host cannot resolve is OS6007, before the first bar, and the strategy does not
start.

**A relative contract resolves once, under `host-interface.md` section 9.4.**

This is not a preference. It is how you avoid closing a position you do not hold.
Take a leg described as the nearest expiry, at the money, on the call side.
Entered on a quiet morning, it resolves to one contract and the entry order
carries that contract's name. If the same description were evaluated again at
exit, after the underlying has moved a hundred points, "at the money" now names a
different strike. The strategy would send a closing order for a contract it never
entered, which either fails or, worse, opens a brand new position in the wrong
direction, while the position it actually holds stays open with nothing managing
it. You would end the day with two positions where you meant to have none.

That is what the rule cited above buys, and `leg.symbol()` reads back the
contract the orders actually carried.

| Call | Returns | Reads back |
|---|---|---|
| `leg.symbol(name)` (planned) | `string` | The resolved contract, which is what the orders carried |
| `leg.exchange(name)` (planned) | `string` | The exchange the orders were sent to |
| `leg.product(name)` (planned) | `string` | The product actually sent |
| `leg.expiry(name)` (planned) | `number` | The resolved contract's expiry, absent for a contract with none |
| `leg.strike(name)` (planned) | `number` | The resolved contract's strike, absent for a contract with none |

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

**No order crosses zero**, under `stdlib.md` section 17.1. An instruction that
would take a leg from long to short is sent as two orders: one that closes the
outgoing position, one that opens the replacement. Each carries its own position
reference.

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
| `order.working(tag)` (planned) | `series bool` | Whether one named order is live and unfilled |
| `order.pending` (planned) | `series number` | How many orders are live in total |
| `order.id(tag)` (planned) | `series string` | The destination's own order id, `""` before it answers |
| `order.status(tag)` (planned) | `series string` | The ledger's folded status, from the vocabulary of `stdlib.md` section 17.7 |
| `order.filled(tag)` (planned) | `series number` | Cumulative filled quantity, `0` before the first fill |
| `order.avgFill(tag)` (planned) | `series number` | Average fill price, absent before the first fill |
| `order.rejection(tag)` (planned) | `series string` | The destination's own rejection text, `""` when there is none |

Every one of those reads the strategy's own ledger and never the destination.
`order.filled(tag)` is **cumulative and never a delta**, which is the single most
important thing to know about reading orders back, and
[reading-the-books.md](./reading-the-books.md) is the page that explains why.

What these reads do with a tag that names no row, and what they read once an
order has finished, is `stdlib.md` section 17.3. Cancelling something that is no
longer live is a different matter: it is refused with OS7009 rather than ignored,
because a script acting on an order that has gone has lost track of its own state
and will keep doing so. The guard for it is `order.working(tag)`, which is planned;
until it lands, cancel on the same condition the order was placed on, or call
`cancelAll()`, which acts on whatever is working and refuses nothing.

**What a tag argument means is written in its default**, and the rule is worth
learning once because it is readable in every signature on this page. A tag that
defaults to the empty string is a **label**: the call carries it to the
destination and to the report, it names nothing that has to exist, and a bracket
whose tag matches no order is an ordinary call. A tag that is required, or that
defaults to absence, is a **reference**: it names something the strategy already
has, and naming nothing is a mistake. `cancel` requires its tag and `close`
defaults its to absence, and those two are the references. The reading calls
above take a reference too, and answer with their documented empty value instead
of refusing, because reading is how a script finds out; `stdlib.md` section 17.2
states the rule and 17.3 states that one exception.

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
| Flatten part | `close(qty = n)` | `n` is positive, whichever way the position points, and no larger than what is held |
| Flatten one part by name | `close(tag = "runner")` | Closes the part carrying that tag |
| Set a stop or a target | `exit(...)` | Covered in the exits page |

A tag on `close` is a **reference**: it names the part of the position that tag
entered, so it has to be a tag some order in the file is placed with. A tag
nothing places is OS7016, reported at the call before any bar runs, because such
a call could only send nothing on every bar and say nothing while the position
stayed open. Closing a tag that has already flattened is not that: it sends
nothing, says nothing, and is how a strategy is ordinarily written.

**A quantity written on a `close` is the one size the engine holds to a
ceiling.** No order crosses zero, so a close larger than what it is closing
would flatten the position and open the opposite one in a single order, and a
leg that was long would end the bar short under a call named `close`. That is
OS7017, it names what was asked for and what is left to close, and the call
sends nothing. The engine does not quietly send what is there instead: that
would be a quantity you did not write, and your script would carry on believing
it had closed the one you did.

**What a close is measured against is what is left to close, which is what has
settled less everything already working against it.** A position moves when a
fill settles, so an order your script sent a line ago has not filled yet and the
leg still reads what it held before it left. Two closes on one bar would each be
sized to the whole position and the second would take the leg short. So would a
close on the bar after one whose close the destination has not answered, and
that one is worse, because it repeats: `close()` under `if pos.size > 0` against
a slow destination sends one close per bar for the length of the run, and six
bars leave you twelve short of a leg that opened long three.

What is still working is what your ledger says is working: an order that has not
ended and has not fully filled, counted by the part of it that has not filled.
Three sold with one filled leaves two working, so the next close sends two. A
rejection, a cancellation or an expiry releases what it was holding, and you may
close again. An order that is still at the destination holds its part until one
of those comes back, which is why `cancel()` is the way out of a destination
that never answers.

So the second of two bare closes sends nothing, a second `close(qty = 2)` on a
leg of three is OS7017 with one left rather than three, and a close on a bar
whose earlier close is still working sends nothing at all. The same count covers
a `sell` that reduces a long leg and the closing half of `order.reverse`. **A
bar declared `onUnconfirmed` is one bar for this count and for nothing else**:
the orders of its earlier executions really were handed over, so they are
working like any other. It is not a general rule about the bar, and an entry is
not held to it: `buy(qty = 3)` on a bar executed four times sends four orders and
the leg holds twelve, which is why you guard an entry with `bar.isConfirmed`.

The two rules meet in a place worth knowing about before you meet it.
`close(tag = "runner")` on a tag that has already flattened is silent, and
`close(tag = "runner", qty = 1)` on that same tag is refused. That is not an
inconsistency. A quantity is something you wrote, so it is a claim about your own
position and the claim can be wrong; a call with no quantity is a request for
whatever is there, and there is nothing in it to be wrong about. If a scale-out
can run twice on one position, guard it on `pos.size` rather than sizing it and
hoping.

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

The split is arithmetic on the order's own quantity, so it happens where the
declaration counts in units. In lots, cash or an equity percent the quantity you
write and the position the engine holds are two different kinds of number, the
lot size that would join them is not a fact the engine is given, and such an
order is sent as written: one order, one position reference. That is the same
limit OS7017 is narrowed by, and `order.reverse()` is the spelling that works in
every unit, because the engine sizes both of its orders itself.

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
| OS7009 | Unknown order tag | Cancelling an order that has already filled, or a tag with a typo in it |
| OS7016 | A close names a tag nothing places | A typo in the tag of a `close`, caught at compile time |
| OS7017 | A close states more than it is closing | A scale-out size computed from a position that has already shrunk |
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

**Not raised yet.** OS7005, OS7011, OS7012, OS7014 and OS7015 are in the
catalogue and nothing raises them. Nothing compares an order's quantity with the
lot size its leg trades in. Nothing compares an order's cost with the capital
the strategy has. Nothing compares the bar's time with the instrument's session
before an order is sent. A destination's own refusal is folded into the ledger
row as a status and its text, and is reported against no line. A strategy with
nowhere to send orders places intents that reach nobody.

## Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| A `sell` went short instead of flattening | `sell` subtracts, it does not close | `close()` |
| Two entries where the script meant one | Guarded on `pos.isFlat` alone while an order was still working | Add `and order.pending == 0` |
| OS3012 on every order | More than one leg declared and no `leg` named | Name the leg on every order |
| OS3023 on an order that names a `leg` | Leg declarations are planned, so this file declares none and the name has nothing to refer to | Take the `leg` argument out; the order acts on the only leg there is |
| A close is sent once and then never again | The first one is still at the destination, so there is nothing left to close | `cancel(tag)` releases it, or wait for the frame that ends it |
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
