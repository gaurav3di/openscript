# Frequently asked questions

By the end of this page you will have a short answer to every question that
comes up in your first week with OpenScript, and a link to the page that answers
each one properly.

The answers here are deliberately brief. Where an answer needs a reason, the
reason is on the page the link points to.

## Getting started

**What is OpenScript?**
An open trading language for writing a study or a strategy once, plotting it,
backtesting it and trading it, with the same numbers in all three places. See
[getting-started.md](./getting-started.md) and [../README.md](../README.md).

**Do I need to install anything?**
The compiler runs in a browser with no build step and no `eval`, and the same
compiled program runs on a server. See [getting-started.md](./getting-started.md)
for what to do first, and [../ROADMAP.md](../ROADMAP.md) for what lands when.

**What does a script look like?**

```
version 1

study("EMA cross", overlay = true, precision = 2)

fastLen = input(9,  "Fast length", min = 1, max = 500)
slowLen = input(21, "Slow length", min = 1, max = 500)

fast = ema(close, fastLen)
slow = ema(close, slowLen)

plot(fast, "Fast", aqua,   width = 2)
plot(slow, "Slow", orange, width = 2)

if crossUp(fast, slow)
    signal("BUY")
```

Twelve worked scripts, each annotated with why it is written the way it is, are
in [../examples/](../examples/).

**Where do I start reading?**
[getting-started.md](./getting-started.md), then
[first-study.md](./first-study.md) and [first-strategy.md](./first-strategy.md).
When you want the rules rather than the tour,
[../spec/language.md](../spec/language.md) section 2 is a complete example with
everything in miniature and section 17 lists the places the language will not do
what your fingers expect.

**Do I have to write `version 1` at the top?**
No, but do it. Without it the file is compiled with the newest language version
the compiler implements, which is the one thing that can change under you, and
you get warning OS8003 suggesting the line. See
[../spec/language.md](../spec/language.md#4-the-version-declaration).

**Will my script keep working after an update?**
Yes. A script that compiles under language version N compiles under every later
release and produces the same numbers. Every past front end is kept in the
compiler and selected by the declared version.

## The language

**What types are there?**
`number`, `string`, `bool`, `color`, `none`, `series T` and `array<T>`. There is
no integer type: a length, a bar count and a price are all `number`, which is
binary64 throughout. See
[language/types-and-values.md](./language/types-and-values.md).

**Why does `"count: " + 5` not work?**
There is no implicit conversion between types, anywhere, on purpose. Write
`"count: " + text(5)`. The reason is that a trading script that quietly treats a
zero as a false has a bug nobody finds until it costs money. See
[language/types-and-values.md](./language/types-and-values.md).

**Why is `if 1` an error?**
There is no truthiness. A condition must be a `bool` or absent, and nothing else
is accepted, so there is no coercion rule to remember or to get wrong. See
[language/types-and-values.md](./language/types-and-values.md).

**How do I write a block?**
Indentation, with spaces. No braces, no `end`, no semicolons. Every line of one
block carries exactly the same leading whitespace, and four spaces is the
convention. See [writing/style-guide.md](./writing/style-guide.md).

**Why can I not write `a < b < c`?**
Because the two plausible readings of it disagree, and a form with two plausible
meanings has no place in a language that places orders. Write
`a < b and b < c`. See [language/operators.md](./language/operators.md).

**Where are `&&`, `||`, `!` and `^`?**
They do not exist. The words are `and`, `or` and `not`, and the power function is
`pow(x, y)`. Typing one of the missing operators gives you OS1001 naming the
replacement. See [reference/operators.md](./reference/operators.md).

**Can a function call itself?**
No. Function state is allocated per call site, and recursion would need a dynamic
stack of state slots paid for on every bar of every script. Write a loop. See
[language/functions.md](./language/functions.md).

**Why can I not declare a variable with a name that already exists outside?**
Because an assignment to an existing outer name updates it, so a second
declaration could only ever be a mistake, and two variables with one name is the
shortest path to a value that is right in one place and stale in another. That is
OS2002. See
[language/variables-and-scope.md](./language/variables-and-scope.md).

## Values, absence and warmup

**What is `none`?**
The absent value: there is no value here. It is written bare, it is a member of
every type, and every rule about it is specified rather than left to the engine.
See [language/absent-values.md](./language/absent-values.md).

**Is `none` the same as zero?**
No, and this is the single most important sentence on this page. `none + 1` is
`none`, `none * 0` is `none`, and absence reaching a plot draws a gap rather than
a zero.

**Why is `none > 5` not false?**
Because returning false would make `a > b` and `a <= b` both false, so a script
that branches on one and assumes the other is its complement takes the wrong path
during warmup, off the left edge of the screen where nobody looks. Ordered
comparison propagates absence; equality does not.

**How do I test for absence then?**
`isNone(x)`, or `x == none`. Equality is total: it always returns true or false,
never absent, which is what makes the question askable at all. See
[language/absent-values.md](./language/absent-values.md).

**Why does my line start part way along the chart?**
Warmup. A function that needs `k` bars is absent until `k` bars exist, and every
warmup length is stated exactly per function. See
[language/warmup.md](./language/warmup.md).

**How do I get a number during warmup?**
`orElse(x, fallback)`. Use it deliberately: a fabricated value on the first bars
is data you invented. See [language/warmup.md](./language/warmup.md).

**What is `close[1]` on the first bar?**
Absent. Nothing is clamped to the start of history, because clamping invents a
value that looks like data. See
[language/bars-and-history.md](./language/bars-and-history.md).

**When do I need `var`?**
When a value has to carry forward from one bar to the next. A plain assignment is
recomputed from scratch every bar, so a name that reads its own past is absent
for ever after bar 0. See
[language/persistence.md](./language/persistence.md).

```
version 1

study("Bars in this session")

var barsToday = 0

if session.isFirstBar
    barsToday = 0

barsToday = barsToday + 1

plot(barsToday, "Bars so far", aqua, style = "step")
```

**What is the difference between `var` and `[1]`?**
`[1]` is history, a read of the past. `var` is persistence, a value that carries
forward. They are unrelated and often confused.

**What does `live var` do, and should I use it?**
It is a `var` that does not roll back when the newest bar is re-executed, so it
survives tick by tick. Use it only when counting intrabar updates is the actual
intent, because a script that uses one reports different numbers live than in a
backtest, and the compiler warns with OS8011. See
[language/realtime-and-confirmation.md](./language/realtime-and-confirmation.md).

## Plotting and drawing

**Why can I not put `plot` inside an `if`?**
The set of plotted columns has to be fixed before bar 0 so the chart can build a
legend, an axis and a settings dialog. Hide a plot on a bar by plotting `none`,
not by wrapping it in a branch. That is OS3006. See
[visuals/plots.md](./visuals/plots.md).

**How do I draw an arrow on a bar?**
`signal(text, shape = "arrowUp", at = "below")`. One call is the whole of shape
plotting. See [visuals/labels-and-shapes.md](./visuals/labels-and-shapes.md).

**How do I draw a line between two points and move it later?**
The `draw` namespace: `draw.line`, `draw.label`, `draw.box`, `draw.polyline`, and
the setters that move them. Objects are anchored to a time and a price, so they
stay where you put them when more history loads. See
[visuals/lines-and-boxes.md](./visuals/lines-and-boxes.md).

**Is there a limit on how many objects I can draw?**
No cap in the language. The only budget is memory, and a host that cannot hold
them has to say so rather than dropping the oldest.

**How do I colour the candles themselves?**
`barColor(color)`, per bar, anywhere in the script. `barColor(none)` leaves the
bar alone, which is how a conditional paint switches itself off. See
[visuals/colors.md](./visuals/colors.md).

**How do I put a value on a different scale or shift it forward?**
`plot(..., scale = ...)` and `plot(..., offset = ...)`. Offset shifts only where
the column is drawn, never what it contains. See
[visuals/plots.md](./visuals/plots.md).

## Higher timeframes

**How do I read the daily close on an intraday chart?**
`req.timeframe("1D", close)`. The expression is compiled as a separate program
over the requested bars. See
[data/higher-timeframes.md](./data/higher-timeframes.md).

**Will that repaint?**
Not in the default mode. `mode = "confirmed"` reads only higher timeframe bars
that have closed, and it is the only mode that never repaints. `"developing"` and
`"lookahead"` must be written out in the source, and each raises a warning naming
the line. See [data/repainting.md](./data/repainting.md).

**Why is my read empty?**
Either the host has not answered yet, or one of the OS6xxx data codes applies.
See [data/timeframes.md](./data/timeframes.md) and
[troubleshooting.md](./troubleshooting.md) entry 20.

**Can I read another instrument?**
`req.symbol(symbol, timeframe, expr)`. It is absent until the host supplies the
bars, and `req.isReady` and `req.error` tell you where the answer is. See
[data/other-instruments.md](./data/other-instruments.md).

## Alerts

**How do I raise an alert?**
Put `alert(message, id = "...")` inside the `if` that describes the condition.
There is no separate condition-declaring function: the condition is the `if` you
would have written anyway. See [alerts.md](./alerts.md).

**Why does my alert not fire on the bar I can see it should?**
Because the bar is still moving. Alerts, signals and orders are deferred until
the bar is confirmed, and if the condition is no longer true by then they never
fire at all.

**Why did adding the study not fire hundreds of alerts for past bars?**
By design. An alert is a statement about now, and the four hundred historical
alerts would bury the one that mattered.

**Why does my alert need an `id`?**
Because a user subscribes to the id, and a subscription has to survive an edit.
Without one the compiler derives a name from the call's position, which moves the
moment a line is inserted above it.

## Strategies

**How do I turn a study into a strategy?**
Change `study(` to `strategy(` and add orders. `strategy()` takes every
`study()` option, so the plotted numbers and the traded numbers are the same
numbers, computed once. See [strategies/overview.md](./strategies/overview.md).

```
version 1

strategy("EMA cross", overlay = true, capital = 500000, qty = 1)

fast = ema(close, 9)
slow = ema(close, 21)

plot(fast, "Fast", aqua,   width = 2)
plot(slow, "Slow", orange, width = 2)

if crossUp(fast, slow) and pos.isFlat
    buy(qty = 1)

if crossDown(fast, slow) and pos.isLong
    close()
```

**Why did my order fill at the next bar's open?**
Because `fillOn` defaults to `"nextOpen"`. A decision made from a bar's close
cannot be filled at that same close in the real market, and a backtest whose
default is optimistic is a backtest that lies. See
[running/backtesting.md](./running/backtesting.md).

**Can I hold a long and a short at the same time?**
Yes on two legs, no on one. A strategy trades the legs it declared, a leg holds
one position and no order takes a leg through zero, so two opposite positions are
two legs (`stdlib.md` section 17.1). See
[strategies/orders.md](./strategies/orders.md) for declaring them and
[strategies/position-and-sizing.md](./strategies/position-and-sizing.md) for
sizing them.

**How do I size a position?**
`order.qtyForRisk(risk, entry, stop)`, `order.qtyForCash(cash)` or
`order.qtyForEquityPercent(percent)`, then `order.roundToLot(qty)`. The sizing
helpers round down, because a size rounded up is a position larger than the
script asked for. See
[strategies/position-and-sizing.md](./strategies/position-and-sizing.md).

**Why was my order refused?**
The OS7xxx range says which. See [strategies/orders.md](./strategies/orders.md)
and [troubleshooting.md](./troubleshooting.md) entry 24.

**Does it trade live by default?**
No. Paper is the default and live is a deliberate act. See
[running/paper-and-live.md](./running/paper-and-live.md).

## Errors, warnings and limits

**What does a code like OS2002 mean?**
The first digit is the kind: OS1xxx syntax, OS2xxx names and types, OS3xxx
arguments, OS4xxx runtime, OS5xxx limits, OS6xxx data, OS7xxx orders, OS8xxx
warnings. See [errors/overview.md](./errors/overview.md).

**Do I have to fix the warnings?**
Nothing stops if you do not. Every OS8xxx warning describes a shape whose
behaviour is defined and specified and almost never what the author wanted, so in
practice: yes.

**Is there a limit on loops?**
2,000,000 iterations per bar by default, summed over every loop the bar executes,
raised in one line with `limits(loops = ...)`. There is no platform ceiling you
cannot see. See [writing/limits.md](./writing/limits.md).

**My script is slow. What is the usual cause?**
A loop that walks the whole history on every bar. Keep a running value in a `var`
instead, or use the series helper that already does it. See
[writing/profiling.md](./writing/profiling.md).

**Where is the full list of errors?**
[../spec/errors.md](../spec/errors.md), generated from one machine-readable
catalogue that the compiler, the editor and the documentation all read.

## The project

**Which document wins when two disagree?**

| Question | Authority |
|---|---|
| A rule of the language: types, scope, execution, absence | `spec/language.md` |
| What a function does, returns and warms up in | `spec/stdlib.md` |
| An error code, its message, its cause and its fix | `spec/errors.md` and `spec/errors.json`, always |
| What an engine must reproduce | `spec/conformance.md` |

Where the specification and the error catalogue disagree about a code, the
catalogue wins and the specification is wrong.

**Why does nothing here name another product?**
OpenScript explains itself on its own terms, and a build check fails the
repository on any product, platform or company name. Prior art is described
generically, as "an existing chart scripting language". See
[../CONTRIBUTING.md](../CONTRIBUTING.md).

**Can I write my own engine?**
That is the point of the compiled program format and the conformance suite. See
[../spec/compiled-program.md](../spec/compiled-program.md).

**A word on this page means nothing to me.**
[glossary.md](./glossary.md) defines every term this documentation set uses.

## See also

- [getting-started.md](./getting-started.md) for the first hour
- [troubleshooting.md](./troubleshooting.md) for symptoms rather than questions
- [alerts.md](./alerts.md) for conditions, messages and delivery
- [errors/overview.md](./errors/overview.md) for reading a diagnostic
- [writing/debugging.md](./writing/debugging.md) for finding the bar that goes wrong
- [glossary.md](./glossary.md) for the vocabulary
- [../examples/](../examples/) for twelve working scripts
