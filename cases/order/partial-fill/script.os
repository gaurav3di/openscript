// The same crossing as the first example, traded: a stop and a target fixed at
// entry, and a size chosen so that the stop costs the same on every trade.
//
// Exercises: strategy options and the cost model, buy and close, exit with
// absolute bracket prices, pos facts, sizing rounded to a whole lot, and holding
// the entry levels in var so the plotted stop is the stop that was actually sent.

version 1

strategy("EMA cross, bracketed", overlay = true, precision = 2,
         capital = 500000, qtyType = "units", qty = 1,
         product = "intraday", pyramiding = 1,
         fillOn = "nextOpen", slippage = 1,
         commissionType = "perTrade", commission = 20)

fastLen    = input(9,    "Fast length", min = 1, max = 500)
slowLen    = input(21,   "Slow length", min = 1, max = 500)
atrLen     = input(14,   "ATR length",  min = 1, max = 200)
stopMult   = input(2.0,  "Stop, in ATR",   min = 0.2, max = 20)
targetMult = input(3.0,  "Target, in ATR", min = 0.2, max = 40)
riskAmount = input(5000, "Amount risked per trade", min = 1)

fast = ema(close, fastLen)
slow = ema(close, slowLen)
atrValue = atr(atrLen)

stopDistance   = stopMult * atrValue
targetDistance = targetMult * atrValue

// Size from the distance to the stop, so a wide stop buys fewer units and every
// trade risks the same amount. A cash figure and not a percentage of equity,
// deliberately: pos.equity and order.qtyForEquityPercent both exist, and a
// percentage of a growing account compounds the loss as well as the win, which
// is a second decision hidden inside what looks like one.

// chart.lotSize is absent, not 1, when the host has not said what a lot is, and
// absence propagates through max as it does through arithmetic, so the fallback
// goes inside the guard rather than around it. Without orElse every size would
// be absent and the strategy would never place an order at all.
lotUnits  = max(orElse(chart.lotSize, 1), 1)
rawUnits  = stopDistance > 0 ? riskAmount / stopDistance : none
orderQty  = isNone(rawUnits) ? none : floor(rawUnits / lotUnits) * lotUnits

var entryStop   = none
var entryTarget = none

flat    = pos.size == 0
canSize = not isNone(orderQty) and orderQty > 0

if crossUp(fast, slow) and flat and canSize
    // The levels are computed from this bar's close but the order fills at the
    // next bar's open, which is the default and is the honest one. They are the
    // levels the decision was made on, and the backtest reports the slippage
    // between them and the fill rather than hiding it.
    //
    // exit rather than order.bracket: exit takes absolute prices and
    // order.bracket takes distances from the entry (stdlib 17.2 and 17.3), and
    // these two are prices. Both in one call, never two, so a gap through both
    // cannot fill them as separate orders.
    entryStop   = close - stopDistance
    entryTarget = close + targetDistance
    buy(qty = orderQty, tag = "entry")
    exit(tag = "entry", stop = entryStop, limit = entryTarget)

if crossDown(fast, slow) and pos.size > 0
    entryStop   = none
    entryTarget = none
    close()

plot(fast, "Fast", aqua, width = 2)
plot(slow, "Slow", orange, width = 2)

// The stop as sent, not as it would be recomputed now. Plotting stopDistance
// against the current close would draw a line that trails the price and was
// never an order.
plot(pos.size > 0 ? entryStop : none,   "Stop",   red,  style = "step")
plot(pos.size > 0 ? entryTarget : none, "Target", lime, style = "step")
plot(pos.size > 0 ? pos.avgPrice : none, "Entry", fade(silver, 40), style = "step")
