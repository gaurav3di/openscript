# Paper and live

By the end of this page you will know exactly what paper mode does and does not
simulate, what changes at the moment a strategy is armed for live orders, and
you will have a pre-flight checklist to work through before a script touches a
real account.

## Three destinations, one program

A compiled program does not know where its orders go. The same instruction list
that a backtest runs is the one paper runs and the one a live connection runs.
What differs is the destination attached to it.

| Destination | Bars arrive | Orders go to | Money |
|---|---|---|---|
| Backtest simulator | All at once, all confirmed | A fill model over the bars | None |
| Paper | In real time, the newest bar still moving | A simulated account | None |
| Live | In real time, the newest bar still moving | A real destination, through the host | Yours |

That separation is the reason the numbers can be trusted. The chart shows what
happened, the destination decides what happens, and nothing in the language
reaches across. A strategy that placed an order and found no destination at all is
OS7015, which says so rather than computing a position nothing ever took.

## Paper is the default, and nothing in a script can change that

**A strategy is born unable to trade for real.** A new strategy sends its orders
to the paper destination, and so does a strategy whose source has just been
edited: an edit returns it to paper, and arming it again is a fresh decision.

Arming is a separate, deliberate act performed on that one strategy in the host,
and **nothing in a script can perform it**. There is no call, no declaration
option and no input that arms anything, and there is no combination of them that
adds up to one. Live is not a setting buried in the declaration and not an
argument on an order.

The reason is the asymmetry of the mistake. A live strategy running by accident
costs money and takes orders you did not choose to place. A paper strategy
running by accident costs a log file. When one direction of a mistake is
expensive and the other is free, the default belongs at the free end, and the
expensive direction gets a door you have to open with your hand on the handle. A
misconfigured script found after the fact cannot have been placing real orders,
which is the only guarantee worth having here.

**There is also no call that reports it.** A script cannot ask whether it is
armed, so it cannot behave differently when it is. That is not an omission: a
strategy that took a different branch once armed would be a strategy nobody had
ever tested, and the paper run would stop being evidence about the live run.

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
- Position accounting: `pos.size`, `pos.avgPrice`, `pos.barsHeld`, `pos.entries`,
  one position per leg, folded from this strategy's own settled fills and from
  nothing else.
- The ledger of `stdlib.md` section 17.7 and the fold of section 17.8, applied to
  the same frames in the same order.
- Which contract each leg resolved to. A relative contract resolves once, under
  `host-interface.md` section 9.4, on paper exactly as it does live.
- The cost model you declared: slippage in ticks, commission, lot rounding.
- The risk rules and the order they are evaluated in, and the named events they
  emit.

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
| Orders | Simulated account | A real destination, through the host |
| Rejections | Rare, model-shaped | Real, with the destination's own reason |
| Fill price | Your slippage model | The market |
| `pos.size` | Simulated fills, folded from the ledger | Real fills, folded from the same ledger |
| `pos.equity` | Declared capital plus this strategy's profit | The same, and still not the account balance |
| `pos.isShared` | Whatever the simulated account holds | True whenever something else is in that contract |
| Logs | Per script | Per script |
| Stopping it | Stops the script | Stops the script, not the position |

Three rows need saying out loud.

**`pos.equity` comes from the strategy's own books.** It starts at the `capital`
you declared and moves with this strategy's realised and unrealised profit. It is
not your account balance, it does not know about your other strategies, and it
does not know about the margin the account is carrying. Sizing from it live means
sizing from a number that agrees with your account only if this strategy is the
only thing in it.

**`pos.size` is the same number live as on paper, and for the same reason.** Both
are folded from this strategy's own settled fills. The strategy never reads an
account position row and never sends an order computed as a difference against
one, so the arrival of real money changes where the fills come from and nothing
about how they are counted.

**`pos.isShared` is the one thing the language will tell you about the account.**
It says that the account's position in a contract this strategy holds is larger
than the strategy's own. It is a boolean, there is no call that turns it into a
quantity, and live is where it earns its place: put it on a panel and it tells you
the day somebody else started trading your contract.

**Stopping a strategy stops the script, not the position.** That is a large
enough topic to have its own section on the scheduling page.

## The position a strategy does not know about

A strategy starts flat. It does not look at the account and adopt whatever is
there, and it does not resume the position it held before it was stopped.

This is the right default, and it is worth knowing why before it surprises you.
It is the same rule that runs through the whole order model: a strategy's
position is folded from the strategy's own settled fills, and an account position
row belongs to whoever traded it, which may be you by hand, another strategy, or
an earlier run of this one. There is no honest way to divide it, so the language
does not try.

There is a second reason, and it is the practical one. A position in the account
has no entry logic attached to it. The script's stop, its target and its bar count
since entry all describe a trade the current process never took. Adopting the
position would mean managing a trade with rules that were never applied to its
entry, which is worse than either flattening it or managing it by hand.

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
strategy's own books say it is holding right now, and whether they agree with the
account.

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

panel = table("Live state", 6, 2, position = "topRight", textColor = silver)

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
    cell(panel, 4, 0, "Shared with the account")
    cell(panel, 4, 1, pos.isShared ? "yes" : "no",
         textColor = pos.isShared ? red : silver)
    cell(panel, 5, 0, "This bar")
    cell(panel, 5, 1, bar.isConfirmed ? "confirmed" : "still moving")
```

Compare those six values against the account's own position screen once a day.
The first four describe the strategy's own books and the fifth admits when the
account holds more than they do. They should agree, allowing for what the fifth
row says, and the day they do not agree for any other reason is the day you want
to find out from a panel rather than from a statement.

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
   on a signal: a stop level, a clock rule such as `book.exitAt`, or
   `closeOnSessionEnd = true`.
8. The size is computed, clamped and rounded to a whole lot, and the path where
   the size ends up absent refuses the trade rather than sending it.
9. Every leg the file declares is declared at the top level with compile-time
   arguments, and you have read back what a relative one resolved to, with
   `leg.symbol(name)`, rather than assuming it. A relative contract resolves once,
   under `host-interface.md` section 9.4.
10. The risk rules you meant are set: per leg a stop and, where you want one, a
    target and a trail with its arming distance; per strategy a combined stop only
    if the file enters as a unit; per session an exit time, an expiry square off
    and a daily loss limit.

**The numbers**

11. A backtest over a range covering more than one regime, with at least a
    hundred closed trades.
12. The cost model is set: slippage, commission and commission type, product,
    quantity type.
13. The result survives double the slippage.
14. The average trade is comfortably larger than the round-trip cost.
15. Maximum drawdown is measured bar by bar, and you have decided that you can
    sit through one that size.
16. You have run the strategy on paper, in real time, for long enough to see it
    trade: at least a week, and at least twenty fills.
17. The paper trade list and the backtest trade list over the same days agree
    except for fill prices. A difference in which trades were taken is a bug to
    find before arming.
18. You have read the named events from the paper run and each square off was
    caused by the rule you expected, not by a rule you forgot you had set.

**The account and the destination**

19. The instrument is one the account is permitted to trade, at the product type
    the declaration names.
20. The lot size and tick size the host reports are the instrument's real ones.
    `chart.lotSize` and `chart.tickSize` are absent when the host has not said,
    and a script sizing from an absent lot size will refuse to trade.
21. There is enough free margin for the size at the worst point of the backtest,
    not the average point.
22. Nothing else is trading the same contract: no manual position, no second
    strategy, no second copy of this one. If something is, you have decided how
    the two will be told apart, and you know that `pos.isShared` is all the
    language will say about it.
23. You know how to flatten manually, from the destination's own screen, without
    the strategy.

**The operations**

24. The strategy's start and stop times are set, on the right exchange calendar.
25. Logs are being written somewhere you can read them while it runs.
26. You know what happens if the process restarts mid-session, and you have
    accepted that answer.
27. The first live day is on the smallest size the instrument allows.
28. Somebody is watching for the first session. Not the whole quarter, the first
    session.

## Errors you will meet live and not on paper

| Code | Means | First thing to check |
|---|---|---|
| OS7014 | The destination rejected the order, with its reason | The reason text, which `order.rejection(tag)` reads back. It is the destination's own words, not the script's |
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
- [../strategies/reading-the-books.md](../strategies/reading-the-books.md) for the
  books you reconcile against the account
- [../strategies/exits-and-brackets.md](../strategies/exits-and-brackets.md) for
  the risk rules and the events they emit
- [../README.md](../README.md) for the documentation index
- [../../spec/language.md](../../spec/language.md) for the moving bar, the
  rollback rule and `onUnconfirmed`
- [../../spec/stdlib.md](../../spec/stdlib.md) section 17 for the order, leg,
  position and book namespaces, and for arming
- [../../examples/README.md](../../examples/README.md) for the three worked
  strategies
