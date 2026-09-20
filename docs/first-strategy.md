# Your first strategy

By the end of this page you will have turned the study you built into a strategy
that enters, exits, carries a stop and a target, sizes itself by risk, and
produces a backtest report you know how to read, on paper, which is the only mode
it can reach without a separate deliberate act from you.

> **Much of this page is marked planned.** A strategy's ledger, its legs and its
> book are what the marked calls are folded from, and no engine holds one in this
> release. A marked call is refused where you wrote it, with a message that says
> it is planned, rather than compiling and then failing to load. The six order
> functions, the three `order` calls that place an order and the five position
> facts read from the account's own row are not marked, because those run.

## Contents

1. [A strategy is a study with orders](#a-strategy-is-a-study-with-orders)
2. [Step 1. Change the declaration](#step-1-change-the-declaration)
3. [The position model](#the-position-model)
4. [Step 2. An entry](#step-2-an-entry)
5. [Step 3. An exit](#step-3-an-exit)
6. [Step 4. A stop and a target](#step-4-a-stop-and-a-target)
7. [Step 5. Position sizing](#step-5-position-sizing)
8. [The finished strategy](#the-finished-strategy)
9. [Running the backtest](#running-the-backtest)
10. [Reading the headline numbers](#reading-the-headline-numbers)
11. [Paper is the default. Live is a separate act](#paper-is-the-default-live-is-a-separate-act)
12. [What will go wrong](#what-will-go-wrong)

---

## A strategy is a study with orders

There is no separate strategy language and no separate strategy file. You change
the word `study` to `strategy` in the declaration, and the order functions become
available in the same file that is already doing the plotting.

That is not a convenience; it is the point. The numbers on your chart and the
numbers in your backtest are computed once, by the same instructions, from the
same bars. They cannot drift apart, because there is nothing for them to drift
apart from.

Calling `buy()` in a file declared with `study()` is error OS7001, and the fix it
offers is the one sentence of this section: change the declaration, or replace
the order with `signal("...")` to mark the bar without trading.

We start from the study built in [first-study.md](./first-study.md): a moving
average with a deviation band around it. The trade idea is mean reversion. Price
closes back above the lower band, we buy; price reaches the middle, we are out.

## Step 1. Change the declaration

```
version 1

strategy("Deviation bands, long only", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "units",
         product = "intraday", pyramiding = 1,
         fillOn = "nextOpen", slippage = 1,
         commissionType = "perTrade", commission = 20)
```

`strategy()` accepts every option `study()` accepts, so `overlay` and `precision`
still mean what they meant. The rest are the trading options:

| Option | Default | Means |
|---|---|---|
| `capital` | `100000` | Starting equity for the backtest |
| `currency` | `""` | Display label for money in the report |
| `qty` | `1` | Default order size when an order names none |
| `qtyType` | `"units"` | `"units"`, `"lots"`, `"cash"` or `"equityPercent"` |
| `product` | `"intraday"` | `"intraday"` or `"overnight"` |
| `fillOn` | `"nextOpen"` | `"nextOpen"` or `"close"`. Where a signalled order is filled |
| `slippage` | `0` | Ticks of adverse slippage applied to every fill |
| `commission` | `0` | Cost per the `commissionType` unit |
| `commissionType` | `"perTrade"` | `"perTrade"`, `"perUnit"` or `"percent"` |
| `pyramiding` | `1` | Maximum entries in one direction before entries are refused |
| `closeOnSessionEnd` | `false` | Flatten at the session close |

Two of those defaults are opinions, and both are worth understanding before you
change them.

**`fillOn = "nextOpen"`.** A decision made from a bar's close cannot be filled at
that same close in the real market: by the time the bar has closed, it has
closed. Filling at the next bar's open is what actually happens to you, so it is
what the backtest does unless you say otherwise. A backtest whose default is
optimistic is a backtest that lies, and it lies by exactly the amount that makes
a mediocre idea look tradeable.

**`slippage` and `commission` start at zero.** That is not a claim that trading
is free; it is a refusal to guess your costs. Set them. A strategy that takes
many small profits is exactly the kind costs destroy, and running one at zero
cost tells you nothing about whether it works.

## The position model

A strategy trades the legs it declared. A leg names a contract outright with
`leg.fixed` or describes one with `leg.relative`, and the host resolves the
description before bar 0; a file that declares no leg has exactly one leg, the
instrument its chart is showing, and every order acts on it with no leg named
(`stdlib.md` sections 17.1 and 17.6). This file declares none, so everything
below acts on the chart's instrument.

| Call | Does |
|---|---|
| `buy(qty, limit, stop, tag, leg)` | Enter or add to a long position in one leg |
| `sell(qty, limit, stop, tag, leg)` | Enter or add to a short position in one leg |
| `close(tag, qty, leg)` | Flatten a leg, or the part carrying one tag |
| `exit(tag, qty, limit, stop, profit, loss, leg)` | Set the leg's stop or target from a call site |
| `cancel(tag)`, `cancelAll()` | Cancel working orders that have not filled |

`buy` adds and `sell` subtracts. What a leg holds, and what an instruction that
would take it through zero is sent as, is the position model of `stdlib.md`
section 17.1.

With neither `limit` nor `stop`, `buy` and `sell` place a market order. With
`limit` alone, a limit order. With `stop` alone, a stop order. With both, a
stop-limit order. One function with optional prices, rather than six named ones,
because the decision you are making is direction and the price is a qualifier on
it.

What you can read back about the position, all of it reflecting **fills rather
than intentions**:

| Read | Value while flat |
|---|---|
| `pos.size` | `0`, positive long, negative short |
| `pos.isLong`, `pos.isShort`, `pos.isFlat` | `false`, `false`, `true` |
| `pos.avgPrice` | absent |
| `pos.barsHeld`, `pos.entryTime` (planned) | absent |
| `pos.openProfit`, `pos.openProfitPercent` (planned) | absent |
| `pos.equity`, `pos.netProfit`, `pos.tradeCount` (planned) | a number from bar 0 |

`pos.size` is `0` while flat because zero is the true size and a script adding it
to something should get the right answer. `pos.avgPrice` is **absent** while flat
because zero is a price, and a script comparing against it would take a branch
that looks correct. The two rules disagree on purpose, and each one is the honest
answer for its own value. An order placed on this bar and filled at the next
bar's open changes none of these reads until that fill happens.

## Step 2. An entry

```
length = input(20,   "Basis length", min = 2, max = 500)
mult   = input(2.0,  "Band width, in deviations", min = 0.1, max = 10)

basis = sma(close, length)
dev   = mult * stdev(close, length)
upper = basis + dev
lower = basis - dev

// Computed at the top level, every bar. A stateful call written inside the
// branch that uses it would only advance on the bars that branch was taken.
enterLong = crossUp(close, lower)

if enterLong and pos.isFlat
    buy(qty = 1)
```

Three things are already true of that entry, and none of them is written in it.

**It does not fire on a bar that is still moving.** On a live chart the newest
bar is executed again on every update. An order is deferred until the bar is
confirmed, and if the condition is no longer true when the bar closes, the order
never happens at all. You can opt out with `onUnconfirmed = true` on the
declaration, and then the guarding is yours to write.

**It fills at the next bar's open**, per `fillOn`, with the declared slippage and
commission applied.

**It cannot pyramid.** `pyramiding = 1` means one entry in a direction, and a
second `buy` while long is refused. The `pos.isFlat` guard says the same thing in
the script, which is worth writing anyway: the guard is visible in review and the
option is not.

## Step 3. An exit

```
exitLong = crossUp(close, basis)

if exitLong and pos.isLong
    close()
```

`close()` flattens the position. Note that the same word is both a built-in
series and an order function in this file: `close` read bare is the bar's closing
price, and `close(...)` written as a call flattens. The checker tells them apart
by syntax, which is unambiguous at compile time, and both spellings are the ones
a trader already expects.

For an intraday strategy, add the one exit that is neither a stop nor a target:

```
strategy("Deviation bands, long only", ..., closeOnSessionEnd = true)
```

That flattens at the session close. An intraday position carried overnight
because the script forgot to say otherwise is not a strategy decision, it is a
bug with a margin call attached.

## Step 4. A stop and a target

A stop and a target are attached to the open position as a bracket:

```
atrLen     = input(14,  "ATR length", min = 1, max = 200)
stopMult   = input(1.5, "Stop, in ATR", min = 0.2, max = 20)
targetMult = input(2.5, "Target, in ATR", min = 0.2, max = 40)

atrValue = atr(atrLen)

var entryStop   = none
var entryTarget = none

if enterLong and pos.isFlat and not isNone(atrValue)
    entryStop   = close - stopMult * atrValue
    entryTarget = close + targetMult * atrValue
    buy(qty = 1)
    exit(stop = entryStop, limit = entryTarget)
```

`exit()` takes its prices two ways, and you pick one per side:

| Argument | Is | Example |
|---|---|---|
| `stop` | An absolute price | `exit(stop = 1482.5)` |
| `limit` | An absolute price | `exit(limit = 1520.0)` |
| `loss` | A distance from the entry, in price units | `exit(loss = 12.5)` |
| `profit` | A distance from the entry, in price units | `exit(profit = 25.0)` |

Giving both an absolute price and a distance for the same side is refused, rather
than reconciled: any rule for combining them would surprise somebody, and this is
not a place to be surprised.

A trailing stop is not one of these arguments: it is `leg.trail(name, distance,
arm)`, the one spelling in the language, and what it follows and when it arms are
`stdlib.md` section 17.9.

The two `var` names are doing real work. They hold the levels **as they were
sent**, so the lines you plot are the orders that exist:

```
plot(pos.isLong ? entryStop   : none, "Stop",   red,  style = "step")
plot(pos.isLong ? entryTarget : none, "Target", lime, style = "step")
plot(pos.isLong ? pos.avgPrice : none, "Entry", fade(silver, 40), style = "step")
```

Recomputing `close - stopMult * atrValue` down at the plot instead would draw a
line that trails the current price and was never an order. It would look
plausible, which is what makes it dangerous.

The `not isNone(atrValue)` guard matters. During the first `atrLen - 1` bars,
`atr()` is absent, the stop price would be absent, and an order function given an
absent price does not place a malformed order and does not substitute a value: it
refuses with OS7002, naming the argument that was absent. An order is the one
place in this language where doing nothing quietly is worse than stopping loudly.

## Step 5. Position sizing

Sizing every trade at one unit means a trade with a wide stop risks several times
what a trade with a narrow stop risks, and your results are then mostly a
statement about which stops happened to be wide. Size from the distance to the
stop instead, so every trade risks the same amount:

```
riskAmount = input(5000, "Amount risked per trade", min = 1)

if enterLong and pos.isFlat and not isNone(atrValue)
    stopPrice  = close - stopMult * atrValue
    rawQty     = order.qtyForRisk(riskAmount, close, stopPrice)
    orderQty   = isNone(chart.lotSize) ? floor(rawQty) : order.roundToLot(rawQty)

    if not isNone(orderQty) and orderQty > 0
        entryStop   = stopPrice
        entryTarget = close + targetMult * atrValue
        buy(qty = orderQty)
        exit(stop = entryStop, limit = entryTarget)
```

The sizing helpers:

| Call | Sizes from |
|---|---|
| `order.qtyForRisk(risk, entry, stop)` (planned) | The distance to the stop, so being stopped out costs `risk` |
| `order.qtyForCash(cash, price)` (planned) | An amount of money |
| `order.qtyForEquityPercent(percent, price)` (planned) | A percentage of current equity |
| `order.roundToLot(qty, direction)` (planned) | Rounds to a whole multiple of `chart.lotSize` |

All of them round **down** by default. A size rounded up is a position larger
than the script asked for, and that error compounds with every entry.

`chart.lotSize` is absent when the host has not stated one, which is why the line
above tests for it rather than assuming a lot. The same caution applies to
`chart.tickSize`: it is absent rather than a guessed value, because a script
sizing a stop in ticks has to be able to tell a real tick size from nobody having
said.

`order.qtyForRisk` returns `none` when the entry and the stop are equal, rather
than raising, because that is a real state during warmup. The absent quantity
then reaches `buy()`, which refuses it with OS7002 and names it. The guard above
catches it first, which is better, because a refused order is a trade you did not
take and you would rather see that in the source than in a log.

## The finished strategy

```
version 1

strategy("Deviation bands, long only", overlay = true, precision = 2,
         capital = 500000, qtyType = "units", qty = 1,
         product = "intraday", pyramiding = 1,
         fillOn = "nextOpen", slippage = 1,
         commissionType = "perTrade", commission = 20,
         closeOnSessionEnd = true)

length     = input(20,   "Basis length", min = 2, max = 500)
mult       = input(2.0,  "Band width, in deviations", min = 0.1, max = 10)
atrLen     = input(14,   "ATR length", min = 1, max = 200)
stopMult   = input(1.5,  "Stop, in ATR", min = 0.2, max = 20)
targetMult = input(2.5,  "Target, in ATR", min = 0.2, max = 40)
riskAmount = input(5000, "Amount risked per trade", min = 1)

basis = sma(close, length)
dev   = mult * stdev(close, length)
upper = basis + dev
lower = basis - dev

atrValue = atr(atrLen)

enterLong = crossUp(close, lower)
exitLong  = crossUp(close, basis)

var entryStop   = none
var entryTarget = none

if enterLong and pos.isFlat and not isNone(atrValue)
    stopPrice = close - stopMult * atrValue
    rawQty    = order.qtyForRisk(riskAmount, close, stopPrice)
    orderQty  = isNone(chart.lotSize) ? floor(rawQty) : order.roundToLot(rawQty)

    if not isNone(orderQty) and orderQty > 0
        entryStop   = stopPrice
        entryTarget = close + targetMult * atrValue
        buy(qty = orderQty)
        exit(stop = entryStop, limit = entryTarget)

if exitLong and pos.isLong
    entryStop   = none
    entryTarget = none
    close()

plot(basis, "Basis", orange, width = 2)
upperPlot = plot(upper, "Upper", fade(aqua, 30))
lowerPlot = plot(lower, "Lower", fade(aqua, 30))
fill(upperPlot, lowerPlot, fade(aqua, 94))

plot(pos.isLong ? entryStop    : none, "Stop",   red,  style = "step")
plot(pos.isLong ? entryTarget  : none, "Target", lime, style = "step")
plot(pos.isLong ? pos.avgPrice : none, "Entry",  fade(silver, 40), style = "step")
```

Sixty lines, and every number on the chart is a number the strategy actually
traded on.

## Running the backtest

A run needs five things, and none of them lives in the script: the instrument,
the exchange, the interval, a from date and a to date. They are run settings
rather than script settings on purpose, because the same script tested over two
periods is one script and two runs, and a script that carried its own date range
would make that comparison awkward.

What a run stores, so that a result is still a result in six months:

| Stored with the run | Why |
|---|---|
| Every input value | A different length is a different strategy |
| The date range | |
| The cost settings | Slippage and commission change the answer more than most parameters |
| The script revision | The exact source that produced it |
| The compiled program's hash | Proof the source compiled to what was run |

A short range runs immediately; a long range runs where there is more room for
it. The two must produce identical numbers, and a disagreement between them is a
release blocker rather than rounding.

## Reading the headline numbers

The report gives you an equity curve, a drawdown curve, a trade list, a monthly
table, and every trade marked on the chart. The headline numbers, and what each
one is actually telling you:

| Number | Is | Read it knowing |
|---|---|---|
| Net profit | Realised profit over the range, after the costs you declared | It is gross of every cost you left at zero |
| Return on capital | Net profit over starting capital | It says nothing about how much of the time that capital was at work |
| Max drawdown | The largest peak to trough fall in equity | Read this first. It is the number that decides whether you could have held on |
| Trades | Closed trades in the range | Under about thirty trades, none of the numbers below mean anything |
| Win rate | Share of closed trades that made money | Meaningless on its own. A 90 percent win rate with one catastrophic loser is a losing strategy |
| Average win, average loss | The two halves win rate is useless without | |
| Expectancy | Average profit per trade | Win rate times average win, minus loss rate times average loss. This is the number that scales |
| Profit factor | Gross profit over gross loss | Below 1 the strategy loses. Between 1 and 1.2, costs will take it |
| Time in market | Share of bars holding a position | A strategy in the market 5 percent of the time and one in it 95 percent of the time are not comparable on return alone |

Inside the script you can read `pos.equity`, `pos.netProfit` and
`pos.tradeCount` on any bar, which is enough to plot your own equity curve as a
study. The derived statistics (`pos.winRate`, `pos.profitFactor`,
`pos.maxDrawdown`) are named in the library and are not in the first release, so
today they come from the report rather than from the script.

Four ways a good-looking report is lying to you, all of them things you control:

1. **Costs left at zero.** Set `slippage` and `commission` before you believe
   anything.
2. **A fill model that is too kind.** `fillOn = "close"` fills you at a price
   that had already gone by the time you decided. Leave the default.
3. **Too few trades.** Thirty is the point where numbers start to exist. Six
   trades is an anecdote.
4. **A higher timeframe read in `"lookahead"` mode.** That mode reads a coarse
   bar's finished value on bars before it finished. It repaints on history by
   design, and a strategy built on it backtests beautifully and cannot be traded.
   The compiler warns, and the study is marked as repainting in the legend.

## Paper is the default. Live is a separate act

**Paper mode is the default, and it is not a setting you can slip past by
accident.** A strategy you start runs against the paper execution path. It takes
the same orders, applies the same cost model and produces the same kind of
report, and it sends nothing to a broker.

**Arming live is a separate, deliberate act.** It is not a checkbox next to the
run button and it is not a property of the script. Nothing in the language can
arm it: there is no option on `strategy()`, no library call and no input that
turns paper into live. That is why the word does not appear anywhere in the
script above.

Three rules that live running adds, all of them consequences of one idea, which
is that nothing about a running strategy may change under it:

| Rule | Consequence |
|---|---|
| A running process pins the script revision it started with | Editing the file does not change what is running. The change applies the next time you start it |
| A save while a strategy is running is refused rather than silently queued | Stop it, save, start it again, and you know which revision is live |
| The same compiled program runs live as ran in the backtest | Live and backtest disagreeing is a defect, not a fact of life |

Before you arm anything, read your own script once more for the things that only
matter when real orders leave the building: is `product` right for the position
you intend to hold, is `closeOnSessionEnd` set the way you want, and does every
order path have a stop.

## What will go wrong

The order errors, and what each one is telling you:

| Code | Means | Usually because |
|---|---|---|
| OS7001 | Only a strategy can do that | The file still says `study()` |
| OS7002 | An order argument is absent | A price or a quantity was `none`, almost always during warmup |
| OS7004 | Order quantity is zero or negative | Sizing returned zero after rounding down. Test it before ordering |
| OS7005 | Quantity is not a multiple of the lot size | Pass it through `order.roundToLot` |
| OS7007 | A limit or stop order has no price | A `limit` or `stop` argument went missing |
| OS7008 | The entry was refused by pyramiding | A second entry in the same direction with `pyramiding = 1` |
| OS7010 | A bracket price is on the wrong side of the entry | A long whose stop is above the entry, or target below it. Check the sign on your ATR multiple |
| OS7011 | The order needs more capital than the strategy has | Sizing is too aggressive for the declared `capital` |
| OS7013 | Two opposite orders on one bar | Two branches both fired. Make them exclusive |
| OS7015 | The strategy has no order destination | Nowhere has been configured to receive orders |

And the failure that produces no error at all: **nothing trades**. Work down this
list.

1. Is the entry condition ever true? Plot it: `plot(enterLong ? 1 : 0, "Entry")`.
2. Is it true only during warmup, where the guard then blocks it?
3. Is `pos.isFlat` ever true, or did the first trade never close?
4. Did sizing come out as zero, or absent?
5. Is the date range one where the instrument actually had bars?

`print(value)` writes to the script's log with the bar's time, and it is the
fastest way to answer all five.

## See also

- [first-study.md](./first-study.md) for the study this strategy was built from
- [getting-started.md](./getting-started.md) for the execution model and the compile steps
- [editor-tour.md](./editor-tour.md) for revisions, and the rule that pins one to a run
- [installing.md](./installing.md) for where the file lives and how to share it
- [../spec/stdlib.md](../spec/stdlib.md) for every order, position and sizing call
- [../examples/README.md](../examples/README.md) for three complete strategies to read next
