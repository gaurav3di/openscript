# What makes a script a strategy

By the end of this page you will be able to turn a study that marks a signal into
a strategy that takes a position, and to describe exactly what happens, in what
order, on every bar that strategy runs on: your own statements, then the fills
that have settled, then the risk rules the engine evaluates on top of them.

## One declaration is the whole difference

A file carries exactly one declaration, and it is the first statement after the
optional `version` line. `study(...)` declares a script that draws. `strategy(...)`
declares a script that draws and can also place orders.

```
version 1

strategy("Cross, traded", overlay = true, capital = 500000)

fast = ema(close, 9)
slow = ema(close, 21)

if crossUp(fast, slow) and pos.isFlat
    buy(qty = 1)
else if crossDown(fast, slow) and pos.isLong
    close()

plot(fast, "Fast", aqua, width = 2)
plot(slow, "Slow", orange, width = 2)
```

Change the first word to `study` and the file stops compiling: the order functions
are not available outside a strategy, and the compiler says so and names the
declaration to change. Change it back and the plots are unaffected. That is the
point of the design: `strategy()` accepts every option `study()` accepts and adds
the trading options, so one file holds the drawing and the trading, computed once,
from the same numbers.

The reason is worth stating because it is the reason the language exists. When the
indicator lives in one file and the trading rules live in another, the two drift.
A length gets tuned on the chart and not in the rules, a source changes from
`close` to `hlc3` in one place only, and the backtest quietly stops describing the
thing on the screen. One file cannot drift from itself.

## The strategy options

Every `study()` option (`title`, `short`, `overlay`, `precision`, `format`,
`range`, `scale`, `group`, `onUnconfirmed`) applies to a strategy too. These are
the additions:

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

Every option value must be a compile-time constant: a literal, arithmetic over
literals, or a call to `input()`. The settings dialog and the legend are built
before the first bar runs, so an option that depended on a bar's data would have
nothing to be built from.

Two defaults are opinions rather than conveniences, and both are set against you
on purpose. `fillOn` defaults to `"nextOpen"` because a decision made from a bar's
close cannot be filled at that same close in the real market. `pyramiding`
defaults to `1` because a script that adds to a position by accident reports a
return the stated rules never earned.

## A strategy keeps its own books

Before any of the calls, one rule, because everything else on these pages follows
from it.

**A strategy keeps its own order and fill ledger, and never places an order that
computes a delta against the account's position.** Every order states its own side
and its own quantity outright. The engine does not read the account's position,
under `stdlib.md` section 17.1, and the ledger it folds instead is
`stdlib.md` section 17.7.

The failure that rule prevents is silent, which is why it is a rule and not a
default. An account position is held per contract, not per strategy. A trade you
placed by hand, a second strategy on the same contract, or this same script started
twice all land in that one row. An order that read the row and sent the difference
would be computing against somebody else's trade: two such strategies would each
keep undoing the other for the rest of the session, and neither would be wrong from
where it was standing. With a manual position in the way, a strategy would instead
see its target already met, never enter, report no trade, and leave a stop resting
against a position that is not its own.

Three consequences you will meet on the next few pages:

- A strategy holds **one position per leg**, where a leg is one contract it
  trades, and no order crosses zero.
- Profit and loss comes from the strategy's own fills. `pos.netProfit`,
  `pos.openProfit` and `pos.equity` are sums over them, not readings of an account.
- Where the account holds a position in a contract this strategy also holds,
  `pos.isShared` says so. No call returns the account's quantity as a number,
  because a script that could read it would compute against it.

[reading-the-books.md](./reading-the-books.md) is the page that shows how to read
those books from a script, and why one fill can be reported twice without being
counted twice.

## Plotting a signal is not taking a position

These three calls look similar in a file and do entirely different things.

| Call | What it does | Can it be refused | Does it move money | When it happens |
|---|---|---|---|---|
| `signal("BUY")` | Draws one named marker on this bar | No | No | When the bar is confirmed |
| `alert("...")` | Raises one watched condition for the host to deliver | No | No | When the bar is confirmed |
| `buy(qty = 1)` | Sends one order to the order route | Yes, by several rules | Yes | Placed when the bar is confirmed, filled later |

A marker is a statement about the chart. It is drawn, it is always drawn, and
nothing about the instrument, the account or the exchange can prevent it. An order
is a request to somebody else. It can be refused for a quantity that is zero or
negative (OS7004), for a quantity that is not a whole multiple of the lot size
(OS7005), for a price that does not fall on a tick (OS7006), for breaching the
declared pyramiding limit (OS7008), for needing more capital than the strategy has
(OS7011), for arriving outside the instrument's trading session (OS7012), or by
the destination itself with its own reason (OS7014).

**Not raised yet.** OS7005, OS7011, OS7012 and OS7014 are in the catalogue and
nothing raises them. Nothing compares an order's quantity with the lot size its
leg trades in. Nothing compares an order's cost with the capital the strategy
has. Nothing compares the bar's time with the instrument's session before an
order is sent. A destination's own refusal is folded into the ledger row as a
status and its text, and is reported against no line.

This is why a strategy is not just a study with the markers renamed. Every refusal
above is a bar where the chart shows an arrow and the account holds nothing.

Here is the same idea written twice. First as a study, which only marks:

```
version 1

study("Cross, marked", overlay = true, precision = 2)

fastLen = input(9,  "Fast length", min = 1, max = 500)
slowLen = input(21, "Slow length", min = 1, max = 500)

fast = ema(close, fastLen)
slow = ema(close, slowLen)

plot(fast, "Fast", aqua, width = 2)
plot(slow, "Slow", orange, width = 2)

if crossUp(fast, slow)
    signal("BUY", at = "below", shape = "triangleUp")

if crossDown(fast, slow)
    signal("SELL", at = "above", shape = "triangleDown")
```

Then as a strategy, which takes the position. Note what had to be added: a size, a
test of what is already held, and a decision about which of two conditions wins
when both are true.

```
version 1

strategy("Cross, traded", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots",
         fillOn = "nextOpen", slippage = 1,
         commissionType = "perTrade", commission = 20)

fastLen = input(9,  "Fast length", min = 1, max = 500)
slowLen = input(21, "Slow length", min = 1, max = 500)

fast = ema(close, fastLen)
slow = ema(close, slowLen)

// Both tests are computed at the top level, because the second one sits in an
// else if, which is only evaluated on the bars the first test is false.
goLong = crossUp(fast, slow)
goFlat = crossDown(fast, slow)

// else if, not a second if. Two opposite orders on one bar is an error
// (OS7013), because there is no defensible rule for which one wins: source
// order is an accident of layout.
if goLong and pos.isFlat
    buy(qty = 1)
else if goFlat and pos.isLong
    close()

plot(fast, "Fast", aqua, width = 2)
plot(slow, "Slow", orange, width = 2)
plot(pos.isFlat ? none : pos.avgPrice, "Entry", fade(silver, 40), style = "step")
```

The last plot is the habit worth forming early. It draws the average price of the
position while one is open and nothing while flat, because plotting an absent
value leaves a gap rather than drawing a zero. A strategy whose position is
visible on the chart is a strategy whose bugs are visible on the chart.

## The loop a strategy runs in

There is no main function and no entry point. The file is the body of a per-bar
loop, and for each bar in the dataset, in chronological order, the engine runs
every top-level statement from the first line to the last.

For a strategy, one execution of one bar goes like this:

| Step | What happens |
|---|---|
| 1 | The engine takes the bar from the host and fills `open`, `high`, `low`, `close`, `volume`, `time` and the `bar` facts |
| 2 | Every frame the destination has sent has been folded into the strategy's ledger, and every fill that settled is part of the position, so `pos.size`, `pos.avgPrice` and the rest describe what is actually held right now |
| 3 | Inputs are read from the settings dialog |
| 4 | The script runs, top to bottom, once |
| 5 | Every plot, fill, level, table cell and drawing is published, whether the bar is confirmed or not |
| 6 | The risk rules are evaluated, in the fixed order given in [exits-and-brackets.md](./exits-and-brackets.md): the session limits first, then the combined rules, then each leg's own stop, target and trail |
| 7 | If the bar is confirmed, every marker, alert and order the script or a rule asked for is applied. If it is not confirmed, they are discarded |

Step 2 is where the ledger does its quiet work. A frame is cumulative, under
`host-interface.md` section 7.2, and frames repeat, so the fold of `stdlib.md`
section 17.8 is what stops one fill from being counted twice. Nothing about that
reaches your script except the guarantee that the position it reads is right.

Step 7 is the one that surprises people, so it is worth being exact about it. When
`buy(qty = 1)` executes, nothing is sent. The call records what it was asked to
do, and the record is applied at the end of the bar, only if the bar is confirmed.
On a bar that is still moving, the record is thrown away and rebuilt from scratch
on the next update. A condition that was true halfway through a bar and false when
the bar closed therefore never places an order at all.

That is exactly what you want from a signal you would not have taken by hand. The
cost of it is that an order function gives you nothing usable at the moment it
runs: it cannot hand back an identifier for an order that may never exist. A
script that needs to act on an order it placed reads the `pos` and `order`
namespaces on a later bar, where the fact is real.

```
version 1

strategy("Reading back a fill", overlay = true, capital = 500000)

entered = crossUp(ema(close, 9), ema(close, 21)) and pos.isFlat

if entered
    buy(qty = 1)

// Not on the entry bar: the order was placed at the close of that bar and
// filled at the open of this one, so this is the first bar on which the
// position is a fact rather than an intention.
justFilled = pos.isLong and pos.barsHeld == 0

if justFilled
    signal("FILLED AT " + text(pos.avgPrice, 2), at = "below")
```

Two further consequences of the loop, both of which catch people once:

**A script may not assume it runs once on the newest bar.** The newest bar of a
live chart is executed again on every update. Before each re-execution the engine
restores every persistent value to what it held at the end of the previous bar, so
running the moving bar ten times gives the same answer as running it once. That
rollback is what makes a live chart and a backtest of the same data agree, and it
is why a counter written with `var` counts bars rather than ticks.

**A strategy that wants to act intrabar has to say so.** Setting
`onUnconfirmed = true` in the declaration lifts the deferral, and from then on the
script is responsible for its own confirmation rules:

```
version 1

strategy("Intrabar, guarded", overlay = true, onUnconfirmed = true)

// With the deferral lifted, the guard has to be written by hand, or this places
// an order on every tick of the bar.
if crossUp(ema(close, 9), ema(close, 21)) and bar.isConfirmed and pos.isFlat
    buy(qty = 1)
```

## The guards every strategy needs

A strategy is mostly the same code as the study plus four guards. They are worth
learning as a set, because leaving one out produces a backtest that looks fine and
is not.

| Guard | Written | Why |
|---|---|---|
| Warmup | `not isNone(x)` | A window that has not filled is absent, and an order given an absent price or quantity is refused (OS7002) |
| Position | `pos.isFlat`, `pos.isLong` | Entering again on every bar the condition stays true is how a one-lot idea becomes a forty-lot position |
| Exclusivity | `else if` | Two opposite orders on one leg on one bar is OS7013 |
| Session | `session.isOpen` | An order outside the session cannot be worked by the exchange (OS7012) |

**Not raised yet.** OS7012 is in the catalogue and nothing raises it: nothing
compares the bar's time with the instrument's session before an order is sent.

```
version 1

strategy("Breakout, guarded", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots",
         product = "intraday", closeOnSessionEnd = true)

length = input(20, "Breakout lookback", min = 2, max = 500)

// The window as it stood before this bar, so this bar's own high cannot be the
// level this bar is breaking. Computed at the top level, never inside the if,
// because a stateful call in a branch only advances on the bars the branch is
// taken (OS8001).
breakoutLevel = highest(high, length)[1]

ready = not isNone(breakoutLevel)

if ready and session.isOpen and pos.isFlat and close > breakoutLevel
    buy(qty = 1)

plot(breakoutLevel, "Breakout level", aqua, style = "step")
```

## One file, three places it runs

The same compiled strategy runs in a backtest over stored bars, in sandbox mode
against live bars, and against a real order destination, and the numbers do not
change between them. What changes is where the orders go. Orders reach the host's
order interface, at the sandbox destination by default; nothing about them is part of the chart. What
reaches the chart is their consequence: each settled fill becomes one marker, and a
strategy that wants its stop or its target drawn plots it like any other value. The
named events the risk rules emit reach the run's record and the host's log rather
than the chart.

That separation is deliberate, and it is the shortest statement of the whole
model: the chart shows what happened, the destination decides what happens.

A strategy with no order destination configured is not run silently. The host
reports OS7015, and the stated fix is the honest one: connect a destination, or
run the file as a `study()` with `signal("BUY")` in place of `buy()`.

**Not raised yet.** OS7015 is in the catalogue and nothing raises it: a strategy
with nowhere to send orders places intents that reach nobody.

## A strategy cannot trade for real until it is switched to live

**A strategy is born unable to trade for real.** A new strategy, and a strategy
whose source has just been edited, sends its orders to the sandbox destination.
Switching it to live is a separate, deliberate act performed on that one strategy
in the host, and **nothing in a script can perform it**. There is no call, no
declaration option and no input that switches anything, and there is no
combination of them that adds up to one.

The reason is the asymmetry of the mistake. A live strategy running by accident
costs money and takes orders nobody chose to place. A sandbox strategy running by
accident costs a log file. When one direction of a mistake is expensive and the
other is free, the default belongs at the free end, and the expensive direction
gets a door you have to open with your hand on the handle. A misconfigured script
found after the fact cannot have been placing real orders, which is the only
guarantee worth having here.

There is also no call that reports it. A script cannot know whether it is live, so
it cannot behave differently when it is, and the run that was tested in sandbox
mode is the run that goes to market. A strategy that behaved differently once live
would be a strategy nobody had ever tested.

## Two shapes, chosen by which calls you use

A strategy takes one of two shapes, and the shape decides what a combined stop
could even mean.

| Shape | Entered with | Suits |
|---|---|---|
| As a unit | `book.enter`, `book.exit` | A multi-leg position whose legs only make sense together |
| Per leg | `leg.enter`, `leg.exit`, and their short spellings `buy`, `sell`, `close` | Legs that open and close on their own signals |

Every script on this page is the per-leg shape, because `buy` and `close` are that
shape written the short way. The choice matters as soon as a second leg appears,
and [exits-and-brackets.md](./exits-and-brackets.md) is where it is worked through,
along with why the combined rules belong to the first shape and are refused in the
second.

## Mistakes that look like results

| Symptom | Cause | Fix |
|---|---|---|
| Position grows every bar the condition is true | No position guard | Add `and pos.isFlat`, or raise `pyramiding` on purpose |
| The backtest is much better than the live account | `fillOn = "close"`, no slippage, no commission | Use the defaults, then add the real cost stack |
| Orders appear on history and not live | The condition is true intrabar and false at the close | Nothing to fix, that is the deferral working |
| An arrow on the chart with no trade in the account | The order was refused | Read the OS7xxx code the run reports |
| Equity curve moves in a backtest but the account does not | The strategy has no destination | OS7015, connect one or run it as a study |

**Not raised yet.** OS7015 is in the catalogue and nothing raises it: a strategy
with nowhere to send orders places intents that reach nobody.

## See also

- [orders.md](./orders.md) for legs, entering, exiting, reversing and cancelling
- [reading-the-books.md](./reading-the-books.md) for the strategy's own orders, fills and positions
- [position-and-sizing.md](./position-and-sizing.md) for what the strategy can read about itself, and how big to trade
- [exits-and-brackets.md](./exits-and-brackets.md) for stops, targets, trails, the combined rules and the session rules
- [costs-and-fills.md](./costs-and-fills.md) for where a fill is assumed and what it really costs
- [../running/sandbox-and-live.md](../running/sandbox-and-live.md) for what switching to live changes, and what it does not
- [../../spec/language.md](../../spec/language.md) for the declaration and the per-bar execution model
- [../../spec/stdlib.md](../../spec/stdlib.md) for every callable function and its warmup
- [../../examples/10-strategy-ema-cross.oscript](../../examples/10-strategy-ema-cross.oscript) for a complete worked strategy
