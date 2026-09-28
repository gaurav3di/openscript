<div align="center">

# OpenScript

**An open trading language. Write an indicator or a strategy once, then plot it,
backtest it and trade it.**

[![npm](https://img.shields.io/npm/v/openalgo-script.svg?label=npm)](https://www.npmjs.com/package/openalgo-script)
[![PyPI](https://img.shields.io/pypi/v/openscript.svg?label=PyPI)](https://pypi.org/project/openscript/)
[![CI](https://github.com/marketcalls/openscript/actions/workflows/ci.yml/badge.svg)](https://github.com/marketcalls/openscript/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

</div>

---

OpenScript is a small language for writing what you want to see on a chart, and
what you want to trade when you see it.

- A script is **one plain text file**. You own it, you can keep it in version
  control, and you can send it to a friend.
- A script **runs once per bar**, oldest bar first. There is no main function to
  write: the file itself is the loop.
- The same file gives **the same numbers** on the chart, in the backtest and in
  live trading, because all three run the same compiled program.
- It compiles in the browser in milliseconds with no `eval`, and a server can run
  the same compiled program in Python.

## Contents

1. [Install](#install)
2. [Your first indicator](#your-first-indicator)
3. [Two averages and a signal](#two-averages-and-a-signal)
4. [An indicator in its own pane](#an-indicator-in-its-own-pane)
5. [A built-in trend indicator](#a-built-in-trend-indicator)
6. [Your first strategy](#your-first-strategy)
7. [A strategy with a stop loss](#a-strategy-with-a-stop-loss)
8. [Run a script from your own code](#run-a-script-from-your-own-code)
9. [Words you will see](#words-you-will-see)
10. [Where to go next](#where-to-go-next)

## Install

If your trading platform already has OpenScript, there is nothing to install:
open its script editor, paste a script from this page and press Apply.

To use it from your own code:

```sh
npm install openalgo-script     # the compiler and the engine, for JavaScript
pip install openscript          # the engine, for Python 3.12 or newer
```

Neither package has a runtime dependency.

## Your first indicator

A 20 bar moving average drawn over price:

```
version 1

study("My moving average", overlay = true)

length  = input(20, "Length")
average = sma(close, length)

plot(average, "Average", orange, width = 2)
```

Line by line:

- `version 1` says which version of the language the file is written in. Every
  script starts with it.
- `study(...)` names the indicator. `overlay = true` draws it on top of the
  price. Leave it out and the indicator gets a pane of its own.
- `input(20, "Length")` makes a setting a trader can change without editing the
  file. 20 is the default.
- `sma(close, length)` is the simple average of the last `length` closes.
  `close`, `open`, `high`, `low` and `volume` are the current bar's prices.
- `plot(...)` draws one line: the value, its name in the legend, its colour and
  its thickness.

The line starts on the 20th bar. That is correct: a 20 bar average does not exist
until 20 bars do.

## Two averages and a signal

A fast and a slow average, the space between them shaded, and a marker where
they cross:

```
version 1

study("EMA cross", overlay = true)

fastLength = input(9,  "Fast length")
slowLength = input(21, "Slow length")

fast = ema(close, fastLength)
slow = ema(close, slowLength)

fastPlot = plot(fast, "Fast", aqua, width = 2)
slowPlot = plot(slow, "Slow", orange, width = 2)
fill(fastPlot, slowPlot, fade(aqua, 90))

if crossUp(fast, slow)
    signal("BUY", lime, at = "below")

if crossDown(fast, slow)
    signal("SELL", red)
```

- `ema` is an exponential moving average, which follows price faster than `sma`.
- `fill` shades between two plots. `fade(aqua, 90)` is aqua at 90 percent
  transparency.
- `crossUp(fast, slow)` is true on the one bar where `fast` moves above `slow`.
- `signal` puts a labelled marker on that bar.
- Indentation marks the body of an `if`, the way it does in Python.

## An indicator in its own pane

RSI below the chart, with lines at 70 and 30, and an alert when it climbs back
above 30:

```
version 1

study("RSI", precision = 2, range = [0, 100])

length = input(14, "Length")
value  = rsi(close, length)

level(70, "Overbought", red)
level(30, "Oversold", lime)

plot(value, "RSI", purple, width = 2)

if crossUp(value, 30)
    alert("RSI is back above 30", id = "rsiRecovered")
```

- No `overlay = true`, so the study gets its own pane. `range = [0, 100]` fixes
  that pane's scale.
- `level` draws a fixed horizontal line.
- `alert` raises an alert on the bar where the condition is true. The `id` names
  it, so your settings for it survive an edit to the file. Your platform decides
  how it reaches you.

## A built-in trend indicator

Supertrend, green in an uptrend and red in a downtrend:

```
version 1

study("Supertrend", overlay = true)

factor    = input(3.0, "Factor")
atrLength = input(10,  "ATR length")

st        = supertrend(factor, atrLength)
trendLine = st[0]
direction = st[1]

plot(direction < 0 ? trendLine : none, "Uptrend",   lime, width = 2)
plot(direction > 0 ? trendLine : none, "Downtrend", red,  width = 2)
```

- Some indicators give back more than one number. `supertrend` gives the line
  and the direction, read as `st[0]` and `st[1]`. The direction is `-1` in an
  uptrend and `1` in a downtrend.
- `condition ? a : b` picks `a` when the condition is true and `b` otherwise.
- `none` means no value. A plot given `none` draws nothing on that bar, which is
  how one line becomes two colours.

`macd`, `bollinger`, `vwap`, `atr`, `stoch` and many more are built in. The
[function reference](./docs/reference/functions/ta.md) lists them all.

## Your first strategy

A strategy is a study that also places orders. This one buys when the fast
average crosses above the slow one, and sells when it crosses back:

```
version 1

strategy("EMA cross strategy", overlay = true, qty = 1)

fastLength = input(9,  "Fast length")
slowLength = input(21, "Slow length")

fast = ema(close, fastLength)
slow = ema(close, slowLength)

if crossUp(fast, slow)
    buy()

if crossDown(fast, slow)
    close()

plot(fast, "Fast", aqua)
plot(slow, "Slow", orange)
```

- `strategy(...)` in place of `study(...)` is what allows orders. `qty = 1` is
  the size of each order.
- `buy()` opens a long position. `close()` closes it.
- An order placed on a bar fills at the **next bar's open**, because a bar's
  close is not known until the bar has finished.

Run it as a backtest and you get every trade, the equity curve and a report:
net profit, win rate, drawdown and more.

## A strategy with a stop loss

The same entry, with a stop loss and a target measured from the entry price. Both
are checked on each bar's close, and the exit fills at the next bar's open:

```
version 1

strategy("EMA cross with stop and target", overlay = true, qty = 1)

fastLength    = input(9,   "Fast length")
slowLength    = input(21,  "Slow length")
stopPercent   = input(1.0, "Stop loss, percent")
targetPercent = input(2.0, "Target, percent")

fast        = ema(close, fastLength)
slow        = ema(close, slowLength)
crossedUp   = crossUp(fast, slow)
crossedDown = crossDown(fast, slow)

inTrade     = pos.size > 0
stopPrice   = pos.avgPrice * (1 - stopPercent / 100)
targetPrice = pos.avgPrice * (1 + targetPercent / 100)

if crossedUp and not inTrade
    buy()

if inTrade and (close < stopPrice or close > targetPrice or crossedDown)
    close()

plot(fast, "Fast", aqua)
plot(slow, "Slow", orange)
plot(inTrade ? stopPrice : none, "Stop", red, style = "step")
plot(inTrade ? targetPrice : none, "Target", lime, style = "step")
```

- `pos.size` is the size of the open position, 0 when there is none, and
  `pos.avgPrice` is its entry price.
- `not inTrade` stops the strategy buying again while it already holds a
  position.
- The crosses are worked out once, at the top, before any `if`. A cross checked
  only inside a condition is only tracked on the bars where that condition ran,
  and the compiler warns you when you do it.
- The last two plots draw the stop and the target only while a trade is open.

A strategy can also declare its starting capital, commission and slippage, trade
both directions and size each trade from the risk. The
[first strategy guide](./docs/first-strategy.md) walks through all of it.

## Run a script from your own code

Compile a script, then run it over your bars:

```js
import {
  sourceFile, DiagnosticBag, parse, check, emit, renderDiagnostics, load,
} from 'openalgo-script';

function compile(name, text) {
  const file = sourceFile(name, text);
  const errors = new DiagnosticBag();
  const { program } = emit(file, check(file, parse(file, errors), errors), errors);
  if (program === undefined) throw new Error(renderDiagnostics(file, errors.ordered()));
  return program;
}

// One object per bar, oldest first. time is in milliseconds.
const bars = [
  { time: 1735689600000, open: 100, high: 102, low: 99, close: 101, volume: 1200, oi: null },
  // ...
];

const loaded = load(compile('my-average.oscript', scriptText));
if (!loaded.ok) throw new Error(loaded.diagnostic.message);

const run = loaded.engine.run(bars);
console.log(run.bars.at(-1).columns);   // the plotted values on the last bar
```

Backtest a strategy over the same bars:

```js
import { backtest, settingsFor } from 'openalgo-script';

const result = backtest(compile('ema-cross.oscript', strategyText), bars, settingsFor({
  symbol: 'DEMO', exchange: null, currency: 'INR',
  tickSize: 0.05, lotSize: 1, pointValue: 1, digits: 2,
}));

if (result.ok) {
  const { summary, trades } = result.record.report;
  console.log(summary.netProfit, summary.winRate, trades.length);
}
```

To run the same compiled program on a server in Python, see
[the Python engine](./docs/integrating/the-python-engine.md). To put OpenScript
inside your own platform, with its chart and its editor, start at
[integrating OpenScript](./docs/integrating/README.md).

## Words you will see

| Word | Means |
|---|---|
| Script | One `.oscript` file |
| Study | A script that only draws: lines, bands, markers, alerts |
| Strategy | A study that also places orders |
| Bar | One candle: open, high, low, close, volume and a time |
| Series | A value with one number per bar, such as `close` or an average |
| Input | A setting a trader can change without editing the file |
| `none` | No value on this bar. It is not zero |
| Backtest | Running a strategy over past bars to see how it would have traded |

## Where to go next

- [Getting started](./docs/getting-started.md): what happens between pressing
  Apply and a line appearing.
- [Your first study](./docs/first-study.md) and
  [your first strategy](./docs/first-strategy.md): complete scripts built one
  step at a time.
- [Examples](./examples/README.md): twelve complete scripts, from an EMA cross to
  an opening range strategy.
- [The documentation](./docs/README.md): every page, grouped by what it answers.
- [How OpenScript is built, and what it guarantees](./docs/integrating/architecture.md):
  the compiler, the engines, the conformance suite and what is checked on every
  build.
- [CHANGELOG.md](./CHANGELOG.md): what changed in each release.

## Contributing

Questions, bug reports and pull requests are welcome. Read
[CONTRIBUTING.md](./CONTRIBUTING.md) first, and the
[code of conduct](./CODE_OF_CONDUCT.md). Report a security issue privately, as
[SECURITY.md](./SECURITY.md) describes.

## Licence

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
