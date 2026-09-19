# Collection functions

By the end of this page you will be able to keep a list of values across bars,
read and change it safely, compute statistics over the whole of it, and know why
copying, indexing and iteration behave the way they do.

## What an array is

An `array<T>` is ordered, mutable, resizable and homogeneous: every element has
the same type. Literals use square brackets, and an empty literal takes its type
from an annotation or from context.

```
levels = [20.0, 50.0, 80.0]
names  = ["a", "b"]
var hits: array<number> = []
```

**An array value is a reference.** Assigning one name to another gives two names
for one array; `copy(arr)` makes an independent one. This is stated rather than
left to be discovered, because the alternative, copying on assignment, would
make passing a large array to a function quietly expensive on every bar of every
run.

**`[]` means history on a series and element access on an array.** The checker
knows which from the type, so there is no ambiguity at compile time and no
run-time dispatch. The one case where a reader can be misled is a `var` holding
an array, where `[]` indexes the array and the reader might have expected the
previous bar's array. Both explicit forms exist for that line:

```
var prices = [0.0]
prices[0]                   // the first element
element(prices, 0)          // the same thing, said explicitly
history(prices, 1)          // the array as it stood one bar ago
```

**An array in a `var` is persistent, and it rolls back.** The rollback rule
restores its contents as well as its reference before the newest bar is executed
again, so a script that pushes to an array on a moving bar does not accumulate
one duplicate per tick, and a live chart agrees with a backtest of the same
data.

Arrays are limited to 1,000,000 elements by default. Exceeding that is OS5002,
and `limits()` does not raise it in version 1.

None of the functions on this page has a warmup: they operate on the array as it
stands on the bar being executed.

---

## 1. Reading

### `size(arr)`

Element count.
Parameters: `arr` `array<T>` required.
Returns `number`.

```
if size(closes) > 100
    shift(closes)
```

### `element(arr, i)`

Read element `i`, counting from 0. `arr[i]` is the same call written shorter.
Parameters: `arr` `array<T>` required; `i` `number` required.
Returns `T`.

```
first = element(levels, 0)
```

### `indexOf(arr, v)`

First index of `v`.
Parameters: `arr` `array<T>` required; `v` `T` required.
Returns `number`, or `-1` when `v` does not occur.

```
slot = indexOf(names, "b")
```

An index outside `0` to `size - 1` is OS4004, naming the index and the size. It
is an error rather than absence because an array has a known extent that the
script itself chose, so an out-of-range index is a mistake rather than a missing
measurement. That is the opposite of `close[100]` on bar 7, which is absence: a
value that never existed rather than one the script asked for wrongly.

---

## 2. Changing

### `set(arr, i, v)`

Write element `i`.
Parameters: `arr` `array<T>` required; `i` `number` required; `v` `T` required.
Returns nothing; the array is changed in place.

```
set(levels, 0, close)
```

### `push(arr, v)`

Append to the end.
Parameters: `arr` `array<T>` required; `v` `T` required.
Returns nothing.

```
push(closes, close)
```

### `pop(arr)`

Remove and return the last element.
Parameters: `arr` `array<T>` required.
Returns `T`.

```
newest = pop(closes)
```

### `shift(arr)`

Remove and return the first element.
Parameters: `arr` `array<T>` required.
Returns `T`.

```
oldest = shift(closes)
```

### `unshift(arr, v)`

Insert at the front.
Parameters: `arr` `array<T>` required; `v` `T` required.
Returns nothing.

```
unshift(recent, close)
```

### `insert(arr, i, v)`

Insert before index `i`.
Parameters: `arr` `array<T>` required; `i` `number` required; `v` `T` required.
Returns nothing.

```
insert(levels, 1, 50.0)
```

### `remove(arr, i)`

Remove and return element `i`.
Parameters: `arr` `array<T>` required; `i` `number` required.
Returns `T`.

```
dropped = remove(zones, 0)
```

### `clear(arr)`

Remove everything.
Parameters: `arr` `array<T>` required.
Returns nothing.

```
clear(swingTimes)
```

`clear` also has a table form, `clear(t)`, documented in
[drawing.md](./drawing.md). The checker picks the signature from the argument's
type.

Guard the removals with `size(arr) > 0` when the array can be empty. A rolling
window is the usual shape, and it reads best as a push followed by a size test:

```
push(closes, close)
if size(closes) > 100
    shift(closes)
```

---

## 3. Copying, slicing and ordering

### `slice(arr, from, to)`

A new array holding part of this one, `from` inclusive and `to` exclusive.
Parameters: `arr` `array<T>` required; `from` `number` required; `to` `number`
required.
Returns `array<T>`.

```
firstTen = slice(closes, 0, 10)
```

### `copy(arr)`

An independent copy.
Parameters: `arr` `array<T>` required.
Returns `array<T>`.

```
snapshot = copy(closes)
```

### `sort(arr, order)`

Sort in place.
Parameters: `arr` `array<T>` required; `order` `string` required, `"asc"` or
`"desc"`.
Returns nothing.

```
sort(closes, "asc")
```

### `reverse(arr)`

Reverse in place.
Parameters: `arr` `array<T>` required.
Returns nothing.

```
reverse(recent)
```

`sort` and `reverse` change the array they are given rather than returning a new
one, which is why a script that needs both orders keeps a `copy`. Sorting the
array a plot reads from would reorder the plot as a side effect, and side
effects that reach the chart are the hardest kind to find.

---

## 4. Statistics over a whole array

These take one argument and read every element.

| Call | Returns | For |
|---|---|---|
| `sum(arr)` | `number` | Total of every element |
| `avg(arr)` | `number` | Mean of every element |
| `min(arr)` | `number` | Smallest element |
| `max(arr)` | `number` | Largest element |
| `stdev(arr)` | `number` | Standard deviation over every element |

```
plot(avg(closes), "Rolling mean", aqua)
```

Four of those names carry a second signature that works across bars instead of
across an array: `sum(src, len)` and the rest of the window functions in
[series.md](./series.md), and `min(a, b)` and `max(a, b)` in
[math.md](./math.md). The checker resolves the call at compile time from the
arity and the argument types, so a reader can do the same resolution by eye.

Overloading is allowed here because `min(a, b)` and `min(arr)` are the same
idea, and two names for one idea is worse than one name with two shapes. It is
limited to arity and type so that the resolution stays mechanical: a call that
matches no signature is OS3001 when the arity is wrong and OS3011 when a type
is, and the message lists every signature the name has.

### `arrayEqual(a, b)`

Compare two arrays by contents.
Parameters: `a` `array<T>` required; `b` `array<T>` required.
Returns `bool`.

```
unchanged = arrayEqual(levels, previousLevels)
```

`a == b` on two arrays asks whether they are the same array, not whether they
hold equal elements. `arrayEqual` asks the other question. Both exist because
both are asked, and one operator cannot mean both without a reader having to
guess which.

---

## 5. Iterating

`for value in arr` visits indices `0` to `size - 1` as measured when the loop is
entered. Elements appended during the loop are not visited, and if the array
shrinks so that the cursor is past the end, the loop stops.

```
total = 0.0
for price in prices
    total += price
```

Iteration order over an array is index order, always. There is no unordered
collection in version 1, because a script whose answer depended on a hash order
would produce different numbers on two engines and could not be part of a
conformance suite.

Every iteration of every loop, summed over all loops executed during one bar,
counts against a per-bar budget of 2,000,000 iterations by default. Exceeding it
is OS5001, which stops that bar rather than breaking out of the loop quietly: a
loop that ran two million times and then stopped produces a plausible wrong
number, and a plausible wrong number is worse than no number. A script that
genuinely needs more raises it in one place, immediately after the declaration:

```
study("Heavy")
limits(loops = 50_000_000)
```

---

## 6. Maps and matrices (planned)

`map` and `matrix` are reserved words in version 1 and are not implemented.
Calling for one is an error saying it is planned, not an error saying the name
does not exist.

| Type | Intent |
|---|---|
| `map<K, V>` (planned) | `string` and `number` keys, with iteration order defined as insertion order so that a script using one stays deterministic across engines, which is the property an unordered hash map would cost |
| `matrix<T>` (planned) | A two-dimensional numeric container with element access, row and column operations, and the small set of linear algebra that correlation and regression studies need |

They are reserved now, and specified only this far, because reserving a word
costs nothing today and adding one later would break every script that had used
it as a name. They arrive with a language version bump, and the compatibility
promise means a script written today keeps compiling and keeps producing the
same numbers when they do.

---

## 7. Three worked examples

### A rolling window kept by hand

```
version 1
study("Rolling mean", overlay = true)

len = input(100, "Window", min = 2, max = 1000)

var closes = [0.0]

// The literal seeds the type. The first bar then replaces it, so the window
// never carries the placeholder into the mean.
if bar.isFirst
    set(closes, 0, close)
else
    push(closes, close)

if size(closes) > len
    shift(closes)

plot(avg(closes), "Mean", aqua)
plot(max(closes), "Window high", lime)
plot(min(closes), "Window low", red)
```

For a plain rolling mean, `sma(close, len)` is shorter, exact about its warmup
and computed incrementally. Keep a window by hand when you need several
statistics over the same set, or a statistic the library does not have.

### Collecting swing points for a path

```
version 1
study("Swing path", overlay = true)

left  = input(5, "Left bars", min = 1, max = 50)
right = input(5, "Right bars", min = 1, max = 50)
keep  = input(20, "Points to keep", min = 2, max = 200)

var swingTimes  = []
var swingPrices = []
var path        = none

ph = pivotHigh(high, left, right)
pl = pivotLow(low, left, right)

// The pivot is reported right bars after it formed, so the point it describes
// is at time[right], not at this bar.
if not isNone(ph)
    push(swingTimes, time[right])
    push(swingPrices, ph)

if not isNone(pl)
    push(swingTimes, time[right])
    push(swingPrices, pl)

if size(swingTimes) > keep
    shift(swingTimes)
    shift(swingPrices)

if size(swingTimes) > 1
    if isNone(path)
        path = draw.polyline(swingTimes, swingPrices, color = orange)
    else
        draw.setPoints(path, swingTimes, swingPrices)
```

One object, created once and then given new points, rather than one polyline per
bar. The two arrays are parallel because version 1 has no record type, and they
are pushed and shifted together so that they stay the same length.

### A sorted copy, leaving the original alone

```
version 1
study("Window median", precision = 2)

len = input(50, "Window", min = 3, max = 500)

var window = []

push(window, close)
if size(window) > len
    shift(window)

// sort changes the array it is given, so the copy is what gets sorted and the
// window stays in bar order for anything else that reads it.
ranked = copy(window)
sort(ranked, "asc")

middle = size(ranked) > 0 ? element(ranked, floor(size(ranked) / 2)) : none

plot(middle, "Median", orange)
plot(median(close, len), "Library median", fade(aqua, 40))
```

The two lines agree once the window is full, and the second one is the one to
write in a real study: `median(close, len)` from [series.md](./series.md) states
its warmup exactly, while the hand-built version quietly reports the median of
however many bars it happens to hold.

## See also

- [series.md](./series.md) for the windowed statistics that usually replace a hand-built array
- [math.md](./math.md) for `min(a, b)`, `max(a, b)` and the numeric rules the array statistics follow
- [string.md](./string.md) for `str.split` and `str.join`, which produce and consume `array<string>`
- [drawing.md](./drawing.md) for `draw.polyline` and `clear`, which take the other kind of argument
- [ta.md](./ta.md) for the multi-output functions that return an `array<number>` of this bar's outputs
- [../../../spec/language.md](../../../spec/language.md) for the specification of arrays, which are part of the language rather than the market library
