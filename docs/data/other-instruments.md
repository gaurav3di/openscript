# Other instruments

By the end of this page you can read a value computed on an instrument that is
not the one on the chart, tell whether the answer has arrived yet, say exactly
what an absent bar means and what it does to the arithmetic around it, and
budget what the read costs.

## The call

```
req.symbol(symbol, timeframe, expr, exchange = chart.exchange, mode = "confirmed")
```

| Argument | Type | Means |
|---|---|---|
| `symbol` | `string` | The instrument to read |
| `timeframe` | `string` | The interval to read it at, written as in [timeframes.md](./timeframes.md) |
| `expr` | any | An expression computed on that instrument's bars |
| `exchange` | `string` | Where it trades, defaulting to the chart's exchange |
| `mode` | `string` | `"confirmed"`, `"developing"` or `"lookahead"`, as in [higher-timeframes.md](./higher-timeframes.md) |

```
// The same interval the chart is on, on the chart's own exchange.
peer = req.symbol("SYMBOL", chart.interval, close)

// A daily value of an instrument on another exchange.
peerDaily = req.symbol("SYMBOL", "1D", close, exchange = "EXCHANGE")

// An expression, not just a price: the average is computed on that
// instrument's bars, at that interval.
peerTrend = req.symbol("SYMBOL", "1D", ema(close, 20) > ema(close, 50))
```

Inside `expr`, the built-in series are the **requested** instrument's, at the
requested interval. `close` in the third line above is the other instrument's
daily close, and the two averages are computed from its bars. A name from the
file scope may be read inside `expr` only when it is a compile-time constant: a
literal, arithmetic over literals, or an `input()`, and an `input()` may equally
be written inside `expr` itself. Orders, drawings and alerts
do not belong inside `expr`, which is a calculation over another set of bars and
not a second script with its own effects.

## How the request is made

The request is part of what the compiled study is. It reaches the host as a
request for another instrument's bars, with an attach lifecycle that holds the
answer and a data status the host displays while the answer is outstanding.

Two consequences follow, and both are visible in the language.

**The identity of a request is fixed before bar 0.** The host fetches the series
once, keyed by symbol and timeframe, and keeps it in step with the chart. A
request whose symbol changed on bar 4000 would need a second fetch for bars that
have already been drawn, so it is refused with OS6013, naming the bar where the
identity changed. Compute the symbol and the timeframe from literals or inputs,
never from bar data.

**Not raised yet.** OS6013 is in the catalogue and nothing raises it: a read's
identity is settled once before bar 0 and nothing asks again.

```
// Refused: the symbol depends on a per-bar value.
name = close > open ? "SYMBOL_A" : "SYMBOL_B"
x = req.symbol(name, chart.interval, close)

// Correct: the user picks it once, before the first bar.
name = input("SYMBOL_A", "Instrument to compare")
x = req.symbol(name, chart.interval, close)
```

A dedicated instrument picker, `input(..., kind = "symbol")`, is listed in the
library as planned. Until it lands, a plain text input holds the symbol and the
dialog shows a text field.

**A reference to the whole read is what the status functions take.** Assign the
read to a name and pass that name:

| Call | Returns | Means |
|---|---|---|
| `req.isReady(read)` | `series bool` | The host has answered |
| `req.error(read)` | `series string` | The reason a read failed, or `""` |

## How the request is answered

A `req.symbol` read cannot complete until the host supplies the other
instrument's bars, and that is not instant. While it is outstanding:

- the read is **absent**, on every bar,
- the study reports itself as loading through the contract's data status,
- everything in the study that does not depend on the read keeps drawing,
- and when the bars land, the engine recalculates.

That last point is worth sitting with. The answer does not arrive "from bar 900
onward". It arrives for the whole range at once, and the study is recalculated
over its whole history with the read present. A chart that showed a broken line
for a second and then showed a complete one did not repaint: it had not been
answered yet, and the absence was the honest statement of that.

A refusal surfaces as an error with the reason available to the script:

| Code | Happens when | The message carries |
|---|---|---|
| OS6007 | The host does not know the symbol on that exchange | The symbol and the exchange |
| OS6008 | The instrument resolved and had no bars over the chart's range | The symbol and the interval |
| OS6009 | The host reached its data source and the source refused or did not answer | The host's own reason |
| OS6014 | The interval is well formed but not one the feed stores for that instrument | The intervals it does serve |
| OS5006 | The file makes more requests than the host allows | How many it makes and how many are allowed |

OS6007 exists rather than an empty series because an empty series looks exactly
like an instrument that did not trade, and those two situations call for
opposite responses from the person reading the chart.

### A study that says what state it is in

```
version 1

study("Peer comparison", overlay = false, precision = 2)

peerName = input("SYMBOL", "Instrument to compare")

peer = req.symbol(peerName, chart.interval, close)

ready = req.isReady(peer)
why   = req.error(peer)

// The ratio is computed unconditionally. Absence propagates through the
// division, so an unanswered read produces an absent ratio and a gap in the
// line, which is the truth rather than a flat zero.
ratio = close / peer

plot(ratio, "This instrument over the peer", aqua, width = 2)

// The status panel, written only on the newest bar. A study whose data has not
// arrived should say so somewhere other than in an empty pane.
panel = table("Status", 2, 2, position = "topRight", textColor = silver)
if bar.isLast
    cell(panel, 0, 0, "Peer")
    cell(panel, 0, 1, peerName, textColor = white)

    cell(panel, 1, 0, "State")
    cell(panel, 1, 1, why != "" ? why : (ready ? "ready" : "loading"),
         textColor = why != "" ? red : (ready ? lime : silver))
```

## Alignment by timestamp

The requested expression is computed on the requested instrument's own bars, at
the requested interval, and the result is then sampled onto the chart's bars.
The chart's bars are the time axis, always. A requested value reaches a chart
bar when it was available at that bar's instant, under the mode the read
declared.

Three facts follow.

**Alignment is by instant, not by wall clock.** `time` is UTC milliseconds, so
two instruments on exchanges in different timezones align correctly with no
conversion and no zone argument anywhere. What the chart's axis is labelled in
is a display decision and does not enter the calculation.

**Anything the other instrument did between two chart bars is not visible.** On
a fifteen minute chart, a one minute move in the other instrument exists inside
the fold and reaches the script only through whatever the expression computed
from it. If the detail matters, request a finer interval and fold it yourself,
or put the chart on the finer interval.

**A chart bar with no counterpart is absent.** The next section is about that,
because it is where most of the surprises live.

| Situation | What the read gives on that chart bar |
|---|---|
| Both instruments traded in that bar | The requested value |
| The other instrument did not trade in that bar | absent |
| The other instrument's exchange is closed, and the chart's is open | absent |
| The chart's exchange is closed, and the other's is open | Nothing: there is no chart bar for it to land on |
| The read has not been answered yet | absent, with `req.isReady` false |

## What a missing bar means

**An absent bar is absent.** It is not zero, it is not the previous value
carried forward, and it is not an error. The language makes exactly one promise
about it, and the promise is propagation: any arithmetic touching an absent
value produces an absent value, all the way to the plot, where it draws a gap.

That is the property this whole page exists to protect. Consider two option legs
read separately and added:

```
callPrice = req.symbol(callLeg, chart.interval, close)
putPrice  = req.symbol(putLeg,  chart.interval, close)

premium = callPrice + putPrice
```

If one leg has no bar at this instant, `premium` is absent. It is not the other
leg's price. A language that absorbed the missing leg into a smaller number
would show a combined premium that had halved, which reads on the chart as a
profitable decay and is in fact a data gap. The line breaking is the study
telling the truth about what it knows.

Why a bar can be missing:

| Cause | Typical shape |
|---|---|
| The instrument did not trade in that bar | An illiquid strike, a wide bar, a thin session |
| The two exchanges keep different hours | A gap at one end of every session |
| A holiday on one exchange and not the other | A whole day absent |
| The instrument had not listed yet | Absent at the left edge, then present, and OS6008 when the whole range is empty |
| The contract has expired | Present at the left edge, then absent |
| The host has no volume for the instrument | `volume` absent, which is different from zero |

### Filling a gap, deliberately

Sometimes holding the last known value is genuinely what you want: a slow
instrument read against a fast one, where a one bar gap is noise rather than
news. The language will not do it for you, because holding a stale value is a
decision with a cost. Make the decision in the open, and show the staleness:

```
version 1

study("Peer, held through gaps", precision = 2)

peerName = input("SYMBOL", "Instrument to compare")
maxStale = input(5, "Hold a stale value for at most this many bars", min = 1, max = 100)

peer = req.symbol(peerName, chart.interval, close)

present = not isNone(peer)

// valueWhen holds what the read said the last time it said anything, and
// barsSince says how long ago that was. Both are absent before the first
// present bar, which is correct: there is nothing to hold yet.
lastKnown = valueWhen(present, peer)
staleness = barsSince(present)

// The held value is used only while it is fresh enough. Past that, the study
// goes back to absence rather than quietly drawing a week old price.
usable = not isNone(staleness) and staleness <= maxStale
held = usable ? lastKnown : none

plot(peer, "Peer, as read", aqua, width = 2)
plot(held, "Peer, held", fade(aqua, 60), width = 1, style = "step")

// The disclosure. A bar drawn from a held value is shaded, so a reader can see
// at a glance which part of the line is measurement and which part is memory.
background(present ? none : (usable ? fade(orange, 90) : fade(red, 92)))
```

Three things in that script are worth copying into your own:

- the raw read is plotted as well as the held value, so the gaps stay visible,
- the hold has a limit, so a delisted instrument cannot draw a flat line forever,
- and the held bars are marked, so nobody mistakes memory for data.

## The cost of a read

| Cost | Size | What to do about it |
|---|---|---|
| One fetched series per distinct symbol and timeframe | The host's ceiling, OS5006 when exceeded | One read per pair, assigned to a name, reused |
| Waiting for the answer | A round trip, once per run | Draw what does not depend on it, and show the status |
| A recalculation when the answer lands | The whole history, once | Nothing: it is the correct behaviour |
| Reading the answered series per bar | A lookup | Nothing |

The rule that falls out of the table: **a request is expensive and arithmetic is
not.** Derive everything you can from the reads you already have.

```
// Three requests where one would do.
hi = req.symbol("SYMBOL", "1D", high)
lo = req.symbol("SYMBOL", "1D", low)
mid = req.symbol("SYMBOL", "1D", (high + low) / 2)

// One fewer, with the same numbers.
hi = req.symbol("SYMBOL", "1D", high)
lo = req.symbol("SYMBOL", "1D", low)
mid = (hi + lo) / 2
```

The per-bar time budget a host applies is a separate ceiling, reported as OS5007
when a bar takes longer than the host allows. Reads are rarely the cause; work
that recomputes over the whole history on every bar usually is. Keep a running
value in a `var` and update it per bar instead.

## Chart facts describe the chart's instrument

`chart.tickSize`, `chart.lotSize`, `chart.pointValue`, `chart.currency`,
`chart.instrumentType` and the rest of the `chart` namespace describe the
instrument **the chart is showing**. There is no per-request equivalent in
version 1, so a study that reads another instrument and needs its tick or its
lot size takes them as inputs and says so in the titles.

```
lotSize = input(1, "Lot size of the legs", min = 1)
qty = lots * lotSize
```

A fact the host has not supplied reads as `none` rather than a guess, because a
script rounding to a tick or sizing in lots cannot invent one and a guess produces
orders the exchange rejects. `orElse(chart.lotSize, 1)` says what the script
assumes in the open, and an input says it in the settings dialog.

## A worked example: two legs, one number

```
version 1

study("Combined premium", precision = 2, format = "price")

callLeg   = input("", "Call leg")
putLeg    = input("", "Put leg")
lots      = input(1,  "Lots", min = 1, max = 100)
lotSize   = input(1,  "Units in one lot", min = 1)
targetPct = input(30, "Decay to mark, in percent of the opening premium", min = 1, max = 99)

// Each leg is read at the chart's own interval, so the two legs and the chart
// share one time axis and the sum below is a sum of the same instant.
callPrice = req.symbol(callLeg, chart.interval, close)
putPrice  = req.symbol(putLeg,  chart.interval, close)

// If either leg has no bar at this instant the sum is absent, not half a
// position. That is the whole reason absence propagates through arithmetic.
premium = callPrice + putPrice
money   = premium * lots * lotSize

var opening = none

// The reference resets per session rather than per calendar day, because a
// session is what an exchange opens and a date is not.
if session.isFirstBar
    opening = none

if isNone(opening) and not isNone(premium)
    opening = premium

// Positive when the seller of both legs is ahead, which is the sign a short
// premium reader expects, so the subtraction is written that way round rather
// than being negated at every use.
decay = isNone(opening) ? none : (opening - premium) / opening * 100

plot(premium, "Combined premium", orange, width = 2)
plot(opening, "Opening premium", fade(silver, 40), style = "step")
plot(money,   "Position value", aqua, scale = "left")

if decay >= targetPct
    alert("Combined premium decayed " + text(decay, 1) + " percent", id = "decay-target")
    signal("TARGET")
```

`decay >= targetPct` is absent on any bar where either leg is missing, and an
absent condition takes the false branch, so neither the alert nor the marker
fires on a gap. That is the desired behaviour and it costs nothing to write,
which is the point of the absence rules.

## Mistakes worth naming

- **Treating an absent read as a zero.** `orElse(peer, 0)` compiles and is
  almost never right: a price of zero is a price, and it will win every `min`
  and lose every `max` it enters.
- **Deriving a symbol from bar data.** Refused with OS6013. Symbols come from
  literals and inputs.
- **Two requests for the same symbol and timeframe.** One of them is waste, and
  together they count twice against the host's ceiling.
- **Assuming the other instrument keeps the chart's hours.** It usually does
  not, and the difference shows up as absent bars at one end of every session.
- **Using `chart.lotSize` for an instrument that is not the chart's.** It is the
  chart's instrument's lot size, whatever the read says.

**Not raised yet.** OS6013 is in the catalogue and nothing raises it: a read's
identity is settled once before bar 0 and nothing asks again.

## See also

- [higher-timeframes.md](./higher-timeframes.md) for the three modes, which
  apply to these reads exactly as they do to a coarser interval
- [repainting.md](./repainting.md) for why a read defaults to `"confirmed"` and
  what happens when it does not
- [sessions-and-time.md](./sessions-and-time.md) for session hours, holidays and
  the calendar differences that produce missing bars
- [timeframes.md](./timeframes.md) for interval strings and the chart's own
  interval
- [../README.md](../README.md) for the rest of the documentation
