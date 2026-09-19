# String and formatting functions

By the end of this page you will be able to build any piece of text a script
shows, format a number for display without changing it, and line up a column in
a panel so it reads like a table rather than like output.

## Three rules that come before the entries

**There is no implicit conversion.** `"count: " + 5` is a type error (OS2003),
not the string `"count: 5"`. Conversion is explicit and short: `text(5)`. Every
silent coercion rule in every language is a source of bugs that survive review,
and the cost of writing four characters is smaller than the cost of one script
that quietly treated a number as a label.

**Concatenation propagates absence.** `"RSI " + rsiValue` where the value is
absent is `none`, and a cell written with `none` is blank rather than reading
`"RSI "` followed by nothing. To print an absent value deliberately, convert it
first: `text(none)` is the string `"none"`.

**Case conversion is invariant, not locale aware.** A script whose output
changed because the machine running it was configured for a different language
would break the determinism rule that makes two engines comparable, and the
cases where a locale aware conversion differs are not cases a trading script
needs.

None of the functions on this page has a warmup. A string operation on a present
string produces a value on bar 0.

A string literal may be written with double quotes or single quotes, and the two
forms mean the same thing. Two delimiters exist so that a string containing one
kind of quote needs no escapes. The escape sequences are `\\`, `\"`, `\'`, `\n`,
`\t`, `\r`, `\0` and `\uXXXX` with exactly four hexadecimal digits.

---

## 1. Conversion

### `text(x)`

Any value to a string.
Parameters: `x` any type.
Returns `string`. `text(none)` is `"none"`.

```
print("Symbol " + text(chart.symbol) + " bars " + text(bar.count))
```

### `text(x, decimals)`

A number to a string with a fixed number of decimals, halves away from zero.
Parameters: `x` `number` required; `decimals` `number` required.
Returns `string`.

```
cell(panel, 1, 1, text(atr(14), 2))
```

This is the function to reach for when a number is being displayed. It changes
the characters, not the value, so the calculation keeps full precision. Use
`round(x, decimals)` from [math.md](./math.md) only when the rounded number is
the thing you actually mean, such as a quantity in whole lots or a price on an
order.

| Call | Result |
|---|---|
| `text(1234.5678, 2)` | `"1234.57"` |
| `text(1234.5678, 0)` | `"1235"` |
| `text(2.5, 0)` | `"3"` |
| `text(-2.5, 0)` | `"-3"` |
| `text(true)` | `"true"` |
| `text(none)` | `"none"` |
| `"a" + none` | `none` |

### `number(s)`

A string to a number.
Parameters: `s` `string` required.
Returns `number`, or `none` when the string does not parse.

```
threshold = orElse(number(input("2.5", "Threshold")), 2.5)
```

`number` returns absence rather than raising because a string that does not
parse is data, not a defect in the script, and the script is in the best
position to decide what to do about it. Pair it with `orElse` when a default is
sensible and with `isNone` when the script should say something.

### `bool(x)`

`none` to `false`, a bool to itself. Numbers are rejected. It is documented in
full in [math.md](./math.md) and is listed here because it is the third member
of the conversion set.

---

## 2. Inspecting a string

### `str.length(s)`

Count of Unicode code points.
Parameters: `s` `string` required.
Returns `number`.

```
tooLong = str.length(label) > 24
```

### `str.contains(s, part)`

Whether one string appears inside another.
Parameters: `s` `string` required; `part` `string` required.
Returns `bool`.

```
isWeekly = str.contains(chart.symbol, "W")
```

### `str.startsWith(s, part)`

Prefix test.
Parameters: `s` `string` required; `part` `string` required.
Returns `bool`.

```
if str.startsWith(chart.interval, "1")
    print("A one unit interval")
```

### `str.endsWith(s, part)`

Suffix test.
Parameters: `s` `string` required; `part` `string` required.
Returns `bool`.

```
isCall = str.endsWith(chart.symbol, "CE")
```

### `str.indexOf(s, part)`

First position of `part`, counting from 0.
Parameters: `s` `string` required; `part` `string` required.
Returns `number`, or `-1` when it does not occur.

```
dash = str.indexOf(spec, "-")
```

`-1` rather than absence, because "not found" is a definite answer to a definite
question and every script that uses the result compares it against `-1`
immediately. Absence would propagate into that comparison and make it absent,
which is the wrong shape for a search.

---

## 3. Building a string

### `str.upper(s)`

Upper case, invariant.
Parameters: `s` `string` required.
Returns `string`.

```
tag = str.upper(side)
```

### `str.lower(s)`

Lower case, invariant.
Parameters: `s` `string` required.
Returns `string`.

```
key = str.lower(str.trim(raw))
```

### `str.trim(s)`

Leading and trailing spaces removed.
Parameters: `s` `string` required.
Returns `string`.

```
clean = str.trim(input("", "Note"))
```

### `str.substring(s, from, to = none)`

`from` inclusive, `to` exclusive, to the end of the string when `to` is absent.
Parameters: `s` `string` required; `from` `number` required; `to` `number`
default `none`.
Returns `string`.

```
hhmm = str.substring(spec, 0, 4)
```

### `str.replace(s, find, with)`

Replaces the first occurrence only.
Parameters: `s` `string` required; `find` `string` required; `with` `string`
required.
Returns `string`.

```
shown = str.replace(title, "  ", " ")
```

### `str.replaceAll(s, find, with)`

Replaces every occurrence.
Parameters: `s` `string` required; `find` `string` required; `with` `string`
required.
Returns `string`.

```
flat = str.replaceAll(note, "\n", " ")
```

### `str.split(s, separator)`

Split into parts.
Parameters: `s` `string` required; `separator` `string` required.
Returns `array<string>`.

```
parts = str.split(window, "-")
```

### `str.join(parts, separator)`

Join an array back into one string.
Parameters: `parts` `array<string>` required; `separator` `string` required.
Returns `string`.

```
line = str.join(columns, " | ")
```

### `str.repeat(s, n)`

`n` copies of a string.
Parameters: `s` `string` required; `n` `number` required.
Returns `string`.

```
meter = str.repeat("#", round(strength * 10))
```

`str.repeat` exists for one specific job: drawing a bar out of characters inside
a panel cell, where a real histogram would need its own pane. It is the shortest
honest way to show a magnitude in a grid.

---

## 4. Lining a column up

### `str.padLeft(s, width, fill = " ")`

Pad to a width from the left, so numbers line up on their last digit.
Parameters: `s` `string` required; `width` `number` required; `fill` `string`
default `" "`.
Returns `string`.

```
cell(panel, row, 1, str.padLeft(text(value, 2), 9))
```

### `str.padRight(s, width, fill = " ")`

Pad to a width from the right, so labels line up on their first letter.
Parameters: `s` `string` required; `width` `number` required; `fill` `string`
default `" "`.
Returns `string`.

```
cell(panel, row, 0, str.padRight(name, 18))
```

Padding is needed even inside a grid because a panel cell holds text, and text
in a proportional font does not line up by itself. Padding a number on the left
and a label on the right is the pair that makes a column of readings scannable:
the decimal points stack, and the eye can run down them.

---

## 5. Planned

### `str.format(template, values)` (planned)

Substitution into a template.
Parameters: `template` `string` required; `values` `array<string>` required.
Returns `string`.

```
line = str.format("{0} at {1}", [side, text(close, 2)])
```

It is planned rather than shipped because version 1 has no variadic call form,
and the array-of-strings workaround reads worse than concatenating with `text()`
does. It arrives with the call form, not before, so that the version that ships
is the one people will want to keep using.

### `str.match(s, pattern)` (planned)

Pattern matching.
Parameters: `s` `string` required; `pattern` `string` required.
Returns `bool`.

```
isOption = str.match(chart.symbol, optionPattern)
```

It waits on a pattern syntax being specified. A pattern language that two
engines read differently would break the promise that the same script produces
the same output everywhere, and no pattern syntax is small enough to specify in
passing.

---

## 6. Three worked examples

### A one line status message

```
version 1
study("Status")

r = rsi(close, 14)
a = atr(14)

// One helper decides what an absent reading looks like, in one place. A blank
// and a zero are both wrong: the first hides that the study is warming up, the
// second invents a number.
fn show(value, decimals) => isNone(value) ? "warming up" : text(value, decimals)

if bar.isLast
    print(chart.symbol + " " + chart.interval
          + "  RSI " + show(r, 1)
          + "  ATR " + show(a, 2))
```

### An alert message carrying the numbers that caused it

```
version 1
study("Cross alert")

fast = ema(close, 9)
slow = ema(close, 21)

if crossUp(fast, slow)
    alert("Fast crossed above slow at " + text(close, 2)
          + ", gap " + text(fast - slow, 2),
          id = "cross-up", title = "EMA cross")
```

The message is built from `text()` calls rather than from the values directly,
so that a value which is somehow absent produces the string `"none"` in the
alert instead of making the whole message absent and sending nothing. An alert
that does not arrive is the worst failure mode this page has.

### A panel column that lines up

```
version 1
study("Aligned panel", overlay = true)

panel = table("Readings", 3, 2, position = "topRight")

r = rsi(close, 14)
a = atr(14)
v = relativeVolume(20)

fn reading(value, decimals) =>
    str.padLeft(isNone(value) ? "-" : text(value, decimals), 8)

if bar.isLast
    cell(panel, 0, 0, str.padRight("RSI", 20))
    cell(panel, 0, 1, reading(r, 1))
    cell(panel, 1, 0, str.padRight("ATR", 20))
    cell(panel, 1, 1, reading(a, 2))
    cell(panel, 2, 0, str.padRight("Relative volume", 20))
    cell(panel, 2, 1, reading(v, 2))
```

The panel is written only on the newest bar. It shows one state, the current
one, so writing it on all fifty thousand bars would cost fifty thousand writes
to display the last of them. The rollback rule makes that safe on a live chart:
the newest bar re-executes on every update and rewrites the same cells.

## See also

- [math.md](./math.md) for `round`, `number` and the difference between rounding and formatting
- [drawing.md](./drawing.md) for `table`, `cell`, `print`, `signal` and `alert`
- [time.md](./time.md) for `date.format`, which renders a timestamp rather than a number
- [collections.md](./collections.md) for the arrays `str.split` and `str.join` work with
- [input.md](./input.md) for text and menu inputs that feed these functions
- [../../../spec/stdlib.md](../../../spec/stdlib.md) for the specification these entries are derived from
