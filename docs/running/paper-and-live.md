# Paper and live

By the end of this page you will know exactly what paper mode does and does not
simulate, what changes at the moment a strategy is armed for live orders, and
you will have a pre-flight checklist to work through before a script touches a
real account.

## Three destinations, one program

A compiled program does not know where its orders go. The same instruction list
that a backtest runs is the one paper runs and the one a broker connection runs.
What differs is the destination attached to it.

| Destination | Bars arrive | Orders go to | Money |
|---|---|---|---|
| Backtest simulator | All at once, all confirmed | A fill model over the bars | None |
| Paper | In real time, the newest bar still moving | A simulated account | None |
| Live | In real time, the newest bar still moving | The broker, through the host | Yours |

That separation is the reason the numbers can be trusted. The chart shows what
happened, the broker decides what happens, and nothing in the language reaches
across. A strategy that placed an order and found no destination at all is
OS7015, which says so rather than computing a position nothing ever took.

## Paper is the default, and arming is a separate act

A strategy that starts runs on paper. Live is not a setting buried in the
declaration and not an argument on an order: it is a separate, deliberate action
in the host, taken on a strategy that is already running well.

The reason is the asymmetry of the mistake. A live strategy running by accident
costs money and takes orders you did not choose to place. A paper strategy
running by accident costs a log file. When one direction of a mistake is
expensive and the other is free, the default belongs at the free end, and the
expensive direction gets a door you have to open with your hand on the handle.

Nothing in the source distinguishes the two. The same file, the same revision
and the same inputs run on paper and live, which is what makes a paper run
evidence about the live run rather than a rehearsal of a different play.

## What paper simulates faithfully

These are the same in paper as in live, to the last decimal:

- Every calculation in the script. Same compiled program, same arithmetic in
  source order, same warmup bars.
- The absent value and where it appears. A study that is absent for the first
  199 bars on paper is absent for the first 199 bars live.
- The per-bar execution model, including the re-execution of the moving bar and
  the rollback rule that makes it idempotent.
- Which bar an order is decided on, and the deferral of orders, signals and
  alerts to the confirmation of that bar.
- Position accounting: `pos.size`, `pos.avgPrice`, `pos.barsHeld`,
  `pos.entries`, and the one-net-position model.
- The cost model you declared: slippage in ticks, commission, lot rounding.
- Bracket logic, as the engine expresses it.

If a paper run and a live run disagree about any of the above, that is a defect,
not a market effect.

## What paper does not simulate

This list is the important one. Paper fills at a model price. The market fills
at a price somebody else was willing to trade at.

| What paper does | What the market does | What it costs you |
|---|---|---|
| Fills the whole quantity at one price | Fills in pieces at several prices | Size, on anything larger than the top of book |
| Fills a limit order when price touches it | Fills it when the queue in front of you clears | Missed entries that the report counts as taken |
| Applies your declared slippage | Applies the spread, plus impact, plus whatever moved in between | A per-trade cost you guessed |
| Accepts every well-formed order | Rejects for margin, product, permission, price band, freeze quantity | OS7014 with the destination's own reason |
| Acts instantly | Has a round trip of tens to hundreds of milliseconds | Entries on fast moves |
| Never has an outage | Has outages, both ends | A position you cannot manage |
| Treats the open and the close as prices | Runs auctions there, where a single price forms from a book | The first and last bar of every session |
| Ignores corporate actions and expiry | Splits, dividends, settlement, cash close-outs | A position that is not what the script thinks |
| Has no partial state | Has working orders, modified orders, cancelled and re-placed ones | Reconciliation |

Two of those deserve a plain statement.

**Liquidity is the one paper can never model.** A paper fill costs nothing to
produce. On an illiquid instrument, or at a size larger than the visible depth,
the price you get is the price your own order made. No cost setting substitutes
for checking the depth at the size you intend to trade.

**Rejections are not exceptional.** Margin shortfalls, product mismatches,
instruments the account is not permitted to trade and orders outside a price
band are ordinary events, and they arrive as OS7014 carrying the destination's
own reason. The same order will keep being rejected until the account or the
order changes, so a strategy that retries in a loop just makes the log longer.

## Paper against backtest: the moving bar

The largest single reason a paper run disagrees with a backtest of the same
period is not fills. It is that a backtest sees only confirmed bars and a paper
run sees the newest bar while it is still moving.

The language handles this, and knowing how it handles it stops a whole class of
surprise:

- The newest bar is executed again on every update. `bar.updates` counts the
  executions.
- Before each re-execution, every `var` and every array a `var` holds is
  restored to what it was at the end of the previous bar. Executing the moving
  bar ten times gives the same answer as executing it once.
- Orders, signals and alerts do not fire on a bar that is still moving. They are
  deferred to the bar's close, and if the condition is no longer true by then
  they never happen at all.
- `live var` opts out of the rollback, and a script using it produces different
  numbers live than in a backtest. That is what it is for, and it is spelled
  with an extra word so the reader sees it coming.
- `onUnconfirmed = true` in the declaration lets orders fire on the moving bar.
  It is the option that makes paper and backtest diverge, and it hands the
  script responsibility for guarding itself.

The default file needs none of this:

```
version 1

strategy("Confirmed only", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots",
         product = "intraday", closeOnSessionEnd = true,
         fillOn = "nextOpen", slippage = 1,
         commissionType = "perTrade", commission = 20)

fast = ema(close, 9)
slow = ema(close, 21)

// There is no onUnconfirmed option here, so this is the default: the order is
// held until the bar closes, and a cross that appears mid-bar and is gone by
// the close never becomes an order at all.
if crossUp(fast, slow) and session.isOpen and pos.isFlat
    buy()

if pos.isLong and (crossDown(fast, slow) or not session.isOpen)
    close()

plot(fast, "Fast", aqua, width = 2)
plot(slow, "Slow", orange, width = 2)
```

If you set `onUnconfirmed = true`, write the guard yourself with
`bar.isConfirmed`, and expect the compiler to warn about every higher timeframe
read in the file, because that combination is where repainting comes from.

## What arming live changes, exactly

| Thing | Paper | Live |
|---|---|---|
| The source | The pinned revision | The same pinned revision |
| The compiled program | The same | The same |
| Bars | The host's feed | The same feed |
| Warmup | From loaded history | The same |
| Orders | Simulated account | The broker, through the host |
| Rejections | Rare, model-shaped | Real, with the destination's reason |
| Fill price | Your slippage model | The market |
| `pos.size` | Simulated fills | Real fills |
| `pos.equity` | Declared capital plus profit | Still declared capital plus profit, not the account balance |
| Logs | Per script | Per script |
| Stopping it | Stops the script | Stops the script, not the position |

Two rows need saying out loud.

**`pos.equity` is the strategy's own ledger.** It starts at the `capital` you
declared and moves with this strategy's realised and unrealised profit. It is
not your account balance, it does not know about your other strategies, and it
does not know about the margin the broker is holding. Sizing from it live means
sizing from a number that agrees with your account only if this strategy is the
only thing in it.

**Stopping a strategy stops the script, not the position.** That is a large
enough topic to have its own section on the scheduling page.

## The position a strategy does not know about

A strategy starts flat. It does not look at the account and adopt whatever is
there, and it does not resume the position it held before it was stopped.

This is the right default, and it is worth knowing why before it surprises you.
A position at the broker has no entry logic attached to it. The script's stop,
its target and its bar count since entry all describe a trade the current
process never took. Adopting the position would mean managing a trade with rules
that were never applied to its entry, which is worse than either flattening it
or managing it by hand.

The consequence is a rule: if a strategy is holding a position, do not restart
it without deciding what happens to that position first. The options are to
flatten before the restart, or to take the position over manually and restart
the strategy flat.

## A kill switch belongs in the script

The host can stop a strategy. The script can stop itself, and it should, because
the script is the thing that knows how badly the day is going.

```
version 1

strategy("Daily loss cap", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots",
         product = "intraday", closeOnSessionEnd = true,
         fillOn = "nextOpen", slippage = 1,
         commissionType = "perTrade", commission = 20)

lossCap = input(15000, "Stop trading after losing this much today", min = 1)

fast = ema(close, 9)
slow = ema(close, 21)

// Realised profit at the session's open, so the cap measures today rather than
// the whole run. Both names are declared at the top level, because a name first
// assigned inside a block does not escape the block.
var openingProfit = none
var halted = false

if session.isFirstBar
    openingProfit = pos.netProfit
    halted = false

// The line ends with ? and then with :, which is how a statement continues onto
// the next line: an operator, a comma, a ? or a : as the last token.
dayProfit = isNone(openingProfit) ?
            none :
            pos.netProfit - openingProfit + orElse(pos.openProfit, 0)

if not halted and not isNone(dayProfit) and dayProfit <= -lossCap
    halted = true
    close()
    signal("HALTED", red)

if not halted and crossUp(fast, slow) and session.isOpen and pos.isFlat
    buy()

if not halted and pos.isLong and crossDown(fast, slow)
    close()

plot(dayProfit, "Profit today", aqua, width = 2)
background(halted ? fade(red, 92) : none)
```

The cap is measured against realised profit at the session's open plus the open
position's unrealised profit, so it says what the day has cost, which is the
number a risk limit is actually about.

## The live state panel

Live, the question is never what the equity curve looked like. It is what the
strategy thinks it is holding right now, and whether it agrees with the broker.

```
version 1

strategy("Live state", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots",
         product = "intraday", closeOnSessionEnd = true)

fast = ema(close, 9)
slow = ema(close, 21)

if crossUp(fast, slow) and session.isOpen and pos.isFlat
    buy()

if pos.isLong and crossDown(fast, slow)
    close()

panel = table("Live state", 5, 2, position = "topRight", textColor = silver)

// Only the newest bar, and the rollback rule makes that safe on a live feed:
// the bar re-executes on every update and rewrites the same cells.
if bar.isLast
    cell(panel, 0, 0, "Position")
    cell(panel, 0, 1, text(pos.size))
    cell(panel, 1, 0, "Average price")
    cell(panel, 1, 1, pos.isFlat ? "flat" : text(pos.avgPrice, 2))
    cell(panel, 2, 0, "Open profit")
    cell(panel, 2, 1, pos.isFlat ? "flat" : text(pos.openProfit, 0))
    cell(panel, 3, 0, "Working orders")
    cell(panel, 3, 1, text(order.pending))
    cell(panel, 4, 0, "This bar")
    cell(panel, 4, 1, bar.isConfirmed ? "confirmed" : "still moving")
```

Compare those five values against the broker's own position screen once a day.
They should match, and the day they do not is the day you want to find out from
a panel rather than from a statement.

## Pre-flight checklist

Work through this before a strategy is armed. Every item is checkable, and none
of them is a matter of opinion.

**The script**

1. The file declares `version 1`, so it is pinned to a front end and will still
   compile the same way next year.
2. It compiles with no errors and, more importantly, you have read every
   warning. OS8001 (a stateful call inside a branch), OS8002 and OS8005 (a
   higher timeframe read that can repaint) and OS8004 (an absent condition
   changing a value used outside its block) each describe a real behaviour.
3. Every higher timeframe read uses the default confirmed mode, unless you
   deliberately chose otherwise and wrote down why.
4. The declaration does not set `onUnconfirmed = true`, unless intrabar action
   is the whole point and the script guards itself.
5. There is no `live var` you did not intend, because one makes live and
   backtest numbers differ by design.
6. Entries are guarded by `session.isOpen`, so an order cannot be refused with
   OS7012 for arriving outside the session.
7. There is an exit for every entry, and at least one exit that does not depend
   on a signal: a stop, a clock, or `closeOnSessionEnd = true`.
8. The size is computed, clamped and rounded to a whole lot, and the path where
   the size ends up absent refuses the trade rather than sending it.

**The numbers**

9. A backtest over a range covering more than one regime, with at least a
   hundred closed trades.
10. The cost model is set: slippage, commission and commission type, product,
    quantity type.
11. The result survives double the slippage.
12. The average trade is comfortably larger than the round-trip cost.
13. Maximum drawdown is measured bar by bar, and you have decided that you can
    sit through one that size.
14. You have run the strategy on paper, in real time, for long enough to see it
    trade: at least a week, and at least twenty fills.
15. The paper trade list and the backtest trade list over the same days agree
    except for fill prices. A difference in which trades were taken is a bug to
    find before arming.

**The account and the destination**

16. The instrument is one the account is permitted to trade, at the product type
    the declaration names.
17. The lot size and tick size the host reports are the instrument's real ones.
    `chart.lotSize` and `chart.tickSize` are absent when the host has not said,
    and a script sizing from an absent lot size will refuse to trade.
18. There is enough free margin for the size at the worst point of the backtest,
    not the average point.
19. The account has no manual position in the same instrument, or you have
    decided how the two will be told apart.
20. You know how to flatten manually, from the broker's own screen, without the
    strategy.

**The operations**

21. The strategy's start and stop times are set, on the right exchange calendar.
22. Logs are being written somewhere you can read them while it runs.
23. You know what happens if the process restarts mid-session, and you have
    accepted that answer.
24. The first live day is on the smallest size the instrument allows.
25. Somebody is watching for the first session. Not the whole quarter, the first
    session.

## Errors you will meet live and not on paper

| Code | Means | First thing to check |
|---|---|---|
| OS7014 | The destination rejected the order, with its reason | The reason text. It is the broker's, not the script's |
| OS7011 | The order needs more capital than the strategy has | Size, and the declared capital |
| OS7012 | The instrument is outside its trading session | The session guard on the entry |
| OS7005 | Quantity is not a multiple of the lot size | `order.roundToLot` on the computed size |
| OS7006 | Price is not on a tick | `roundToTick` on a limit or stop price |
| OS7002 | An order argument is absent | The sizing path that can produce absence |
| OS6009 | A data request failed | The feed, and whether the script depends on it to trade |

None of these stops the strategy silently. Each one names the argument or the
reason, which is the difference between a failed order you can fix in a minute
and one you find in a statement.

## See also

- [backtesting.md](./backtesting.md) for the run that comes before a paper run
- [reading-a-report.md](./reading-a-report.md) for judging that run honestly
- [scheduling.md](./scheduling.md) for start times, holidays, restarts and logs
- [../README.md](../README.md) for the documentation index
- [../../spec/language.md](../../spec/language.md) for the moving bar, the
  rollback rule and `onUnconfirmed`
- [../../spec/stdlib.md](../../spec/stdlib.md) for the order and position
  namespaces
- [../../examples/README.md](../../examples/README.md) for the three worked
  strategies
