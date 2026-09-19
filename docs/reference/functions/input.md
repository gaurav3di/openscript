# Input functions

By the end of this page you will be able to make every tunable part of a study
adjustable from its settings dialog, choose the right control for each value,
and know which arguments each kind of input accepts.

## One function, eleven kinds

There is one function, `input()`, and the kind of control is decided by the type
of the default value. Two kinds are both spelled with a string default, so a
`kind` argument separates them.

```
version 1
study("Every kind")

len   = input(14,     "Length", min = 1, max = 500)
src   = input(close,  "Source")
on    = input(true,   "Show the band")
tint  = input(aqua,   "Colour")
mode  = input("fast", "Mode", options = ["fast", "slow"])
tf    = input("60",   "Higher timeframe", kind = "interval")
```

The default comes first, before the title, for two reasons: the default fixes
the input's type, and a reader scanning a column of inputs wants the value. The
title is the second positional argument and defaults to the variable's own name,
so a well named variable often needs no title at all.

**Two rules the compiler enforces.** `input()` appears only at the top level of
a file, never inside a block or a function (OS3007), because the settings dialog
is built once, before the first bar runs. And an `input()` whose default is not
a compile-time constant is OS3003, for the same reason: a dialog cannot be built
from a value that depends on a bar.

```
len = input(14, "Length")               // correct
if useLongLength
    len = input(50, "Length")           // OS3007
len = input(round(atr(14)), "Length")   // OS3003
```

An input has no warmup. Its value is fixed before bar 0 and is the same on every
bar, so it can be used anywhere a plain value of its type is accepted, including
as a study option.

---

## 1. The kinds

### `input(n: number, title, min = none, max = none, step = none, ...)`

A length, a multiplier or a threshold.
Parameters: `n` `number` required, the default; `title` `string` default the
variable's name; `min` `number` default `none`; `max` `number` default `none`;
`step` `number` default `none`; plus the shared arguments in section 2.
Returns `number`. Renders as a number field with a stepper.

```
len = input(20, "Lookback", min = 2, max = 500, step = 1)
```

### `input(b: bool, title, ...)`

A switch for an optional part of the study.
Parameters: `b` `bool` required, the default; `title` `string` default the
variable's name; plus the shared arguments.
Returns `bool`. Renders as a checkbox.

```
showBands = input(true, "Show the bands")
```

### `input(s: string, title, ...)`

Free text: a label, or a note on a drawing.
Parameters: `s` `string` required, the default; `title` `string` default the
variable's name; plus the shared arguments.
Returns `string`. Renders as a text field.

```
note = input("", "Note on the label")
```

### `input(s: string, title, options = [...], ...)`

A choice from a fixed list.
Parameters: `s` `string` required, the default, which should be one of the
options; `title` `string` default the variable's name; `options`
`array<string>` required for this kind; plus the shared arguments.
Returns `string`. Renders as a menu.

```
maType = input("ema", "Average", options = ["sma", "ema", "wma", "rma", "hma"])
```

This is the input that pairs with `ma(src, len, type)`: the menu's options are
exactly the type names that call accepts, so a user switches the whole study's
average without the script branching at all.

### `input(c: color, title, ...)`

A colour the user can restyle without editing the script.
Parameters: `c` `color` required, the default; `title` `string` default the
variable's name; plus the shared arguments.
Returns `color`. Renders as a swatch with a picker.

```
lineColor = input(orange, "Line colour")
```

### `input(src: series, title, ...)`

Which price the study reads.
Parameters: `src` `series number` required, the default, one of `open`, `high`,
`low`, `close`, `hl2`, `hlc3`, `ohlc4` or `volume`; `title` `string` default the
variable's name; plus the shared arguments.
Returns `series number`. Renders as a source menu.

```
src = input(hlc3, "Source")
```

### `input(s: string, title, kind = "interval", ...)`

A timeframe code.
Parameters: `s` `string` required, the default timeframe; `title` `string`
default the variable's name; `kind` `string`, here `"interval"`; plus the shared
arguments.
Returns `string`. Renders as a menu over the intervals the host can serve.

```
tf = input("1D", "Higher timeframe", kind = "interval")
```

The value it returns is a timeframe string in the form `req.timeframe` expects,
including the bare number form: `"60"` and `"1h"` are the same timeframe,
because a bare number is read as minutes and that is the form an interval input
supplies.

### `input(s: string, title, kind = "time", ...)`

An instant the user picks by date, for an anchor.
Parameters: `s` `string` required, a wall clock default such as
`"2025-01-01 09:15"`; `title` `string` default the variable's name; `kind`
`string`, here `"time"`; plus the shared arguments.
Returns `number`, a timestamp in UTC milliseconds. Renders as a date and time
picker.

```
anchor = input("2025-01-01 09:15", "Anchor", kind = "time")
```

This is the one kind whose stored value and returned value are different types,
and the reason is worth knowing. The stored value is a wall clock string in the
chart's zone, which is what lets a saved layout restore to the same clock when
the chart is later opened in another timezone. The returned value is a
timestamp, which is what a script actually wants so it can compare against
`time`. The conversion happens once, before bar 0.

### `input(s: string, title, kind = "symbol", ...)` (planned)

Another instrument.
Parameters: `s` `string` required, the default symbol; `title` `string` default
the variable's name; `kind` `string`, here `"symbol"`; plus the shared
arguments.
Returns `string`. Renders as a picker.

```
other = input("", "Compare with", kind = "symbol")
```

### `input(n: number, title, kind = "price", ...)` (planned)

A price the user sets by clicking the chart.
Parameters: `n` `number` required, the default price; `title` `string` default
the variable's name; `kind` `string`, here `"price"`; `min`, `max` and `step` as
for a number input; plus the shared arguments.
Returns `number`. Renders as a number field the chart can fill in.

```
priceLevel = input(0.0, "Level", kind = "price")
```

### `input(s: string, title, kind = "session", ...)` (planned)

A session window.
Parameters: `s` `string` required, a window spec such as `"0915-1530"`; `title`
`string` default the variable's name; `kind` `string`, here `"session"`; plus
the shared arguments.
Returns `string`. Renders as two clock fields.

```
window = input("0915-1530", "Trading window", kind = "session")
```

Until it ships, a plain text input holding the same spec string works with
`session.isIn`, which is documented in [time.md](./time.md). The planned kind
adds the two clock fields, not the behaviour.

---

## 2. Arguments every kind accepts

| Argument | Type | Default | Means |
|---|---|---|---|
| first positional | the value's type | required | The default value, which fixes the input's type |
| `title` | `string` | the variable's name | The label in the settings dialog. Second positional |
| `group` | `string` | `""` | A heading the dialog groups rows under |
| `tooltip` | `string` | `""` | Help text beside the label, for what a label is too short to say |
| `inline` (planned) | `string` | `""` | Rows sharing a value sit on one line |
| `confirm` (planned) | `bool` | `false` | Ask for this value when the study is added |

`group` is the cheapest readability win a settings dialog has. A study with
twelve inputs and no groups is a wall; the same twelve under three headings is a
form.

```
len   = input(20, "Length", group = "Calculation", min = 2)
mult  = input(2.0, "Deviation multiple", group = "Calculation", min = 0.1)
up    = input(lime, "Rising", group = "Colours")
down  = input(red, "Falling", group = "Colours")
```

`tooltip` carries the sentence the label cannot. Use it for units and for the
consequence of a setting, not to restate the label:

```
atrLen = input(14, "ATR length", group = "Risk",
               tooltip = "Bars of average true range the stop is measured in. "
                       + "A longer length moves the stop less often.")
```

---

## 3. Arguments only some kinds accept

| Argument | Kinds | Means |
|---|---|---|
| `min`, `max` | number, price | The range the dialog enforces; a value outside it is OS3004 |
| `step` | number, price | The increment of the dialog's stepper |
| `options` | string | The list a menu offers; supplying it makes the input a `select` |
| `kind` | string, number | Names the control where the type alone cannot: `"interval"`, `"time"`, `"symbol"`, `"price"`, `"session"` |

Set `min` on every length. A length of 0 or below is an argument error at the
call that receives it, and catching it in the dialog turns a study that stops
with an error message into a study whose stepper will not go below 2. That is
the difference between a bug report and a user who never noticed there was an
edge.

---

## 4. Style rows a script does not write

The host generates a colour, opacity, thickness, line style and plot style row
for every `plot`, without the script declaring any of them. So a script does not
need a `color` input just to let a user restyle a line, and adding one for that
reason produces two rows that do the same job.

Declare a `color` input when the script itself needs the colour: when one chosen
colour drives several plots and a fill, or when the colour is used in a
computation such as a `mix`. Passing that input to a plot takes over the
generated row rather than adding a second one.

```
version 1
study("One colour, three uses", overlay = true)

tint = input(aqua, "Band colour")

b = bollinger(close, 20, 2)

upper = plot(b[1], "Upper", tint)
lower = plot(b[2], "Lower", tint)
fill(upper, lower, fade(tint, 90))
```

---

## 5. Three worked examples

### A study whose whole shape is configurable

```
version 1
study("Configurable mean", overlay = true)

src    = input(close, "Source", group = "Calculation")
len    = input(20, "Length", group = "Calculation", min = 2, max = 500)
maType = input("ema", "Type", group = "Calculation",
               options = ["sma", "ema", "wma", "rma", "hma", "vwma"])

showSlope = input(true, "Colour by slope", group = "Display")
upColor   = input(lime, "Rising", group = "Display")
downColor = input(red, "Falling", group = "Display")

m = ma(src, len, maType)

isRising = m > m[1]

plot(m, "Mean", showSlope ? (isRising ? upColor : downColor) : upColor, width = 2)
```

Nothing in that script branches on `maType` itself. One call takes the string,
which is why the menu's options are the type names rather than labels a script
would then have to translate.

### An input used as a study option

```
version 1
study("Fixed scale", precision = 2, range = [0, 100])

len = input(14, "RSI length", min = 2, max = 200)

plot(rsi(close, len), "RSI", purple)
level(70, "Overbought", red)
level(30, "Oversold", lime)
```

A study option may be a literal, arithmetic over literals, or a call to
`input()`, and nothing else. That is why `range = [0, 100]` is written out: it
is a fact about the study, known before any data arrives.

### An anchor the user picks on the chart

```
version 1
study("Anchored measure", overlay = true)

anchorTime = input("2025-01-01 09:15", "Anchor", kind = "time")
src        = input(hlc3, "Source")

var started = false

if not started and time >= anchorTime
    started = true

plot(vwapAnchor(src, started and not orElse(started[1], false)), "Anchored VWAP", orange)

if started and not orElse(started[1], false)
    signal("ANCHOR")
```

`orElse(started[1], false)` rather than `started[1]` alone: on bar 0 the
previous value is absent, `not none` is `none`, and an absent condition takes
the false branch, so an anchor sitting on the very first bar of the dataset
would go unmarked. One call fixes it, on the line where the problem is.

## See also

- [ta.md](./ta.md) for `ma`, whose `type` argument a select input feeds
- [color.md](./color.md) for the colour an input hands to a plot or a fill
- [request.md](./request.md) for the timeframe string an interval input returns
- [time.md](./time.md) for comparing a time input against `time`
- [drawing.md](./drawing.md) for the plots and tables these values configure
- [../../../spec/stdlib.md](../../../spec/stdlib.md) for the specification these entries are derived from
