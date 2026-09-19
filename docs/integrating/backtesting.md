# Backtesting on your own infrastructure

By the end of this page you will know exactly which parts of a backtest you get,
which parts you supply, and why the line falls where it does.

---

## What you get

Everything that produces a number:

- Order simulation: entries, exits, reversals, and what happens when an order is
  still working as the next signal arrives
- Fills, the ledger, and the cumulative frame fold
- Position, average price, open and realised profit and loss
- Stops, targets, trailing stops and their arming, per leg and combined across a
  strategy
- The report arithmetic: equity curve, drawdown, trade list, win rate,
  expectancy

## What you supply

Everything else:

- **Bars.** From wherever you keep them
- **Instrument facts.** Tick size, lot size, and what your symbology calls things
- **The cost numbers.** Brokerage, exchange and regulator charges, taxes, stamp
  duty, and your assumed slippage
- **The job.** Starting a run, tracking it, storing the result
- **The page.** Rendering the report

## Why the line is there

Everything on the first list has to be **identical in every engine**, and is
provable by the conformance suite. If the equity curve were computed by the host,
then a quick backtest in a trader's browser and a scheduled one on your servers
could differ, and nobody could tell which was right.

Everything on the second list **should** differ between platforms. A broker on
another continent has different charges, different instruments and a different
report page, and a language that hardcoded ours would be useless to them.

The cost model is the subtle one. If the language shipped one market's charges it
would not travel; if it had no cost model at all every backtest would be a
fiction, because costs are frequently the difference between a strategy that
makes money and one that does not. So the language defines the **shape** and you
fill in the numbers.

## The design the constraints push you toward

**A run is a job.** Start it, return an identifier, report progress on a channel
you already keep open. Any proxy in front of you has a read timeout and a long
backtest will exceed it. A user seeing a gateway error while the run continues
behind it is the worst version of this.

**The computation runs in its own process.** An engine pass over a long history
has no pause in it. Sharing a thread with request handling stops everything for
everyone until it finishes.

**Nothing large travels in a request body.** Results are fetched by identifier.
The smallest deployment you support sets that budget, not the most generous one.

None of those is a compromise. They are what you would want anyway for a run that
survives a page reload.

## Reproducibility, which is the point of a backtest

A result nobody can reproduce is an anecdote.

Three things make a run reproducible, and the first is the one most systems miss:

**Pin the script revision.** Editing a script must not change a result that was
already produced. A report records the exact revision that made it, so the same
numbers come back in six months.

**Prefer a stored history to a live refetch.** A broker may revise a bar. A
backtest that refetches produces different numbers on Tuesday than it did on
Monday, for reasons nobody can see afterwards. A local store does not.

**Record the cost settings with the run.** Charges change. A result computed
under last year's charges is not wrong, but it is not comparable to one computed
under this year's unless you can see both.

## Comparing two runs

Traders change one parameter and look at the difference, so this is not a
nicety. Store enough with each run that a comparison is meaningful: the inputs,
the date range, the cost settings, the script revision, and the resulting trade
list.

The thing worth designing for is telling a **real improvement from noise**. Two
runs differing by one trade over a year is not an improvement, and a report that
presents it as one teaches people to overfit.

## The honest limit of any backtest

Worth putting in your own interface, not just ours.

A backtest assumes the fills it models. It cannot know that your order would have
moved the market, that the spread was wider than the bar suggests, or that the
exchange was slow that morning. Modelled costs are an estimate. Modelled slippage
is a guess with a number attached.

The numbers are as good as the assumptions, and a report that presents them
without saying so is selling a certainty it does not have.
