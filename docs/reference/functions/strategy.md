# Strategy functions

By the end of this page you will be able to place, bracket and cancel orders,
size a position from cash or from risk, read everything that is knowable about
the open position and the run so far, and know exactly when a signalled order
is filled.

Everything on this page is available only in a `strategy()` file. Calling one of
these from a `study()` file is OS7001, with the fix naming the declaration to
change. The same file plots and trades, so the numbers on the chart and the
numbers in the backtest cannot disagree.

## The position model

A strategy trades the legs it declared. A leg names a contract outright with
`leg.fixed` or describes one with `leg.relative`, and the host resolves the
description before bar 0; a file that declares no leg has exactly one leg, the
instrument its chart is showing, and every order acts on it with no leg named
(`stdlib.md` sections 17.1 and 17.6).

`buy(qty)` adds to a leg's position, `sell(qty)` subtracts from it, and `close()`
flattens it. What a strategy holds, what happens to an instruction that would
take a leg through zero, and what the account's own position has to do with any
of it are the position model of `stdlib.md` section 17.1.

An order is filled according to the declaration's `fillOn` option, with the
declared slippage and commission applied. An order function given an absent
price or an absent quantity does not place a malformed order and does not
substitute a value: it rejects with OS7002, naming the argument that was absent.
An order is the one place in the language where doing nothing quietly is worse
than stopping loudly.

## Declaring legs

| Call | For |
|---|---|
| `leg.fixed(name, symbol, ...)` (planned) | Declare a leg on a contract named outright |
| `leg.relative(name, underlying, kind, ...)` (planned) | Declare a leg on a contract named by description |
| `leg.symbol(name)`, `leg.exchange(name)`, `leg.product(name)` (planned) | Read back what the orders actually carried |
| `leg.expiry(name)`, `leg.strike(name)` (planned) | Read back the resolved contract's expiry and strike |

Their arguments, and what each field of a relative description means, are
`stdlib.md` section 17.6. Where a leg may be written is the placement list of
`language.md` section 15.3, and a relative contract resolves once under
`host-interface.md` section 9.4. A description the host cannot resolve is OS6007
before the first bar.

## Trading options on the declaration

`strategy()` accepts every option `study()` accepts and adds these. All of them
must be compile-time constants: a literal, arithmetic over literals, or an
`input()`.

| Option | Type | Default | Means |
|---|---|---|---|
| `capital` | `number` | `100000` | Starting equity for the backtest |
| `currency` | `string` | `""` | Display label for money in the report |
| `qty` | `number` | `1` | Default order size when an order names none |
| `qtyType` | `string` | `"units"` | `"units"`, `"lots"`, `"cash"` or `"equityPercent"` |
| `product` | `string` | `"intraday"` | `"intraday"` or `"overnight"` |
| `fillOn` | `string` | `"nextOpen"` | `"nextOpen"` or `"close"`, where a signalled order is filled |
| `slippage` | `number` | `0` | Ticks of adverse slippage applied to every fill |
| `commission` | `number` | `0` | Cost per the `commissionType` unit |
| `commissionType` | `string` | `"perTrade"` | `"perTrade"`, `"perUnit"` or `"percent"` |
| `pyramiding` | `number` | `1` | Maximum entries in one direction before entries are refused |
| `closeOnSessionEnd` | `bool` | `false` | Flatten at the session close |

`fillOn` defaults to `"nextOpen"` rather than `"close"` because a decision made
from a bar's close cannot be filled at that same close in the real market, and a
backtest whose default is optimistic is a backtest that lies. Set it to
`"close"` only when the fill really can happen there, and know that every
comparison against another strategy's numbers now depends on that choice.

---

## 1. Placing orders

### `buy(qty = the declaration's, limit = none, stop = none, tag = "", leg = the only leg)`

Enter or add to a long position in one leg.
Parameters: `qty` `number` default the declaration's `qty`; `limit` `number`
default `none`; `stop` `number` default `none`; `tag` `string` default `""`;
`leg` `string` default the only leg.
Returns nothing.

```
buy(qty = 1, tag = "breakout")
```

### `sell(qty = the declaration's, limit = none, stop = none, tag = "", leg = the only leg)`

Enter or add to a short position in one leg.
Parameters: `qty` `number` default the declaration's `qty`; `limit` `number`
default `none`; `stop` `number` default `none`; `tag` `string` default `""`;
`leg` `string` default the only leg.
Returns nothing.

```
sell(qty = lots * chart.lotSize)
```

With neither `limit` nor `stop`, `buy` and `sell` place a market order. With
`limit` alone they place a limit order, with `stop` alone a stop order, and with
both a stop-limit order. One function with optional prices rather than six named
functions, because the trader's decision is direction and the price is a
qualifier on it.

| `limit` | `stop` | Order placed |
|---|---|---|
| absent | absent | Market |
| given | absent | Limit |
| absent | given | Stop |
| given | given | Stop-limit |

### `close(tag = none, qty = none, leg = the only leg)`

Flatten a leg, or the part of its position carrying one tag.
Parameters: `tag` `string` default `none`; `qty` `number` default `none`, which
means all of it; `leg` `string` default the only leg.
Returns nothing.

```
close()
```

`close` read bare is the bar's closing price; `close(...)` written as a call is
this function. The checker tells them apart by syntax, and both spellings are
the ones a trader expects.

The `tag` here defaults to absence rather than to the empty string, and that is
what says it is a reference: it names the part of the position that tag entered,
so it has to be a tag some order in the file is placed with. One that nothing
places is OS7016, at the call, before any bar runs, because such a call could
only send nothing on every bar while the position stayed open. A tag that is
placed somewhere and holds nothing right now is not that: the call sends nothing,
says nothing, and closing the same tag twice is safe to write.

**The side is the side that reduces what you are flattening.** With no tag that
is the leg, and with one it is the part that tag holds, which can be the other
way round: scale into a long under one tag and hedge it short under another, and
the leg is long while the part is short. `close(tag = "hedge")` there is a buy,
because that is what flattens the hedge, and the leg's net says nothing about it.
A part holding nothing has no side, so the call sends nothing.

What that close may send is what the part holds, less whatever is already coming
off it, and the leg is a ceiling on it only where the two are on one side: a
part on the other side is closed by the whole of itself, because closing it
moves the leg away from zero rather than through it.

`qty` may not be larger than what this close is closing, which is the whole leg
where no tag is named and the part one tag entered where one is, less whatever is
already working against it. Larger is OS7017, naming what was asked for and what
is left, and the call sends nothing: no order crosses zero, and a close bigger
than the position would flatten it and open the opposite one in a single order. A
quantity smaller than what is left is an ordinary partial close.

Because the count is of what is left, two closes on one bar send one position
between them: the second bare close sends nothing, and a second stated quantity
is held against what the first one left. The same is true of a close on the bar
after one whose close is still at the destination, which is the case that
repeats: a position moves only when a fill settles, so `pos.size` still reads
what it held, and a close on every bar would send the position once per bar.
What is still working is an order that has not ended and has not fully filled,
counted by the part of it that has not filled, so a partial fill, a rejection, a
cancellation and an expiry each release their share and let you close again. The comparison with a stated quantity is
made in full only where the declaration counts in units, because a position is
folded from filled quantities and a quantity you state is in the declaration's
own unit. The part of it that needs no conversion is made in every unit: a
quantity stated against a part that holds nothing is refused whatever you
declared.

Written with a quantity, therefore, the call is not idempotent:
`close(tag = "runner")` on an already flattened tag is silent and
`close(tag = "runner", qty = 1)` on it is refused. A quantity is something you
wrote, so it is a claim about your own position; a call with no quantity asks
for whatever is there.

### `exit(tag = "", qty = none, limit = none, stop = none, profit = none, loss = none, leg = the only leg)`

Set the leg's stop or target from a call site.
Parameters: `tag` `string` default `""`; `qty` `number` default `none`; `limit`
`number` default `none`; `stop` `number` default `none`; `profit` `number`
default `none`; `loss` `number` default `none`; `leg` `string` default the only
leg.
Returns nothing.

```
exit(tag = "breakout", profit = atr(14) * 3, loss = atr(14))
```

Prices may be given as absolute prices (`limit`, `stop`) or as distances from
the entry (`profit`, `loss`, in the instrument's own price units). Giving both
an absolute and a distance for the same side is OS3010, because the two would
have to be reconciled and any rule for doing that would surprise somebody.

A trailing stop is not one of these arguments. It is `leg.trail` of
`stdlib.md` section 17.9.

### `cancel(tag)`

Cancel a working order that has not filled.
Parameters: `tag` `string` required.
Returns nothing.

```
cancel("breakout")
```

### `cancelAll()`

Cancel every working order this strategy placed.
Parameters: none.
Returns nothing.

```
if session.isLastBar
    cancelAll()
```

---

## 2. The `order` namespace

### `order.place(side, qty, type = "market", price = none, trigger = none, tag = "", leg = the only leg)`

The general form, for a script that computes its side rather than writing it.
Parameters: `side` `string` required; `qty` `number` required; `type` `string`
default `"market"`; `price` `number` default `none`; `trigger` `number` default
`none`; `tag` `string` default `""`; `leg` `string` default the only leg.
Returns nothing.
`side` and `type` take the values of `stdlib.md` section 17.2, which is also
where the agreement between `type` and the prices given is fixed.

```
order.place(signalSide, size, type = "limit", price = roundToTick(close))
```

### `order.reverse(qty = none, tag = "", leg = the only leg)`

Close a leg's position and open the same size the other way, in one decision.
Parameters: `qty` `number` default `none`; `tag` `string` default `""`; `leg`
`string` default the only leg.
Returns nothing.

```
if flip
    order.reverse()
```

### `order.bracket(tag = "", profit = none, loss = none, leg = the only leg)`

Set the leg's stop and target as distances from the entry.
Parameters: `tag` `string` default `""`; `profit` `number` default `none`;
`loss` `number` default `none`; `leg` `string` default the only leg.
Returns nothing.

```
order.bracket(profit = atr(14) * 3, loss = atr(14))
```

### `leg.trail(name, distance, activateAt = none)` (planned)

The one trailing stop in the language: there is no `trail` argument on `exit` or
on `order.bracket`.
Parameters: `name` `string` default the only leg; `distance` `number` required;
`activateAt` `number` default `none`.
Returns nothing.

```
leg.trail(distance = atr(14) * 2)
```

What it follows, when it activates and how it ratchets are `stdlib.md` section 17.9,
and when it is tested against a bar is section 17.10.

### `order.working(tag)` (planned)

Whether an order with that tag is live and unfilled.
Parameters: `tag` `string` required.
Returns `series bool`.

```
if not order.working("entry")
    buy(tag = "entry", limit = level)
```

### `order.pending` (planned)

How many orders are live and unfilled.
Parameters: none, it is a per-bar fact rather than a call.
Returns `series number`.

```
plot(order.pending, "Working orders", silver, style = "step")
```

### `order.qtyForCash(cash, price = close)` (planned)

Size from an amount of money.
Parameters: `cash` `number` required; `price` `number` default `close`.
Returns `number`.

```
qty = order.qtyForCash(50000)
```

### `order.qtyForRisk(risk, entry, stop)` (planned)

Size so that being stopped out costs `risk`.
Parameters: `risk` `number` required; `entry` `number` required; `stop` `number`
required.
Returns `number`, or `none` when `entry` and `stop` are equal.

```
qty = order.qtyForRisk(5000, close, close - atr(14) * 2)
```

It returns absence rather than raising when the entry and the stop are equal,
because that is a real state during warmup and on a flat bar. The order function
that receives the absent quantity refuses it with OS7002 and names the argument,
so the failure still stops loudly, one step later and with a better message.

### `order.qtyForEquityPercent(percent, price = close)` (planned)

Size from a percentage of current equity.
Parameters: `percent` `number` required; `price` `number` default `close`.
Returns `number`.

```
qty = order.qtyForEquityPercent(10)
```

### `order.roundToLot(qty, direction = "down", leg = the only leg)` (planned)

Round to a whole multiple of that leg's lot size.
Parameters: `qty` `number` required; `direction` `string` default `"down"`;
`leg` `string` default the only leg.
Returns `number`.

```
qty = order.roundToLot(order.qtyForCash(200000))
```

The sizing helpers round down to a whole number of units by default, and
`order.roundToLot` rounds down unless told otherwise. A size rounded up is a
position larger than the script asked for, and that error compounds with every
entry until the day it matters.

### `order.modify(tag, ...)` (planned)

Change a working order's price or quantity in place.
Parameters: `tag` `string` required, plus the fields to change.
Returns nothing.

```
order.modify("entry", price = roundToTick(close))
```

### `order.oco(tagA, tagB)` (planned)

Cancel one order when the other fills.
Parameters: `tagA` `string` required; `tagB` `string` required.
Returns nothing.

```
order.oco("target", "stop")
```

---

## 3. The `pos` namespace

What is readable about the position and the run so far. Every entry is a per-bar
fact and reflects fills, not intentions: an order placed on this bar and filled
on the next bar's open does not change any of these until that fill happens.

| Call | Returns | Warmup | For |
|---|---|---|---|
| `pos.size` | `series number` | bar 0, `0` when flat | Net position in units, positive long and negative short |
| `pos.isLong` | `series bool` | bar 0 | `pos.size > 0` |
| `pos.isShort` | `series bool` | bar 0 | `pos.size < 0` |
| `pos.isFlat` | `series bool` | bar 0 | `pos.size == 0` |
| `pos.avgPrice` | `series number` | absent while flat | Average price of the open position |
| `pos.entryTime` (planned) | `series number` | absent while flat | When the current position was opened |
| `pos.barsHeld` (planned) | `series number` | absent while flat | Bars since it was opened, 0 on the entry bar |
| `pos.entries` (planned) | `series number` | bar 0 | How many entries make up the current position, for a pyramiding rule |
| `pos.openProfit` (planned) | `series number` | absent while flat | Unrealised profit in money, at this bar's close |
| `pos.openProfitPercent` (planned) | `series number` | absent while flat | The same as a percentage of the position's cost |
| `pos.maxProfit` (planned) | `series number` | absent while flat | Best unrealised profit this position has seen |
| `pos.maxLoss` (planned) | `series number` | absent while flat | Worst unrealised loss this position has seen |
| `pos.equity` (planned) | `series number` | bar 0 | Starting capital plus realised and unrealised profit |
| `pos.netProfit` (planned) | `series number` | bar 0 | Realised profit since the run began |
| `pos.tradeCount` (planned) | `series number` | bar 0 | Closed trades so far |
| `pos.winRate` (planned) | `series number` | bar 0 | Share of closed trades that made money |
| `pos.profitFactor` (planned) | `series number` | bar 0 | Gross profit over gross loss |
| `pos.maxDrawdown` (planned) | `series number` | bar 0 | Largest peak to trough fall in equity so far |

```
plot(pos.equity, "Equity", aqua)
plot(pos.isFlat ? none : pos.avgPrice, "Average price", silver, style = "step")
```

Two of those defaults are chosen rather than incidental, and both are worth
knowing. `pos.avgPrice` is absent while flat rather than zero, because zero is a
price and a script comparing against it would take a branch that looks correct.
`pos.size` is `0` while flat rather than absent, because zero is the true size
and a script adding it to something should get the right answer.

`pos.openProfit` is marked to this bar's close. A strategy that marks to
something else, such as a bid or an ask, is not expressible in version 1, and
this entry says so rather than leaving you to assume one way or the other.

---

## 4. Where orders land

Nothing on this page corresponds to a field of the descriptor a study becomes.
Orders go to the host's order interface, to the sandbox destination by default.
What reaches the chart is their consequence: each fill becomes one marker, and a strategy that
wants its stop or its target drawn plots them or draws them like any other
value.

That separation is deliberate. The chart shows what happened; the broker decides
what happens.

---

## 5. Three worked examples

### A crossover strategy with a bracket

```
version 1
strategy("Crossover", overlay = true,
         capital = 500000, qty = 1, qtyType = "lots",
         fillOn = "nextOpen", slippage = 1,
         commissionType = "perTrade", commission = 20)

fast = input(9, "Fast", min = 2, max = 200)
slow = input(21, "Slow", min = 3, max = 400)
atrMult = input(2.0, "Stop, in ATR", min = 0.5, max = 10)

ef = ema(close, fast)
es = ema(close, slow)
a  = atr(14)

if crossUp(ef, es) and pos.isFlat
    buy(tag = "long")
    exit(tag = "long", loss = a * atrMult, profit = a * atrMult * 2)

if crossDown(ef, es) and pos.isLong
    close()

plot(ef, "Fast", aqua)
plot(es, "Slow", orange)
plot(pos.isFlat ? none : pos.avgPrice, "Entry", silver, style = "step")
```

The entry and the bracket are placed together, on the same bar and from the same
condition, so there is never a bar on which the position exists and the stop
does not.

### Sizing from risk rather than from capital

```
version 1
strategy("Risk sized", overlay = true, capital = 1000000, qtyType = "units")

riskPerTrade = input(5000, "Risk per trade", min = 100)
atrMult      = input(2.0, "Stop, in ATR", min = 0.5, max = 10)

a    = atr(14)
stop = close - a * atrMult

// Absent during warmup, because atr is. The order function refuses an absent
// quantity by name rather than guessing one, so the guard below is about
// keeping the log clean, not about safety.
orderSize = order.roundToLot(order.qtyForRisk(riskPerTrade, close, stop))

entry = crossUp(close, highest(high, 20)[1])

if entry and pos.isFlat and not isNone(orderSize) and orderSize > 0
    buy(qty = orderSize, tag = "risk")
    exit(tag = "risk", stop = roundToTick(stop))

plot(stop, "Stop", red, style = "step")
```

Sizing from risk rather than from a fixed quantity is what makes two instruments
with different volatilities comparable in the same report: each trade puts the
same money at stake, so the equity curve measures the rule rather than measuring
which instrument happened to move more.

### Flat by the close, with the report on the chart

```
version 1
strategy("Intraday only", overlay = true,
         product = "intraday", closeOnSessionEnd = true)

window = input("0915-1500", "Entry window")

panel = table("Run", 4, 2, position = "topLeft", textColor = silver)

if session.isIn(window) and pos.isFlat and crossUp(close, vwap())
    buy(tag = "vwap")

// session.isLastBar is known from the session's scheduled close, so this acts
// while there is still a bar to act on. Waiting for a new bar to appear means
// acting after the close, which is too late.
if session.isLastBar and not pos.isFlat
    close()

if bar.isLast
    cell(panel, 0, 0, "Net profit")
    cell(panel, 0, 1, text(pos.netProfit, 0))
    cell(panel, 1, 0, "Equity")
    cell(panel, 1, 1, text(pos.equity, 0))
    cell(panel, 2, 0, "Closed trades")
    cell(panel, 2, 1, text(pos.tradeCount, 0))
    cell(panel, 3, 0, "Open profit")
    cell(panel, 3, 1, pos.isFlat ? "flat" : text(pos.openProfit, 0),
         textColor = pos.openProfit > 0 ? lime : red)
```

`closeOnSessionEnd = true` on the declaration and the explicit `close()` on the
session's last bar do the same job from two directions. Keep both: the option is
the backstop the engine applies, and the explicit call is the one a reader of
the script can see.

## See also

- [series.md](./series.md) for `chart.lotSize`, `chart.tickSize` and the bar facts a guard is written against
- [math.md](./math.md) for `roundToTick`, `round` and the absence rules the sizing helpers follow
- [time.md](./time.md) for the session helpers an intraday strategy is built on
- [drawing.md](./drawing.md) for plotting a stop, marking a decision and writing a panel
- [request.md](./request.md) for why an order should only ever see a confirmed read
- [../../../spec/stdlib.md](../../../spec/stdlib.md) for the specification these entries are derived from
