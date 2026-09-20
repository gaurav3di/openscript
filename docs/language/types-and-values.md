# Types and values

By the end of this page you will be able to name the type of every value your
script holds, tell a series apart from a single value, convert between types
where the language allows it, and recognise the conversions it refuses before
the compiler refuses them for you.

## The seven types

OpenScript has a small, closed set of types. There is no way to define a new one
in language version 1, and there is no type that means "anything".

| Type | Holds | Written as | Has history |
|---|---|---|---|
| `number` | One finite real number | `42`, `3.14`, `0xFF` | Only through a name, see below |
| `string` | A sequence of Unicode code points | `"BUY"`, `'BUY'` | Only through a name |
| `bool` | `true` or `false` | `true`, `false` | Only through a name |
| `color` | Red, green, blue and alpha | `aqua`, `#ff8800`, `rgb(255, 136, 0)` | Only through a name |
| `none` | The absent value | `none` | Not a container |
| `series T` | One `T` per bar | no literal | Yes, that is what it is |
| `array<T>` | An ordered, mutable, resizable list of `T` | `[1, 2, 3]` | The name has history, see the note below |

Two things about this table are worth reading twice. The first is that `none` is
a type with one value, and that value is a member of every other type: a
`series number` may hold `none` on any bar, and so may a `string` name. The
second is that `series T` is not a separate family of types you convert to and
from. It is the same `T`, once per bar, and the language moves between the two
automatically in the one direction that cannot lose information.

## There is one numeric type

A `number` is an IEEE-754 binary64 value that is finite. That is the whole of
arithmetic in this language. There is no integer type, no decimal type, no
unsigned type, and no separate type for a price or a quantity.

The reason is that a length, a bar count, a lot size and a price would otherwise
be four types with twelve conversions between them, and every one of those
conversions is a place to put a bug. One type means the conversions do not
exist. The cost is that the language has to say what happens when a whole number
is required and a fractional one arrives, and it says it loudly: a lookback
length, an array index or a loop step that is not a whole number is refused. It
is OS3004 when the compiler can see the value and OS4003 when the value is
computed on a bar. It is never truncated silently, because a length of 14.5 is a
bug in the script and rounding it hides the bug.

```
version 1

study("Half length", overlay = true, precision = 2)

len = input(21, "Slow length", min = 2, max = 500)

// len / 2 is 10.5 when len is 21. A length of 10.5 is refused with OS3004, so
// the script says which way it wants the halving to go, where a reader sees it.
halfLen = floor(len / 2)

plot(sma(close, len),     "Slow", orange, width = 2)
plot(sma(close, halfLen), "Fast", aqua,   width = 2)
```

A `number` is always finite. Infinity and not-a-number are not values in this
language: an operation whose real result does not exist or is not finite
produces the absent value instead. `1 / 0` is `none`, `sqrt(-1)` is `none`,
`log(0)` is `none`. That rule has a page of its own, because it is the rule most
likely to cost you money if you learn it late.

The literal forms:

```
42
3.14
.5              // a leading digit is not required
1_000_000       // underscores separate digit groups and carry no meaning
2.5e-4
0xFF            // 255
010             // ten, not eight: there is no octal form
```

Time is a `number`: milliseconds since the Unix epoch, in UTC. There is no
separate time type. That is why an elapsed time is ordinary arithmetic, and why
a script that measures fifteen minutes from a session open needs no calendar at
all:

```
elapsed = time - openTime                  // milliseconds
forming = elapsed < 15 * 60000             // the first fifteen minutes
```

## Strings

A string literal is delimited by double quotes or single quotes, and the two
forms mean exactly the same thing. Two delimiters exist so that a string
containing one kind of quote needs no escapes.

The escape sequences are `\\`, `\"`, `\'`, `\n`, `\t`, `\r`, `\0` and `\uXXXX`
with exactly four hexadecimal digits. Any other backslash sequence is OS1005. A
string literal may not span a line.

`+` concatenates two strings and does nothing else. `"count: " + 5` is OS2003,
not `"count: 5"`. The conversion is one call, `text()`, and the reason the
language insists on it is in the conversions section below.

Strings compare with `<`, `<=`, `>` and `>=` by Unicode code point. That order is
stable on every machine and in every locale, which is what a language that
promises identical output from two engines needs. It is not a human friendly
alphabetical sort and is not offered as one.

## Booleans

`true` and `false` are of type `bool`, and they are not numbers. `0` is not
false, `1` is not true, and `""` is not false. There is no truthiness anywhere in
the language: a condition must be a `bool` or the absent value, and anything else
is OS2011 with a message naming the test you probably meant.

```
if hits > 0             // correct
if hits                 // OS2011: a number is not a condition
```

This is the rule that surprises people arriving from a language with truthiness,
and it is worth the surprise. Every silent coercion rule in every language is a
source of bugs that survive review, and a trading script that quietly treats a
zero as a false has a bug nobody finds until it has cost something.

To turn a condition into a number, say so: `cond ? 1 : 0`. To count how many of
the last fifty bars a condition held on, the library already has it:
`count(cond, 50)`.

## Colours

A colour is written as one of three forms, and produced by a small set of
functions.

| Form | Example | Means |
|---|---|---|
| A named colour | `aqua` | One of nineteen bare names, fully opaque |
| Hex, 24 bit | `#ff8800` | Red, green, blue |
| Hex with alpha | `#ff880080` | The same with an alpha byte |
| `rgb(r, g, b)` | `rgb(255, 136, 0)` | Channels 0 to 255, opaque |
| `rgba(r, g, b, a)` | `rgba(255, 136, 0, 0.5)` | The same, alpha 0 to 1 |
| `fade(color, percent)` | `fade(aqua, 88)` | The same colour at 88 percent transparency |
| `withAlpha(color, a)` | `withAlpha(aqua, 0.12)` | The same colour at an alpha of 0.12 |
| `mix(a, b, weight)` | `mix(red, lime, 0.5)` | A blend, weight 0 gives `a` and 1 gives `b` |

The nineteen names are `aqua`, `black`, `blue`, `brown`, `fuchsia`, `gray`,
`green`, `lime`, `maroon`, `navy`, `olive`, `orange`, `pink`, `purple`, `red`,
`silver`, `teal`, `white` and `yellow`. They are bare, with no prefix, because a
colour appears in almost every line that draws something and a prefix on a fixed
vocabulary of nineteen words is pure noise.

Note that `fade` takes transparency and `withAlpha` takes opacity, and the two
run in opposite directions. `fade(aqua, 88)` is nearly invisible; `withAlpha(aqua,
0.88)` is nearly solid. Both exist because a chart's own style controls are
labelled one way and a colour library is usually labelled the other, and guessing
wrong draws something you cannot see.

Two colours are equal when all four channels match. A channel outside its range
is OS4009 rather than a clamp, because a colour computed from data and landing at
300 is a bug in the computation.

## The absent value, in one paragraph

`none` is the absent value. It is what a moving average holds before it has
enough bars, what `close[1]` is on the first bar of the dataset, and what a
division by zero produces. It propagates through arithmetic and through ordered
comparison, it does not propagate through `==` and `!=`, and a condition that
evaluates to it takes the false branch. Everything else about it, including the
list of mistakes it causes and the fix for each, is on its own page: see
[absent-values.md](./absent-values.md).

## Arrays

An `array<T>` is ordered, mutable, resizable and homogeneous. Every element has
the same type, which is what lets `size`, `sum`, `avg` and `sort` each mean one
thing.

```
levels = [20.0, 50.0, 80.0]
names  = ["a", "b"]
var hits: array<number> = []
```

Three rules carry most of the surprises.

**An empty literal needs its element type.** `[]` on its own has nothing to infer
from, and the language does not guess: that is OS2015, and the fix is the
annotation shown above.

**A literal may not mix types.** `["RSI", 14]` is OS2013. Two lists that belong
side by side are two arrays indexed together.

**An array value is a reference.** Assigning one name to another gives two names
for one array. `copy(arr)` makes an independent one. The alternative, copying on
assignment, would make passing a large array to a function quietly expensive on
every bar of every run. For the same reason, `==` on two arrays asks whether they
are the same array, and `arrayEqual` compares contents.

An index outside `0` to `size - 1` is OS4004, an error rather than an absent
value, because an array has an extent the script chose. This is deliberately the
opposite of the history operator, where reading past the start of the dataset is
absence: there, the value never existed; here, the script asked for something it
never created.

```
version 1

study("Rolling window", precision = 2)

length = input(20, "Window", min = 2, max = 500)

var window: array<number> = []

push(window, close)
if size(window) > length
    shift(window)

plot(avg(window),   "Rolling mean",      aqua,   width = 2)
plot(stdev(window), "Rolling deviation", orange)
```

## A series is not a single value

This is the distinction that matters most, and the one worth getting straight
before you write anything long.

A **series** is the per-bar history of a value. `series number` is one number per
bar; `series bool` is one boolean per bar. Reading a series bare gives the value
on the bar being executed. The history operator `[n]` gives the value `n` bars
back.

```
close           // this bar's close
close[1]        // the previous bar's close
close[0]        // identical to close
```

A single value is one value for the whole run. `chart.tickSize` is a single
value. So is `14`. So is the result of `input(14, "Length")`.

### Which values have history

A value accepts `[]` in exactly four cases:

1. It is a built-in series: `open`, `high`, `low`, `close`, `volume`, `time`,
   `hl2`, `hlc3`, `ohlc4`, `hlcc4`, and the per-bar facts in the `bar` and
   `session` namespaces.
2. It is a name declared at the **top level of the file**.
3. It is a call to a function declared to return a series, such as `ema(close, 9)`.
4. It is a parameter of a user function whose type is a series, in which case
   `[]` reads the history of the expression the caller passed.

`[]` on anything else is OS2004. Where the value is a per-bar number computed
inside a block or left as a temporary, give it a name at the top level of the file
and read that name's history. Where it is a declaration handle, a runtime object
or a library fact that is not a series, a name changes nothing, because there is
no per-bar value to retain: assign what you want to look back at to a top level
name of its own, and read that.

```
// This does not compile. inner belongs to the block, and history is retained
// only for names at the top level of the file.
if trending
    inner = close - open
    plot(inner[1], "Previous body", aqua)
```

```
version 1

study("Body history", precision = 2)

trending = ema(close, 20) > ema(close, 50)

// Named at the top level, so it has history, and the plot is hidden on the
// bars that do not interest us by plotting the absent value rather than by
// wrapping the plot in an if.
body = close - open

plot(body, "Body", fade(aqua, 60), style = "histogram")
plot(trending ? body[1] : none, "Previous body while trending", aqua)
```

The restriction exists because retaining history costs memory per bar. A language
that retained it for every temporary inside every loop body would not run fifty
thousand bars in a browser tab. Naming the value is the price of keeping its
past, and it is one line.

### Broadcast, the one automatic conversion

A plain `T` used where a `series T` is expected is **broadcast**: it is treated as
that same value on every bar. The reverse also holds: a `series T` used where a
plain `T` is expected means that bar's value.

```
plot(ema(close, 9), "EMA", aqua)        // 9 is broadcast to every bar
plot(ema(close, len), "EMA", orange)    // len works whether it is fixed or per bar
```

Broadcast is the only automatic widening in the language, and it changes no
value, which is why it is allowed to be silent. Everything else is an explicit
call.

Passing an expression to a series parameter makes the engine retain that
expression's per-bar values for that call site, so `[]` inside the function reads
real history:

```
version 1

study("Change of source", precision = 2)

fn change2(src) => src - src[1]

// hlc3's per-bar values are retained for this call site, so src[1] inside the
// function is the previous bar's hlc3 and not an error.
plot(change2(hlc3), "Change in typical price", aqua)
```

### Telling which one you are holding

Three questions settle it every time.

| Ask | If yes | Example |
|---|---|---|
| Does it change from bar to bar? | It is a series | `close`, `ema(close, 9)`, `bar.index`, `session.isOpen` |
| Was it fixed before bar 0? | It is a single value | `input(14, "Length")`, `chart.tickSize`, `3.14` |
| Is it a name at the top level of the file? | It accepts `[]` either way | `len = 14` allows `len[1]`, which is always 14 |

The `chart` namespace is the clearest case of a single value: `chart.symbol`,
`chart.interval`, `chart.tickSize` and `chart.lotSize` are constant for the whole
run, so they are typed as plain values and carry no history at all. Asking for
`chart.tickSize[1]` is OS2004, and the fix is to stop asking, because the answer
could not have been different.

An `input()` is a single value with one exception: a source input,
`input(close, "Source")`, returns a `series number`, because what the user picked
is a series.

A function with more than one output returns an `array<number>` holding this
bar's outputs, in the order the library documents. The array itself is never
absent and never changes length; each element carries its own warmup and is
absent until it is reached.

```
version 1

study("MACD", precision = 4)

m = macd(close, 12, 26, 9)

plot(m[0], "MACD",      aqua,   width = 2)
plot(m[1], "Signal",    orange, width = 2)
plot(m[2], "Histogram", gray,   style = "histogram")
```

Note what `m[0]` means there. `m` is an array, so `[]` is element access, not
history. The checker knows which from the type, so there is no ambiguity, but a
reader scanning quickly can be misled. Where a line is doing both, the explicit
forms remove the doubt: `element(arr, i)` always means element access, and
`history(expr, n)` always means history.

## Conversions the language allows

There are four, and they are all calls.

| Call | Takes | Gives | Notes |
|---|---|---|---|
| `text(x)` | any value | `string` | `text(none)` is the string `"none"` |
| `text(x, decimals)` | `number` | `string` | Fixed decimals, halves away from zero |
| `toNumber(s)` | `string` | `number` | `none` when the string does not parse |
| `toBool(x)` | `none` or `bool` | `bool` | `none` becomes `false`; a number is refused |

```
version 1

study("Formatted readings", precision = 2)

r = rsi(close, 14)
a = atr(14)

// text() is what makes a number safe to put in a string. Note that the whole
// message is absent while r is absent, because + propagates absence, which is
// why the guard is here rather than in the middle of the string.
message = isNone(r) ? "warming up" : "RSI " + text(r, 1) + ", ATR " + text(a, 2)

plot(r, "RSI", purple, width = 2)

if bar.isLast
    print(message)
```

`toNumber(s)` is the one conversion that can fail, and it fails the way
everything else in this language fails: it returns the absent value rather than
raising. `toNumber("12.5")` is `12.5`, `toNumber("12.5%")` is `none`. Test it
with `isNone` before you rely on it.

Two of the four are spelled `to` and the type because `bool` and `number` are
reserved words, and a call has to begin with a name. Writing `number("12.5")` is
OS1019, and the fix it gives names `toNumber`.

## Conversions the language refuses

There is no implicit conversion between any two types, in any direction,
anywhere.

| What you write | What happens | What to write instead |
|---|---|---|
| `1 + true` | OS2003, `number` and `bool` | `1 + (flag ? 1 : 0)` |
| `"count: " + 5` | OS2003, `string` and `number` | `"count: " + text(5)` |
| `if 1` | OS2011, a condition must be `bool` | `if n > 0` |
| `if hits` | OS2011 | `if hits > 0` |
| `up ? 1 : "down"` | OS2012, the arms disagree | Make both arms one type, or use `none` |
| `["RSI", 14]` | OS2013, a mixed array literal | Two arrays, indexed together |
| `toBool(1)` | Refused, numbers are not booleans | `n != 0` |
| `len = 14` then `len = "fourteen"` | OS2003, the type was fixed | Use a second name |

That last row is a rule in its own right: **a name's type is fixed by its first
assignment.** Assigning a different type to it later is OS2003 even when the two
assignments are pages apart. A name is one thing for the life of the script,
which is what lets a reader look at one line and know what a name holds without
tracing every branch that reached it.

The one exception is the absent value, which is a member of every type. A name
that holds `none` on some bars and a number on others is an ordinary
`series number`, not a mixed type.

## The type errors you are likely to meet

| Code | Means | Usual fix |
|---|---|---|
| OS2003 | Two types do not mix, or a name changed type | Convert with `text`, `toNumber` or `toBool`, or use a second name |
| OS2004 | The value has no history | Name the per-bar number at the top level of the file, and read that name |
| OS2011 | A condition is not a `bool` | Write the test out: `x > 0`, `isNone(x)`, `s != ""` |
| OS2012 | The ternary arms have different types | Make them agree, or use `none` for the empty arm |
| OS2013 | An array literal mixes types | Split it into two arrays |
| OS2015 | An empty array literal has no element type | Annotate: `var hits: array<number> = []` |
| OS2016 | An annotation names a type that does not exist | The types are `number`, `string`, `bool`, `color`, `array<T>`, with `series` in front where a per-bar value is meant |
| OS3004 | A whole number was required and a literal was fractional | Wrap it in `floor()` or `round()` |
| OS4003 | The same, for a value computed on a bar | The same fix, at the point the value is built |
| OS4004 | An array index is outside the array | Guard the read with `size(arr)` |

## See also

- [absent-values.md](./absent-values.md) for the absent value in full, and the mistakes it causes
- [operators.md](./operators.md) for what each operator does to the types on this page
- [variables-and-scope.md](./variables-and-scope.md) for how a name gets its type and where it can be read
- [control-flow.md](./control-flow.md) for the places a `bool` is required
- [collections.md](./collections.md) for every array operation the language has
- [bars-and-history.md](./bars-and-history.md) for reading a series through `[]`
- [../README.md](../README.md) for the documentation index
- [../../spec/language.md](../../spec/language.md) sections 5, 9 and 14 for the rules this page teaches
- [../../examples/](../../examples/) for twelve working scripts
