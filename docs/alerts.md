# Alerts

By the end of this page you will be able to declare a condition your script
watches, build the message a fired alert carries out of the bar that fired it,
tell an alert apart from a signal marker, and know exactly when an alert is
delivered and when it is not.

## What an alert is

An alert is a standing instruction to the host: watch this study, and on any bar
where this condition holds, send this message. The script does not poll anything,
does not wait, and does not run in a loop of its own. It states the condition
once, in the ordinary body of the per-bar program, and the host's runtime does
the watching.

The whole of it is one function.

| Argument | Type | Default | Means |
|---|---|---|---|
| `message` | `string` | required | The text the fired alert carries. First positional argument |
| `id` | `string` | `""` | The stable name of this watched condition |
| `title` | `string` | `""` | A short heading the host shows above the message |
| `frequency` | `string` | `"oncePerBar"` | How often the same condition may fire |

`alert()` returns nothing. It may appear anywhere a statement may appear: at the
top level, inside an `if`, inside a `for`, inside the body of an `fn`. It is a
per-bar event, not part of the fixed shape of the study, so it is not subject to
the top level rule that `plot`, `fill`, `level`, `input` and `table` obey.

Each call site lands in one entry of the chart contract's watched conditions,
carrying that entry's id, title, message and predicate.

## The condition is an ordinary if

There is no second function for declaring a condition. A condition is already a
first class thing in the language: it is the `if` you would have written anyway.

The compiler lifts each `alert()` call site into one watched condition. The
entry's **predicate** is the chain of guards that reaches the call, and its
**message** is the argument, evaluated for the bar the predicate accepted.

```
version 1

study("EMA cross alerts", overlay = true, precision = 2)

fastLen = input(9,  "Fast length", min = 1, max = 500)
slowLen = input(21, "Slow length", min = 1, max = 500)

fast = ema(close, fastLen)
slow = ema(close, slowLen)

plot(fast, "Fast", aqua,   width = 2)
plot(slow, "Slow", orange, width = 2)

if crossUp(fast, slow)
    alert("Fast crossed above slow at " + text(close, 2), id = "cross-up",
          title = "EMA cross up")

if crossDown(fast, slow)
    alert("Fast crossed below slow at " + text(close, 2), id = "cross-down",
          title = "EMA cross down")
```

That file declares two watched conditions, and a user subscribing to this study
sees exactly two rows to choose from:

| id | title | Predicate | Message |
|---|---|---|---|
| `cross-up` | EMA cross up | `crossUp(fast, slow)` | `"Fast crossed above slow at "` plus this bar's close |
| `cross-down` | EMA cross down | `crossDown(fast, slow)` | the same the other way |

Nesting works the way reading the file works. An `alert()` two branches deep has
both guards in its predicate, joined by `and`.

```
if session.isOpen
    if close > highest(high, 20)[1]
        alert("Twenty bar breakout", id = "breakout")
```

The predicate of that entry is "the session is open, and the close is above the
previous twenty bar high". The reason to state this rather than leave it implied:
the predicate is what the host shows the user when they pick an alert to
subscribe to, and what a reviewer reads six months later. It is built from the
source, so it cannot describe a condition the script does not actually test.

## The message, computed from the bar that fired

A message is an ordinary `string` expression, evaluated on the bar the predicate
accepted, so every value in it is that bar's value. Three rules of the language
decide what you can put in it.

**There is no implicit conversion.** `"count: " + 5` is OS2003, not `"count: 5"`.
Numbers reach a message through `text()`:

```
alert("RSI " + text(r, 1) + " on " + chart.symbol, id = "rsi-high")
```

**`text(x, decimals)` fixes the decimals**, halves away from zero, which is what
a price in a message wants. `text(x)` with no second argument renders the value
as it is.

**Absence propagates through `+`.** If any part of the expression is absent, the
whole message is absent, because `"a" + none` is `none`. This is worth a moment:
the parts of a message most worth sending are exactly the parts that are absent
during warmup, after a gap, or on an instrument with no volume. Build the message
so it cannot be absent, with `orElse()` where a fallback is genuinely right and
`text()` where you want the word rather than the value.

```
r = rsi(close, 14)

// text(none) is the string "none", so this message always exists.
alert("RSI is now " + text(r, 1), id = "rsi-note")

// A fallback where one is honest: volume relative to its own average.
rv = relativeVolume(20)
alert("Relative volume " + text(orElse(rv, 0), 2), id = "volume-note")
```

Useful ingredients, all of them per-bar facts available to any script:

| Want in the message | Write |
|---|---|
| The instrument | `chart.symbol`, `chart.exchange` |
| The chart's interval | `chart.interval` |
| The bar's price | `text(close, 2)` |
| A computed value | `text(atr(14), 2)` |
| The bar's time, in the chart's zone | `date.format(time, "yyyy-MM-dd HH:mm")` |
| Which side fired | a ternary: `up ? "long" : "short"` |
| The open position, in a strategy | `text(pos.size)`, `text(pos.avgPrice, 2)` |

A worked message that carries enough to act on without looking at the chart:

```
version 1

study("RSI extremes", precision = 2, range = [0, 100])

len = input(14, "RSI length", min = 2, max = 200)
hi  = input(70, "Overbought", min = 50, max = 100)
lo  = input(30, "Oversold",   min = 0,  max = 50)

r = rsi(close, len)

level(hi, "Overbought", red)
level(lo, "Oversold",   lime)
plot(r, "RSI", purple, width = 2)

// The state change, not the state. See "fires on every bar" below.
leftHigh = not isNone(r) and r < hi and orElse(r[1], 0) >= hi
leftLow  = not isNone(r) and r > lo and orElse(r[1], 100) <= lo

if leftHigh
    alert(chart.symbol + " " + chart.interval + ": RSI left overbought at "
          + text(r, 1) + ", price " + text(close, 2)
          + ", " + date.format(time, "yyyy-MM-dd HH:mm"),
          id = "rsi-left-high", title = "RSI left overbought")

if leftLow
    alert(chart.symbol + " " + chart.interval + ": RSI left oversold at "
          + text(r, 1) + ", price " + text(close, 2)
          + ", " + date.format(time, "yyyy-MM-dd HH:mm"),
          id = "rsi-left-low", title = "RSI left oversold")
```

`date.format` reads the timestamp in the chart's timezone, which is the calendar
the chart's own axis is labelled in, so the time in the message agrees with the
time under the bar.

## The id, and why it matters more than it looks

`id` is the stable name of a watched condition. A user subscribes to an id, and
that subscription has to survive an edit to the script.

With no `id`, the compiler derives one from the call's position in the file.
That derived name changes the moment somebody inserts a line above the call, and
a subscription keyed to the old name no longer matches anything. The compiler
says so rather than letting it happen silently. Give every `alert()` an id, keep
the ids short, lowercase and hyphenated, and treat renaming one as what it is: a
change that costs every subscriber their subscription.

| id style | Verdict |
|---|---|
| `"cross-up"` | Good. Short, stable, says what happened |
| `"rsi-left-high"` | Good. Survives changing the thresholds |
| `"rsi-below-30"` | Poor. Becomes a lie when the input is set to 25 |
| none at all | Poor. Derived from the line, so an edit above it breaks subscriptions |

`title` is not a substitute for `id`. The title is text for a human, changeable
at will; the id is a key, and changing it is a breaking change.

## Frequency, and when an alert actually fires

An alert obeys the same rule as a signal and an order: **it does not fire on a
bar that is still moving.** The call is deferred until the bar is confirmed, and
if the condition that produced it is no longer true when the bar closes, it never
fires at all.

That single rule is what makes an alert worth acting on. A price that pokes
through a level for ten seconds and comes back has not broken the level, and an
alert that told you it did would be noise with a timestamp on it.

A file opts out by declaring `onUnconfirmed = true`, which is a deliberate choice
with a name in the source. Once it is set, the script is responsible for its own
guards, and the compiler warns about every higher timeframe read in the file with
OS8002, because an unconfirmed bar reading a coarser bar is where repainting
comes from.

```
study("Fast alerts", onUnconfirmed = true)

// The script now guards itself: this fires once, on the bar's close.
if close > highest(high, 20)[1] and bar.isConfirmed
    alert("Breakout", id = "breakout")
```

`frequency` decides how often one condition may fire.

| Value | Means | Use it for |
|---|---|---|
| `"oncePerBar"` | At most one alert per bar. The default | Almost everything |
| `"once"` | The first time only, for the life of this study instance | A one-off level, an anchor, a session-open note |
| `"everyUpdate"` | On every execution of the bar. Requires `onUnconfirmed = true` | Watching a level tick by tick, knowing the cost |

`"everyUpdate"` without `onUnconfirmed = true` is refused at compile time rather
than quietly downgraded, because a script that asked for every update and got one
per bar would be wrong in a way nobody would notice until a fast move.

Two more facts about firing, both of which surprise people once:

- **Adding a study to a chart full of history fires nothing for those bars.** An
  alert is a statement about now. A study added at noon that emitted four hundred
  historical alerts would be useless, and the four hundred and first, the one that
  mattered, would be lost in them.
- **A condition that is absent takes the false branch**, so an alert inside an
  `if` guarded by a comparison does not fire during warmup. That is the correct
  behaviour, and it is also the most common reason a new alert seems dead: see
  the troubleshooting page.

## An alert against a signal marker

They look similar in the source and do entirely different jobs.

| | `signal(text)` | `alert(message, id = ...)` |
|---|---|---|
| Lands in | the contract's bar-anchored markers | the contract's watched conditions |
| Shows up | on the chart, on the bar | wherever the host delivers, off the chart |
| On history | draws on every past bar that matched | fires for none of them |
| Needs a subscriber | no | yes, the user picks the id |
| Carries | short text, a shape, a colour, a position | a message built from the bar |
| Fires on an unconfirmed bar | no, unless `onUnconfirmed = true` | no, unless `onUnconfirmed = true` |

A marker is documentation of what the script saw, drawn back over the whole
dataset so you can judge the rule. An alert is a message about the bar in front
of you. Most real studies want both, and they cost one line each:

```
version 1

study("Opening range break", overlay = true, precision = 2)

rangeMinutes = input(15, "Opening range, in minutes", min = 1, max = 240)

var openTime  = none
var rangeHigh = none
var rangeLow  = none
var broken    = false

if session.isFirstBar
    openTime  = time
    rangeHigh = high
    rangeLow  = low
    broken    = false

elapsed = isNone(openTime) ? none : time - openTime
forming = not isNone(elapsed) and elapsed < rangeMinutes * 60000

if forming and not session.isFirstBar
    rangeHigh = max(rangeHigh, high)
    rangeLow  = min(rangeLow, low)

// broken is a var, so this block runs at most once per session.
if not forming and not broken and not isNone(rangeHigh)
    if close > rangeHigh
        broken = true
        signal("BREAK UP", shape = "triangleUp", at = "below")
        alert(chart.symbol + " broke the opening range high at "
              + text(close, 2), id = "or-break-up", title = "Range break up")
    else if close < rangeLow
        broken = true
        signal("BREAK DOWN", shape = "triangleDown", at = "above")
        alert(chart.symbol + " broke the opening range low at "
              + text(close, 2), id = "or-break-down", title = "Range break down")

plot(rangeHigh, "Range high", aqua,   width = 2, style = "step")
plot(rangeLow,  "Range low",  orange, width = 2, style = "step")
```

The `broken` flag is doing the work that `frequency` cannot: `"oncePerBar"`
limits one condition to one alert per bar, and this script wants one alert per
session. State in a `var` is how a script expresses "already handled". Because
`var` rolls back before each re-execution of the moving bar, the flag behaves the
same live as it does in a backtest.

## Delivery

What the script produces is a declaration, not a delivery. The compiled study
hands the host a list of watched conditions, each with its id, title, message
template and predicate. From there:

1. The user subscribes to one id, in the host's own interface.
2. The host runs the study as bars arrive, exactly as it runs it for the chart.
3. On a bar whose predicate accepted, the message is evaluated for that bar and
   handed to the host.
4. The host delivers it wherever that subscription says, and records it.

Routing, retries, quiet hours, how many messages a minute and where they go are
the host's business, not the language's. A script that tried to name a
destination would only work on the host that had that destination, and the same
file has to compile and run everywhere.

`notify(message, channel)` is listed in the specification as planned: a way for a
script to name a channel the host has already configured. It is not in the first
release, and until it arrives the only delivery a script declares is an alert.

## What goes wrong, and what the compiler says

| Symptom | Cause | Fix |
|---|---|---|
| Nothing fires, ever | The guard is absent during warmup and false after, or the condition is never true | Plot the condition as `cond ? 1 : 0` and look at the line |
| Fires on every bar of a run | The predicate tests a state, not a change | Test the change: compare with `[1]`, or hold a `var` flag |
| Fires and then the bar reverses | `onUnconfirmed = true` without a `bar.isConfirmed` guard | Drop `onUnconfirmed`, or add the guard |
| The message is empty | Some part of it was absent, so the whole string was | Wrap the fragile part in `text()` or `orElse()` |
| `"a" + 5` refused with OS2003 | No implicit conversion between a string and a number | `"a" + text(5)` |
| Subscriptions stopped matching after an edit | The alert had no `id`, so its derived name moved | Give every alert a stable `id` |
| `"everyUpdate"` refused | It needs `onUnconfirmed = true` in the declaration | Set it, or use `"oncePerBar"` |
| Two alerts with the same title | Titles must be unique in a file (OS3017) | Rename one |

## See also

- [language/realtime-and-confirmation.md](./language/realtime-and-confirmation.md) for the confirmation rule an alert obeys
- [visuals/labels-and-shapes.md](./visuals/labels-and-shapes.md) for the marker an alert is not
- [data/repainting.md](./data/repainting.md) for what `onUnconfirmed` costs
- [troubleshooting.md](./troubleshooting.md) for the alert that will not fire and the one that fires twice
- [errors/overview.md](./errors/overview.md) for how to read the codes quoted here
- [faq.md](./faq.md) for the short answers
- [glossary.md](./glossary.md) for watched condition, predicate, marker and confirmed bar
- [../spec/stdlib.md](../spec/stdlib.md) section 16 for the specification of `alert()`
