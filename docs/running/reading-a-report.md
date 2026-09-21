# Reading a report

By the end of this page you will know what every number in a backtest report is
actually measuring, which numbers flatter a strategy while saying nothing, and
how to decide whether the difference between two runs is a real improvement or
noise.

## A report is one list, one curve and a record of what fired

Everything in a report comes from three things: the trade list, the equity curve
and the run's record of named events. The trade list is the record of what was
entered, at what price, when it closed and for how much. The equity curve is the
run's value marked at every bar's close. The event record says which rule caused
each transition. Every headline number is derived from the first two, and every
one of them throws information away in the process.

**All three come from the strategy's own order and fill ledger.** Not from an
account position row: an account position is held per contract and can have more
than one owner, so a report built from it would be a report about somebody else's
trades as much as your own. Every number below is a sum over the fills this
strategy actually got.

So read in this order: the curve, then the distribution of trades, then the events
that closed them, then the summary numbers, and never the other way round. The
summary is what a strategy says about itself. The curve, the list and the events
are what it did.

## The equity curve

Equity is starting capital plus realised profit plus unrealised profit, all of it
folded from this strategy's own settled fills, marked to each bar's close. The
language exposes the same quantity to the script as `pos.equity`, so a strategy
can plot the curve the report draws.

It is worth saying what that curve is not. It is not the account's value. It
starts at the `capital` the declaration named, it counts only this strategy's
fills, and it knows nothing about your other strategies or the margin the account
is carrying. Two strategies on one contract produce two honest equity curves that
do not add up to the account, and neither of them is wrong.

Two properties are easy to miss.

**It is marked bar by bar, not trade by trade.** A position that is 40,000 down
in the middle of a week that ends flat shows that fall in the curve, because the
curve is marked at every close. A trade-by-trade equity line would not show it
at all. This is the single biggest source of disagreement between two drawdown
numbers for the same strategy.

**It is marked to the close, not to a bid or an ask.** The run values an open
position at the last traded price of the bar, which is not the price you would
get out at. On a wide instrument this understates every drawdown by roughly half
a spread per unit held.

What to look at in the curve, before any number:

| What you see | What it usually means |
|---|---|
| A single steep section carrying the whole run | The result is one period, not a strategy |
| Steps of equal height | A fixed size and a fixed target. Check whether the size was realistic |
| A long flat stretch | The rules stopped firing. Find out which regime that was |
| Smooth to the point of unreality | Look for a lookahead read or `fillOn = "close"` |
| A curve that only rises with the market | The strategy is long exposure with extra steps |

## Drawdown, and how it is measured

A drawdown is the fall from the highest equity the run has reached so far to the
lowest point after it, before a new high is made. Maximum drawdown is the
largest such fall in the run.

The definition has two knobs, and a report that does not say which it used is a
report you cannot compare with another one.

| Knob | Option A | Option B | Effect |
|---|---|---|---|
| What is marked | Every bar, including open positions | Only closed trades | Closed-trade drawdown is always smaller, often by half |
| How it is expressed | Money | Percent of the peak | Percent shrinks late drawdowns on a growing account |

The honest measure is the one that includes open positions, marked at every bar,
expressed as a percentage of the peak that preceded it. It is honest because it
is the number you would have been looking at while it was happening, and that is
the number that decides whether a strategy gets switched off.

A worked illustration of how much the choice matters. Three trades, starting
equity 100,000:

| Trade | Worst point while open | Closed at |
|---|---|---|
| 1 | -18,000 | +6,000 |
| 2 | -4,000 | -3,000 |
| 3 | -22,000 | +14,000 |

Measured on closed trades only, the worst fall is 3,000, or 3 percent. Measured
bar by bar, it is 22,000, or 22 percent. Same trades, same net profit of 17,000,
and two numbers that would lead to two different decisions about position size.

Compute it in the script and you never have to wonder which one the report used:

```
version 1

strategy("Equity and drawdown", precision = 2,
         capital = 500000, qty = 1, qtyType = "lots",
         slippage = 1, commissionType = "perTrade", commission = 20)

fast = ema(close, 9)
slow = ema(close, 21)

if crossUp(fast, slow) and pos.isFlat
    buy()

if crossDown(fast, slow) and pos.isLong
    close()

// The peak persists, because a drawdown is measured against the highest equity
// the run has ever reached and not the highest one in any window.
var peak = none
if isNone(peak) or pos.equity > peak
    peak = pos.equity

fallPct = isNone(peak) or peak == 0 ? none : (pos.equity - peak) / peak * 100

var worstPct = 0.0
if not isNone(fallPct) and fallPct < worstPct
    worstPct = fallPct

plot(pos.equity, "Equity", aqua, width = 2)
plot(peak, "Peak equity", fade(silver, 40), style = "step")
plot(worstPct, "Worst drawdown percent", red, style = "step")
```

`pos.maxDrawdown` is listed in the library as planned rather than shipped, so
the eleven lines above are how a version 1 script gets the number today. They
are worth keeping even after it ships, because they make the definition visible.

### Time under water

Depth is only half of a drawdown. The other half is how long it lasted: the
number of bars, or better the number of days, between a peak and the recovery of
that peak. A 12 percent drawdown that recovers in nine days and a 12 percent
drawdown that takes seven months are the same number and completely different
experiences, and only one of them is survivable while somebody is watching.

Read the longest time under water alongside the deepest drawdown. If the report
does not carry it, the equity curve shows it: find the widest gap between a peak
and the next crossing of that same level.

## Win rate against expectancy

Win rate is the share of closed trades that made money. On its own it is close
to meaningless, because it says nothing about size.

The number that means something is expectancy: the average result of a trade.

```
expectancy = winRate * averageWin - (1 - winRate) * averageLoss
```

where `averageLoss` is a positive number. Three strategies with the same
expectancy of 400 per trade:

| Strategy | Win rate | Average win | Average loss | Expectancy | Longest losing run to expect |
|---|---|---|---|---|---|
| A | 75% | 1,200 | 2,000 | 400 | short |
| B | 50% | 2,400 | 1,600 | 400 | moderate |
| C | 25% | 6,400 | 1,600 | 400 | long |

All three make the same money per trade over a large enough sample. They are not
interchangeable. C spends most of its life losing, so it needs a size small
enough that ten losses in a row is an inconvenience, and it needs a trader who
will still be placing the eleventh. A has the opposite problem: its losses are
larger than its wins, so a single run of bad luck undoes many wins and it feels
wrong in a way that invites interference.

Two derived numbers are worth having next to expectancy.

**Profit factor** is gross profit divided by gross loss. Above 1 is profitable.
It is a useful shape check, and it is fragile on small samples, because one
large win moves it a long way. On fewer than fifty trades, treat it as a
description rather than a measurement.

**Payoff ratio** is average win divided by average loss. It tells you which of
the three shapes above you are holding, which tells you what a normal bad week
will look like.

## The trade distribution

The summary numbers are all averages, and an average is a poor description of a
set of trades, because trade results are not evenly spread: a minority of trades
usually carries the result.

Five tests, in order of how often they change someone's mind:

**Remove the best five trades.** If the run is still profitable, the strategy has
an edge. If it is not, the run is five lucky trades with a long tail of noise
attached. Do the same with the worst five to see how much of the risk is
concentrated.

**Compare the median trade with the mean trade.** A median far below the mean
says a few large wins are doing the work. A median close to the mean says the
edge is spread across the sample, which is much harder to get by luck.

**Look at the largest win as a share of net profit.** Above about a third, the
result is one trade.

**Count the longest run of losses.** Then ask whether you would have kept the
strategy running through it. A strategy you would have switched off has an
expectancy of zero, whatever the report says.

**Split the trades by anything that is not the rules.** Long against short, by
weekday, by time of day, by month, by whether the market was above or below its
own long average. If the whole edge lives in one bucket, you do not have the
strategy you think you have, you have a filter you have not written down.

A panel makes the first few of these visible while the run is still on screen:

```
version 1

strategy("Run summary", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots",
         slippage = 1, commissionType = "perTrade", commission = 20)

fast = ema(close, 9)
slow = ema(close, 21)

if crossUp(fast, slow) and pos.isFlat
    buy()

if crossDown(fast, slow) and pos.isLong
    close()

panel = table("Run summary", 4, 2, position = "topRight", textColor = silver)

// Written only on the newest bar. A panel shows one state, so writing it on
// every bar to display the last one is thousands of wasted writes.
if bar.isLast
    cell(panel, 0, 0, "Closed trades")
    cell(panel, 0, 1, text(pos.tradeCount))
    cell(panel, 1, 0, "Net profit")
    cell(panel, 1, 1, text(pos.netProfit, 0))
    cell(panel, 2, 0, "Average trade")
    cell(panel, 2, 1, pos.tradeCount > 0
                      ? text(pos.netProfit / pos.tradeCount, 0)
                      : "no trades yet")
    cell(panel, 3, 0, "Equity")
    cell(panel, 3, 1, text(pos.equity, 0))
```

## Which rule closed each trade

The trade list says a trade closed. The event record says what closed it, by name,
with the rule's own level and the value that crossed it. Sorting the closed trades
by the event that ended them is one of the fastest reads in the whole report,
because the shape of that distribution is a statement about the strategy that no
summary number carries.

| What you find | What it usually means |
|---|---|
| Almost every trade ends in `legTargetHit` | The target is too close. Look at what the winners gave up after the exit |
| Almost every trade ends in `legStopHit` | The stop is inside the instrument's normal noise |
| A large share end in `exitTimeSquareOff` or `sessionEndSquareOff` | The idea has no exit of its own and the clock is doing the work |
| `dailyLossHit` appears at all | Read those days separately. The limit fired, so the rest of each of those days is not evidence about the rules |
| `combinedStopHit` with no `legStopHit` anywhere | Correct for a strategy that enters as a unit: the book rule takes the position off before the leg rules are reached |
| `trailArmed` far more often than `trailAdvanced` | The trail arms and the trade turns. The arming distance is too small for the instrument |
| `lockProfitTriggered` on the best days | The floor is taking trades off while they are still working. Widen the step, or the advance |

Two cautions about reading it.

**An event is a record, not a value.** No call reads one, so a script cannot branch
on its own stop having fired. That is deliberate: a script that did would be
deciding twice what the rule already decided once, and the second decision would
be the one nobody tested. The events are there for you and for the report.

**A square off ends the sequence for that bar.** The rules are evaluated in a fixed
order, and a rule that takes the book off means the rules below it emit nothing. So
the absence of a `legStopHit` on the bar a `combinedStopHit` fired is not a missing
leg stop, it is the order of evaluation working. Read the list of events on one bar
as a sequence that stopped, not as a set.

## Numbers that flatter a strategy while meaning nothing

| Number | What it hides | Read it next to |
|---|---|---|
| Total return | Every drawdown on the way | Maximum drawdown, bar by bar |
| Annualised return from a short run | That annualising a lucky quarter produces a fantasy | The length of the run and the trade count |
| Win rate | Trade size | Expectancy and payoff ratio |
| Profit factor on 30 trades | Sampling noise | Trade count and the result with the best five removed |
| Net profit | Position size, which you chose | Return on the capital actually at risk |
| Average trade | The distribution | Median trade and largest win share |
| Largest winning trade | Nothing. It is a lottery result | Whether the result survives without it |
| Sharpe-style ratios on daily marks of an intraday strategy | That the marks are not measuring the risk taken | Intraday drawdown |
| Percent profitable months | Size again. Eleven small wins and one ruinous loss is 92 percent | The worst month |
| Return since inception | That the start date was chosen after seeing the data | The same run started a year earlier and a year later |

One number deserves its own paragraph. **Average trade smaller than your costs**
is not a marginal strategy, it is a strategy that does not exist. If the average
trade is 180 and the round-trip cost is 200, every improvement you find will be
inside the cost model. Check this first, before anything else, because it saves
weeks.

## Telling a real improvement from noise

This is the part of comparing two runs that people get wrong, and it is the
reason a backtest system is judged on whether two runs can be compared at all.

### Change one thing

Both runs pin a revision. Both use the same symbol, exchange, interval, range,
inputs and cost settings, except the single thing under test. If you changed a
parameter and extended the range in the same step, you have measured nothing and
the only fix is to run it again.

### The unit of evidence is a trade, not a day

A run that covers four years is not four years of evidence. It is however many
trades it took. Sixty trades is sixty observations, whether they arrived over a
month or a decade.

### The noise band, with arithmetic

Take the per-trade results, compute the mean and the standard deviation, and
divide the deviation by the square root of the number of trades. That is the
standard error of the mean trade: roughly how far the measured average sits from
the true average by luck alone.

A concrete case. Run A: 120 trades, mean trade 420, standard deviation 3,800.

```
standard error = 3800 / sqrt(120) = 347
```

So run A's true mean trade is somewhere around 420 plus or minus about 700 at
two standard errors, which is a range from roughly -280 to 1,120. Run B comes
back with a mean trade of 700 over a similar sample. The difference is 280,
which is smaller than the error on either run taken alone. There is no evidence
here. Run B is not better, it is differently lucky.

Roughly how large does a difference have to be? Compare it against the standard
error of the difference, which for two independent runs of similar spread is
about 1.4 times one run's standard error. In this example that is close to 500,
so anything under about 1,000 per trade is inside the noise at two standard
errors.

The uncomfortable consequence: with a noisy strategy and a hundred trades, only
a very large improvement is detectable at all. Most of the parameter tweaks
people make are unmeasurable with the data they have, and the way to make them
measurable is more trades, not more confidence.

The script can carry the arithmetic, which keeps it in front of you:

```
version 1

strategy("Trade statistics", precision = 2,
         capital = 500000, qty = 1, qtyType = "lots",
         slippage = 1, commissionType = "perTrade", commission = 20)

fast = ema(close, 9)
slow = ema(close, 21)

if crossUp(fast, slow) and pos.isFlat
    buy()

if crossDown(fast, slow) and pos.isLong
    close()

// pos.netProfit moves only when a trade closes, so the change since the last
// close is that trade's own result. pos.tradeCount is what says a close
// happened, because a result of exactly zero would otherwise be invisible.
var results: array<number> = []
var lastProfit = 0.0
var lastCount = 0

if pos.tradeCount > lastCount
    push(results, pos.netProfit - lastProfit)
    lastProfit = pos.netProfit
    lastCount = pos.tradeCount

closed    = size(results)
meanTrade = closed > 0 ? avg(results) : none
spread    = closed > 1 ? stdev(results) : none
stdError  = isNone(spread) ? none : spread / sqrt(closed)

plot(meanTrade, "Mean trade", aqua, width = 2, style = "step")
plot(isNone(stdError) ? none : meanTrade + 2 * stdError, "Upper", gray, style = "step")
plot(isNone(stdError) ? none : meanTrade - 2 * stdError, "Lower", gray, style = "step")
```

Read the last values on the newest bar. If the band of the new version overlaps
the mean of the old one, you have not shown an improvement.

### When the two runs overlap, compare the trades that differ

Most changes do not alter every trade. If 92 of 100 trades are identical in both
runs, then the comparison is really about eight trades, and the whole-sample
standard error is far too generous a test. Pair the runs instead: list the
trades that differ, take the difference in result for each, and test whether
that set of differences has a mean away from zero. A paired comparison is much
more sensitive, because everything the two runs share cancels out.

If nothing differs, say so and move on. A change that alters no trade is not an
improvement, it is a preference.

### Four checks that are not arithmetic

**Is the improvement a plateau or a spike?** Run the neighbouring parameter
values too. A length of 21 that beats 20 and 22 by a wide margin is a fit to
this particular history. A length of 21 sitting on a broad region that all works
about equally well is a finding.

**Does it survive the other half?** Run the same comparison on the section you
held back. An improvement that appears on the tuning section and vanishes on the
held-back section is a description of the tuning section.

**Does it survive double the costs?** If the improvement disappears when
slippage doubles, what you improved was the cost assumption.

**Was it the twentieth thing you tried?** Every comparison you run raises the
chance that one of them looks good by accident. Twenty tests at a one in twenty
threshold produce one impressive result from pure noise, on average. Count your
tests honestly and raise the bar as the count rises.

### Symptoms and their usual causes

| Symptom | Likely cause | Test |
|---|---|---|
| Huge gain from a tiny parameter change | Fitting to one period | Run the neighbours |
| Improvement only in one year | Regime, not edge | Split the range by year |
| Win rate up, net profit down | The change cut winners short | Compare payoff ratios |
| More trades and a better average | Suspicious. Usually a cost or fill assumption | Double slippage |
| Better on the tuning section only | Overfitting | Run the held-back section |
| Both runs identical except two trades | Nothing was measured | Pair the differing trades |
| Curve smoother, drawdown unchanged | Marking changed, risk did not | Check the drawdown definition |

## See also

- [backtesting.md](./backtesting.md) for producing the run this page reads
- [sandbox-and-live.md](./sandbox-and-live.md) for what a report does not predict
- [scheduling.md](./scheduling.md) for running strategies day after day
- [../strategies/exits-and-brackets.md](../strategies/exits-and-brackets.md) for
  every named event and the order the rules are evaluated in
- [../strategies/reading-the-books.md](../strategies/reading-the-books.md) for the
  ledger every number here is folded from
- [../README.md](../README.md) for the documentation index
- [../../spec/stdlib.md](../../spec/stdlib.md) for the `pos` namespace and what
  each field is marked to
- [../../spec/language.md](../../spec/language.md) for the strategy options that
  set the cost model
- [../../examples/README.md](../../examples/README.md) for the three worked
  strategies
