# Position and sizing

By the end of this page you will be able to read everything a strategy knows about
its own position, and to choose an order size by fixed quantity, by lots, by the
money you are prepared to lose, or by how much the instrument moves.

## What the strategy can read about itself

The `pos` namespace answers two different questions: what is held right now, and
how the run has gone so far. Every entry is a per-bar fact.

| Call | Returns | When flat | Means |
|---|---|---|---|
| `pos.size` | `series number` | `0` | Net position in units, positive long and negative short |
| `pos.isLong` | `series bool` | `false` | `pos.size > 0` |
| `pos.isShort` | `series bool` | `false` | `pos.size < 0` |
| `pos.isFlat` | `series bool` | `true` | `pos.size == 0` |
| `pos.avgPrice` | `series number` | absent | Average price of the open position |
| `pos.entryTime` | `series number` | absent | When the current position was opened |
| `pos.barsHeld` | `series number` | absent | Bars since it was opened, `0` on the entry bar |
| `pos.entries` | `series number` | `0` | How many entries make up the current position |
| `pos.openProfit` | `series number` | absent | Unrealised profit in money, at this bar's close |
| `pos.openProfitPercent` | `series number` | absent | The same as a percentage of the position's cost |
| `pos.maxProfit` | `series number` | absent | Best unrealised profit this position has seen |
| `pos.maxLoss` | `series number` | absent | Worst unrealised loss this position has seen |
| `pos.equity` | `series number` | a number | Starting capital plus realised and unrealised profit |
| `pos.netProfit` | `series number` | a number | Realised profit since the run began |
| `pos.tradeCount` | `series number` | a number | Closed trades so far |

Three rules about this table matter more than the table.

**`pos.avgPrice` is absent while flat, and `pos.size` is zero while flat.** These
look inconsistent and are not. Zero is the true size of a flat position, so a
script that adds `pos.size` to something gets the right answer. Zero is not a
price, and a script comparing `close > pos.avgPrice` while flat would take a
branch that looks correct and means nothing. Absence propagates through that
comparison, the branch is not taken, and the mistake cannot happen.

**Every one of these reflects fills, not intentions.** An order placed on this bar
and filled at the next bar's open does not change anything in this table until
that fill happens. A resting limit order changes nothing at all until it fills.
This is the single most common source of a strategy that enters twice: the
condition is still true on the next bar, `pos.size` is still zero because the fill
has not happened yet, and the guard lets a second order through. The fix is to
guard on the working order as well as on the position:

```
if signalUp and pos.isFlat and order.pending == 0
    buy(qty = 1, tag = "entry")
```

**`pos.openProfit` is marked to this bar's close.** Not to a bid, not to an ask,
not to the last trade. Version 1 has one mark and says which one it is, so two
engines cannot disagree about an equity curve.

Here is a panel that puts the whole position on the chart. A strategy whose state
is visible is a strategy you can debug without a print log.

```
version 1

strategy("Position panel", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots")

// Declared once, before the first bar, like a plot: the pane has to know what
// it is reserving room for before any data arrives.
panel = table("Position", 5, 2, position = "topRight", textColor = silver)

fast = ema(close, 9)
slow = ema(close, 21)

if crossUp(fast, slow) and pos.isFlat
    buy(qty = 1, tag = "entry")
else if crossDown(fast, slow) and pos.isLong
    close()

// One place that decides what an absent reading looks like. A blank cell and a
// zero are both wrong: the first hides that there is no position, the second
// invents a number.
fn show(value, decimals) => isNone(value) ? "flat" : text(value, decimals)

// Only on the newest bar. A panel shows one state, and writing it fifty
// thousand times to display the last one is fifty thousand wasted writes.
if bar.isLast
    cell(panel, 0, 0, "Size")
    cell(panel, 0, 1, text(pos.size))
    cell(panel, 1, 0, "Average")
    cell(panel, 1, 1, show(pos.avgPrice, 2))
    cell(panel, 2, 0, "Open profit")
    cell(panel, 2, 1, show(pos.openProfit, 0),
         textColor = orElse(pos.openProfit, 0) >= 0 ? lime : red)
    cell(panel, 3, 0, "Bars held")
    cell(panel, 3, 1, show(pos.barsHeld, 0))
    cell(panel, 4, 0, "Equity")
    cell(panel, 4, 1, text(pos.equity, 0))

plot(fast, "Fast", aqua)
plot(slow, "Slow", orange)
```

## Where a size comes from

Two places, and the call wins over the declaration.

The declaration sets the default size and the unit it is counted in:

| `qtyType` | `qty = 2` means | Notes |
|---|---|---|
| `"units"` | Two units of the instrument | Shares, contracts, whatever the host counts in |
| `"lots"` | Two lots, that is `2 * chart.lotSize` units | The natural unit where an exchange trades in lots |
| `"cash"` | Two units of currency | Turned into units at the fill price |
| `"equityPercent"` | Two percent of current equity | Turned into units at the fill price |

An order that names no quantity uses that default. An order that names one
overrides it, in the same unit:

```
strategy("Sized", qtyType = "lots", qty = 1)

buy()                  // one lot
buy(qty = 3)           // three lots
```

Pick the `qtyType` that matches how you actually describe the trade to yourself.
A script whose declaration says `"lots"` and whose orders pass unit counts is a
script that will one day trade seventy five times too much.

## Fixed quantity

The simplest sizing, and the right one more often than it gets credit for. Use it
when the instrument is a single contract you always trade one of, or while you are
still testing whether an idea has any edge at all. A variable size makes a weak
edge look like a strong one on the two trades that happened to be sized large.

```
version 1

strategy("One lot, always", overlay = true,
         capital = 500000, qty = 1, qtyType = "lots", pyramiding = 1)

// At the top level, not inside the conditions. An else if is only evaluated on
// the bars the first condition is false, so a stateful call written there would
// advance on some bars and not others (OS8001).
fast = ema(close, 9)
slow = ema(close, 21)

if crossUp(fast, slow) and pos.isFlat
    buy(tag = "entry")
else if crossDown(fast, slow) and pos.isLong
    close()
```

## Instruments that trade in lots

Many instruments cannot be traded in single units. The exchange trades them in
lots, and an order for anything that is not a whole multiple of the lot is
rejected. The engine rejects it too, with OS7005 naming the instrument, its lot
size and the quantity, for the same reason the exchange would: a backtest that
filled such an order would report a trade that could not have happened.

| Fact | Call | Absent when |
|---|---|---|
| Units in one lot | `chart.lotSize` | The host has not said |
| Money per point per unit | `chart.pointValue` | The host has not said |
| Smallest price increment | `chart.tickSize` | The host has not said |

Two ways to stay on the right side of it. Either declare `qtyType = "lots"` and
count in lots everywhere, which is the readable option, or compute units and round
them:

```
units = order.roundToLot(rawUnits)              // down, to a whole lot
units = order.roundToLot(rawUnits, "up")        // up, when you mean up
```

`order.roundToLot` rounds **down** unless told otherwise, and so do the sizing
helpers below. The reason is compounding: a size rounded up is a position larger
than the script asked for, and if every entry rounds up, every entry is slightly
too large, in the same direction, for the life of the run.

When the host has not supplied a lot size, `chart.lotSize` is absent rather than
`1`. Decide what that should mean in your script rather than letting absence reach
an order function:

```
lotUnits = max(orElse(chart.lotSize, 1), 1)
```

## Sizing by capital at risk

This is how most traders actually describe size: not "two lots" but "I am willing
to lose fifty thousand on this trade". Turn that sentence into a quantity and the
stop distance sets the size, so a wide stop buys fewer units and every trade risks
the same amount.

`order.qtyForRisk(risk, entry, stop)` does it in one call. It returns `none` when
`entry` and `stop` are equal, rather than raising, because that is a real state
during warmup, and the order function that receives the absent quantity refuses it
with OS7002 anyway, naming the argument.

```
version 1

strategy("Risk the same amount every time", overlay = true, precision = 2,
         capital = 500000, qtyType = "units", qty = 1,
         product = "intraday", pyramiding = 1,
         fillOn = "nextOpen", slippage = 1,
         commissionType = "perTrade", commission = 20)

riskPercent = input(1.0, "Percent of equity risked per trade", min = 0.1, max = 10)
stopMult    = input(2.0, "Stop, in ATR", min = 0.2, max = 20)

atrValue = atr(14)
fast     = ema(close, 9)
slow     = ema(close, 21)

stopDistance = stopMult * atrValue
stopPrice    = close - stopDistance

// Percent of equity rather than a fixed cash figure, because equity is readable
// and a fixed figure stops being a percentage of anything after the first trade.
riskAmount = pos.equity * riskPercent / 100

rawUnits = isNone(stopPrice) ? none : order.qtyForRisk(riskAmount, close, stopPrice)
units    = isNone(rawUnits) ? none : order.roundToLot(rawUnits)
stopTick = isNone(stopPrice) ? none : roundToTick(stopPrice)

// Both the size and the stop price are tested before either reaches an order.
// roundToTick is absent when the host has supplied no tick size, and an order
// given an absent argument is refused with OS7002.
canTrade = not isNone(units) and units > 0 and not isNone(stopTick)

if crossUp(fast, slow) and pos.isFlat and canTrade
    buy(qty = units, tag = "entry")
    exit(tag = "entry", stop = stopTick)

plot(fast, "Fast", aqua)
plot(slow, "Slow", orange)
plot(pos.isFlat ? none : pos.avgPrice, "Entry", fade(silver, 40), style = "step")
```

Written out by hand, so the arithmetic is not a mystery:

```
pointValue = orElse(chart.pointValue, 1)
rawUnits   = riskAmount / (stopDistance * pointValue)
```

`chart.pointValue` is money per one point of price per unit. For a cash equity it
is 1 and the division is just money over price distance. For a derivative it is
the multiplier, and leaving it out is how a script ends up risking the multiplier
times what it meant to.

Three things this sizing does not protect you from, stated so you do not think it
does. It assumes the stop fills at the stop price, which a gap will not. It sizes
the risk of one trade, not the risk of ten correlated trades taken the same
morning. And it is a division, so as the stop distance goes to zero the size goes
to the sky: cap it.

```
maxUnits = order.roundToLot(pos.equity / close)      // never more than one times equity
units    = min(orElse(rawUnits, 0), maxUnits)
```

## Sizing by volatility

Risk sizing asks "how far away is the stop". Volatility sizing asks "how much does
this thing move in a day", and aims for the same money move per unit of time
whatever you are trading. It is the sizing that lets one strategy run over several
instruments without the fastest one dominating the equity curve.

The recipe is one line: target a money move, divide by the money move of one unit.

```
version 1

strategy("Constant volatility exposure", overlay = true, precision = 2,
         capital = 500000, qtyType = "units", qty = 1,
         product = "overnight", pyramiding = 1)

targetPercent = input(0.5, "Target daily move, percent of equity", min = 0.05, max = 5)
atrLen        = input(20,  "ATR length", min = 2, max = 200)

atrValue   = atr(atrLen)
pointValue = orElse(chart.pointValue, 1)

// What one unit moves in money on an average day, and how much money of movement
// the account wants in total.
movePerUnit  = atrValue * pointValue
targetMove   = pos.equity * targetPercent / 100

rawUnits = movePerUnit > 0 ? targetMove / movePerUnit : none
units    = isNone(rawUnits) ? none : order.roundToLot(rawUnits)

trend = ema(close, 50)
canSize = not isNone(units) and units > 0

if close > trend and pos.isFlat and canSize
    buy(qty = units, tag = "entry")
else if close < trend and pos.isLong
    close()

plot(trend, "Trend", orange, width = 2)
plot(units, "Units the model wants", aqua, overlay = false)
```

The comparison `movePerUnit > 0` is doing two jobs. It keeps the division away
from zero, and because an ordered comparison against an absent value is absent and
an absent condition takes the false branch, it also covers the warmup bars where
`atr` has no value yet. One test, both cases, no `isNone` needed on that line.

## Sizing by cash and by equity

Two helpers for the cases where the size is described in money rather than in
risk.

| Call | Returns | For |
|---|---|---|
| `order.qtyForCash(cash, price = close)` | `number` | "Put two lakh into this" |
| `order.qtyForEquityPercent(percent, price = close)` | `number` | "Put ten percent of the account into this" |
| `order.qtyForRisk(risk, entry, stop)` | `number` | "Lose no more than this if I am wrong" |

All three round down to a whole number of units. The first two size the *position*
and say nothing about what it can lose; the third sizes the *loss* and lets the
position be whatever that implies. They answer different questions, and a strategy
that is described in terms of risk should not be sized in terms of exposure just
because the exposure version is one line shorter.

```
version 1

strategy("Ten percent of equity", overlay = true, precision = 2,
         capital = 500000, qtyType = "units", qty = 1)

share = input(10, "Percent of equity per position", min = 1, max = 100)

units = order.roundToLot(order.qtyForEquityPercent(share))

fast = ema(close, 20)
slow = ema(close, 50)

if crossUp(fast, slow) and pos.isFlat and units > 0
    buy(qty = units, tag = "entry")
else if crossDown(fast, slow) and pos.isLong
    close()

plot(pos.equity, "Equity", aqua, overlay = false)
```

## Adding to a position

`pyramiding` in the declaration is the number of entries allowed in one direction.
The default is `1`, and an entry beyond the limit is refused with OS7008 naming
the limit and how many entries are already open. Refusing rather than silently
adding keeps a backtest from building a position the declaration forbade.

When adding is the intent, say it in both places: raise the limit, and count the
entries in the guard so the script does not depend on the refusal to stop it.

```
version 1

strategy("Add on strength", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots", pyramiding = 3)

trend    = ema(close, 50)
atrValue = atr(14)

// Each add is a fresh high plus a bar of separation, not simply "still above
// the average", which would add on every bar of the move.
newHigh = high > highest(high, 20)[1]
spaced  = pos.isFlat or orElse(pos.barsHeld, 0) >= 5

if close > trend and newHigh and spaced and pos.entries < 3
    buy(qty = 1, tag = "add")
else if close < trend and pos.isLong
    close()

plot(trend, "Trend", orange)
plot(pos.isFlat ? none : pos.avgPrice, "Average", fade(silver, 40), style = "step")
```

Note that `pos.avgPrice` moves as you add, which is the point of plotting it. A
stop measured from the average of three entries is a different stop from one
measured from the first entry, and the plot is where you notice that before the
backtest does.

## Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Two entries where the script meant one | Guarded on `pos.isFlat` alone while an order was still working | Add `and order.pending == 0` |
| OS7005 on every order | Unit counts against a lot-traded instrument | `qtyType = "lots"`, or `order.roundToLot` |
| Size explodes on quiet days | Risk sizing with no cap as the stop distance shrinks | Cap against equity |
| Size is absent and orders are refused | `atr` or the stop is still warming up | Test with `isNone` and skip the bar |
| Risk per trade is right, total risk is not | Several correlated positions sized independently | Budget risk across the portfolio, not per script |
| Derivative sized as if one point were one unit of money | `chart.pointValue` left out of the arithmetic | Multiply by `orElse(chart.pointValue, 1)` |

## See also

- [overview.md](./overview.md) for what a strategy is and the loop it runs in
- [orders.md](./orders.md) for the calls that consume these quantities
- [exits-and-brackets.md](./exits-and-brackets.md) for the stop that this sizing is measured against
- [costs-and-fills.md](./costs-and-fills.md) for why the fill price is not the price you sized from
- [../../spec/stdlib.md](../../spec/stdlib.md) for the `pos` and `order` namespaces in full
- [../../examples/10-strategy-ema-cross.oscript](../../examples/10-strategy-ema-cross.oscript) for risk sizing worked end to end
