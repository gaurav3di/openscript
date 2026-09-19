# Collections

By the end of this page you can hold a list of values in a script, use every
array operation the language has, tell a list that is rebuilt every bar from one
that lives for the whole run, and know exactly which collection types exist
today and which are reserved for a later version.

OpenScript has one collection type in version 1: the array. Maps and matrices
are reserved words with no implementation behind them yet, and the last section
of this page says what that means for a script you are writing today.

## On this page

- [What arrays are for](#what-arrays-are-for)
- [Making an array](#making-an-array)
- [An array is a reference](#an-array-is-a-reference)
- [Reading and writing elements](#reading-and-writing-elements)
- [Every operation](#every-operation)
- [The errors, and why an index is an error](#the-errors-and-why-an-index-is-an-error)
- [Two lifetimes: the bar and the run](#two-lifetimes-the-bar-and-the-run)
- [A rolling window, worked](#a-rolling-window-worked)
- [Iterating safely](#iterating-safely)
- [Arrays that come back from a call](#arrays-that-come-back-from-a-call)
- [Parallel arrays](#parallel-arrays)
- [Maps and matrices: what is true today](#maps-and-matrices-what-is-true-today)
- [Living without a map](#living-without-a-map)
- [Living without a matrix](#living-without-a-matrix)

## What arrays are for

A series already gives you the past: `close[20]` is twenty bars back and needs no
container. So an array is not for remembering price history. It is for the four
jobs a series cannot do.

| Job | Example |
|---|---|
| A window you need to reshape | Sort the last 20 closes and drop the extremes |
| A set the script grows and shrinks | The zones currently drawn, the entries currently open |
| A record per element, kept side by side | Four arrays describing the boxes a study drew |
| Several outputs from one call | `bollinger` hands back `[basis, upper, lower]` |

If what you want is "the value n bars ago", use `[]` on a series and write no
array at all. Arrays cost memory and attention; reach for one when the shape of
the problem is a list.

## Making an array

An `array<T>` is ordered, mutable, resizable and homogeneous: every element has
the same type.

```
levels = [20.0, 50.0, 80.0]         // array<number>
names  = ["a", "b"]                 // array<string>
flags  = [true, false, true]        // array<bool>
var hits: array<number> = []        // empty, so the type is written down
```

A literal whose elements are of different types is OS2013. An empty literal has
no element to infer from, so it takes its type from an annotation or from the
first use; write the annotation. It costs seven characters, it is the only
documentation the next reader gets, and it is never wrong.

The element type may itself be an array, so `array<array<number>>` is legal as
an annotation. Before you reach for it, read the matrix section at the bottom of
this page: a flat array with index arithmetic is usually clearer and always
faster.

## An array is a reference

**Assigning an array to another name gives you two names for one array.** It
does not copy.

```
a = [1.0, 2.0, 3.0]
b = a
set(b, 0, 99.0)
// a[0] is now 99, because a and b are the same array
c = copy(a)                 // c is independent
```

The alternative, copying on assignment, would make passing a large array to a
function quietly expensive on every bar of every run, and the expense would be
invisible in the source. Copying is explicit instead, and it is one word.

The same rule explains a comparison that surprises people: `==` on two arrays
asks whether they are the same array, not whether they hold equal elements.
`arrayEqual(a, b)` compares contents.

## Reading and writing elements

`a[i]` is element access when `a` is an array and history when `a` is a series.
The checker knows which from the type, so there is no ambiguity at compile time
and no dispatch at run time.

The one place a reader can be misled is a `var` holding an array, where a line
could plausibly mean either. Both explicit forms exist for exactly that line:

```
var prices = [0.0]
prices[0]                   // the first element
element(prices, 0)          // the first element, said explicitly
history(prices, 1)          // the array as it stood one bar ago
```

Use the explicit forms wherever a line is doing both kinds of work. Elsewhere,
`a[i]` reads fine and everybody understands it.

## Every operation

All of these are bare names in the global scope.

**Size and reading**

| Call | Does |
|---|---|
| `size(arr)` | Element count |
| `arr[i]`, `element(arr, i)` | Read element `i` |
| `indexOf(arr, v)` | First index of `v`, or `-1` |

**Writing in place**

| Call | Does |
|---|---|
| `set(arr, i, v)` | Write element `i` |
| `sort(arr, order)` | Sort in place, `"asc"` or `"desc"` |
| `reverse(arr)` | Reverse in place |

**Growing and shrinking**

| Call | Does |
|---|---|
| `push(arr, v)` | Append to the end |
| `pop(arr)` | Remove and return the last element |
| `unshift(arr, v)` | Insert at the front |
| `shift(arr)` | Remove and return the first element |
| `insert(arr, i, v)` | Insert before index `i` |
| `remove(arr, i)` | Remove and return element `i` |
| `clear(arr)` | Remove everything |

**New arrays from old**

| Call | Does |
|---|---|
| `slice(arr, from, to)` | A new array, `from` inclusive, `to` exclusive |
| `copy(arr)` | An independent copy |

**Statistics over the whole array**

| Call | Does |
|---|---|
| `sum(arr)` | Total |
| `avg(arr)` | Mean |
| `min(arr)`, `max(arr)` | Extremes |
| `stdev(arr)` | Standard deviation |

Several of these names also exist in a windowed form over a series, and the
checker picks the right one from the argument types: `sum(prices)` totals an
array, `sum(close, 20)` totals a twenty bar window. One name for one idea, two
shapes, resolved at compile time.

## The errors, and why an index is an error

| Code | When | Note |
|---|---|---|
| OS4004 | An index outside `0` to `size - 1` | The message names the index and the size |
| OS4006 | `pop`, `shift`, `min`, `max` or `avg` on an empty array | Test `size(arr) > 0` first |
| OS4007 | A slice whose bounds are not `0 <= from <= to <= size` | A reversed slice is not read backwards |
| OS5002 | More than 1,000,000 elements | `limits()` does not raise this in version 1 |
| OS2013 | A literal mixing types | Arrays are homogeneous |
| OS2015 | An empty literal with no type | Annotate it |

The interesting one is OS4004, because it is deliberately the opposite of what
the history operator does. `close[500]` on bar 7 is the absent value, not an
error, because that value never existed. `element(arr, 500)` on an array of
seven elements is an error, because the array has an extent the script itself
chose, so an index outside it is a mistake in the script rather than a missing
measurement. Same bracket, two situations, and conflating them would hide one
behind the other.

OS5002 exists so that one runaway script cannot exhaust a browser tab and take
the chart with it. It is almost always the same bug: a window that is appended
to on every bar and never trimmed. The trim is two lines, and the next section
shows them.

## Two lifetimes: the bar and the run

This is the distinction that decides how most array code should be written.

**An array created by a plain assignment is built fresh on every bar.** The file
is the body of the per-bar loop, so the literal runs again, a new array exists,
and last bar's array is gone. That is what you want for scratch work: a sorted
copy, a slice, a set of candidates you rank and throw away.

**An array held in a `var` is created once and lives for the whole run.** The
initialiser runs on the first bar that reaches the declaration, and after that
the name keeps whatever array it holds, with whatever the script has pushed into
it.

| | Plain assignment | `var` |
|---|---|---|
| Created | Every bar | Once |
| Holds | This bar's working values | Everything the run has accumulated |
| Grows without limit | No | Yes, unless you trim it |
| Rolls back on a moving bar | Not applicable, it is rebuilt | Yes, contents included |
| Typical use | Sort, slice, rank, then discard | A rolling window, a set of live objects |

The rollback row matters on a live chart. The newest bar is executed again on
every update, and before each re-execution the engine restores every persistent
value, including the contents of arrays, to what it held at the end of the
previous bar. So a script that pushes one element per bar pushes one element per
bar, not one per tick, and the live chart agrees with the backtest of the same
data. Without that rule, every accumulating study would produce different
numbers in front of a moving market than it produced on history, which would
make the whole exercise pointless.

## A rolling window, worked

Here is both lifetimes in one study. The window persists; the sorted copy does
not.

```
version 1

study("Trimmed mean", overlay = true, precision = 2)

len  = input(20, "Window", min = 5, max = 200)
trim = input(2,  "Values dropped from each end", min = 0, max = 10)

// Lives for the run: one close appended per bar, the oldest dropped. The trim
// is not optional tidiness. Without it this array reaches the element ceiling
// on a long dataset and the study stops with OS5002.
var window: array<number> = []
push(window, close)
if size(window) > len
    shift(window)

// The mean of the window with the extremes removed, which is what needs an
// array at all: a series cannot be sorted.
ready = size(window) == len and trim * 2 < len

middle = none
if ready
    // Rebuilt every bar and thrown away. copy() matters here: sorting the
    // window itself would scramble the order the trim depends on, and the
    // window would stop being a window.
    sorted = copy(window)
    sort(sorted, "asc")
    middle = avg(slice(sorted, trim, len - trim))

plot(middle, "Trimmed mean", aqua, width = 2)
plot(ready ? avg(window) : none, "Plain mean", orange)
```

Three details in that script are worth stealing.

`middle` is declared before the `if` and assigned inside it. A name first
assigned inside a block belongs to that block, so declaring it outside is how a
value computed in a branch is read afterwards. The absent value is the honest
starting point, and it is what the plot draws as a gap during warmup.

`copy(window)` is there because `sort` works in place. Sorting the live window
would destroy the arrival order that `shift` depends on, and the study would
quietly stop being a rolling window while still looking like one.

The trim on `size(window) > len` runs before anything reads the window, so the
window is never larger than the length on any bar that matters.

## Iterating safely

There are two loop forms, and a rule about changing an array while you walk it.

```
total = 0.0
for price in window                 // over the elements
    total += price

for i = 0 to size(window) - 1       // over the indices
    total += element(window, i)
```

The `in` form visits indices `0` to `size - 1` as measured when the loop is
entered. Elements appended during the loop are not visited, and if the array
shrinks past the cursor the loop stops. That is a defined behaviour rather than
a hazard, but it is not a licence to remove elements while iterating forwards.

**When a loop removes elements, count downwards.**

```
// Removing element i renumbers every element after it. Counting down means the
// elements the loop has yet to visit keep their indices, so nothing is skipped.
for i = size(entries) - 1 to 0 step -1
    if element(ages, i) > maxAge
        remove(entries, i)
        remove(ages, i)
```

Going forwards with a removal inside is the classic way to skip every other
match, and it is the kind of bug that only shows up when two neighbours are
removed on the same bar. Writing `step -1` costs one word and makes it
impossible. Note also that a descending `for` must say `step -1`: with a
positive step and an end below the start, the body simply does not run, because
a loop that silently reverses direction is a loop nobody can read.

`break` leaves the innermost loop, `continue` skips to its next iteration, and
every iteration of every loop on a bar counts against the per-bar loop budget of
2,000,000 iterations. A script that genuinely needs more raises it in one line
with `limits(loops = ...)` immediately after its declaration.

## Arrays that come back from a call

A library function with more than one output returns an `array<number>` holding
this bar's outputs in a documented order.

```
version 1

study("MACD", precision = 4)

src    = input(close, "Source")
fast   = input(12, "Fast", min = 1, max = 500)
slow   = input(26, "Slow", min = 2, max = 500)
smooth = input(9,  "Signal", min = 1, max = 500)

// One array per bar, rebuilt every bar, never held in a var.
m = macd(src, fast, slow, smooth)

line = m[0]
sig  = m[1]
hist = m[2]

level(0, "Zero", gray)
plot(line, "MACD", aqua, width = 2)
plot(sig,  "Signal", orange)
plot(hist, "Histogram", hist > 0 ? lime : red, style = "histogram")

// The crossing is read from the named series, which have history because they
// are top-level names. m[1] would be element 1, not one bar ago.
if crossUp(line, sig)
    signal("UP")
```

The returned array is never absent and never changes length. Each element
carries its own warmup and holds the absent value until that warmup completes,
so `m[2]` is a valid read on bar 0 and simply has nothing in it yet.

## Parallel arrays

Version 1 has no record type, so a list of things that each have several fields
is written as several arrays that are kept the same length and indexed together.

```
var zoneTop    : array<number> = []
var zoneBottom : array<number> = []
var zoneStart  : array<number> = []
```

Every operation that adds a zone pushes to all three, and every operation that
removes one removes from all three, at the same index, in the same block. That
discipline is the whole technique, and the moment one array is updated without
the others the script is holding nonsense that no error will catch.

Two notes on this shape. It is the reason a descending removal loop matters so
much, since one missed `remove` silently misaligns every record after it. And it
is the shape a record type will replace when `type` arrives, which is why the
word is already reserved.

## Maps and matrices: what is true today

Being blunt about this is more useful than being encouraging.

| | Status in version 1 |
|---|---|
| `array<T>` | Implemented and specified, everything above |
| `map<K, V>` | A reserved word. No implementation, no annotation you can write, no functions |
| `matrix<T>` | A reserved word. The same |

`map` and `matrix` are reserved words, which means you cannot use them as
variable names either, and trying is OS1019 with a message saying the word is
reserved for a later version rather than a message saying it is unknown.

What is intended, stated so that nobody plans around a different answer:

**`map<K, V>` with `string` and `number` keys, iterating in insertion order.**
Insertion order is not a convenience, it is a requirement: two engines must
produce identical output to the last decimal, and the iteration order of a hash
map is exactly the kind of thing two implementations would disagree about.

**`matrix<T>` as a two-dimensional numeric container**, with element access, row
and column operations, and the small amount of linear algebra that correlation
and regression studies need.

Both arrive with a language version bump, because adding a keyword is a language
version change. Under the compatibility promise, a script that declares
`version 1` keeps being parsed by the version 1 front end and keeps producing
the same numbers forever, so nothing you write today breaks when they land.

Why reserve the words now rather than when the feature is ready? Because
reserving a word costs nothing today and adding one later would break every
script that had used it as a variable name. That is the only way a language can
promise that a saved script never stops working.

## Living without a map

A map is an association from a key to a value. Two parallel arrays and
`indexOf` give you one, and for the handful of keys a chart script actually
uses, the linear search is not the slow part of anything.

```
version 1

study("Counts by day of week", precision = 0)

// Keys and values, kept in step. The keys never change after bar 0, which is
// what makes this cheap: indexOf walks at most seven elements.
var dayNames  = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
var dayUp     : array<number> = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
var dayTotal  : array<number> = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]

// dayOfWeek is 1 for Monday, so the index is one less.
i = date.dayOfWeek(time) - 1

if bar.isConfirmed
    set(dayTotal, i, element(dayTotal, i) + 1)
    if close > open
        set(dayUp, i, element(dayUp, i) + 1)

panel = table("Up share by weekday", 8, 2)

if bar.isLast
    cell(panel, 0, 0, "Day", textColor = white)
    cell(panel, 0, 1, "Up share", textColor = white)
    for row = 0 to 6
        total = element(dayTotal, row)
        share = total > 0 ? element(dayUp, row) / total * 100 : none
        cell(panel, row + 1, 0, element(dayNames, row))
        cell(panel, row + 1, 1, isNone(share) ? "no data" : text(share, 0) + " percent")
```

When the keys are strings the script does not know in advance, the same shape
works with `indexOf`:

```
// Find the key, or add it. The pair of arrays is the map.
slot = indexOf(keys, name)
if slot == -1
    push(keys, name)
    push(values, 1.0)
else
    set(values, slot, element(values, slot) + 1)
```

Keep the number of keys small and bounded. An unbounded key set built from data
is the shape that reaches OS5002, and it is also the shape that will genuinely
want a map when one exists.

## Living without a matrix

A two-dimensional grid is a flat array plus one line of index arithmetic. It is
the same layout a matrix type would use underneath, so nothing is lost but the
notation.

```
version 1

study("Hour by outcome", precision = 0)

hours = 24
cols  = 2                   // column 0 counts up bars, column 1 counts down

// One flat array, read as a grid. row * cols + col is the whole technique, and
// writing it once in a helper keeps the arithmetic in one place.
var grid: array<number> = []
if bar.isFirst
    for k = 0 to hours * cols - 1
        push(grid, 0.0)

fn at(row, col, width) => row * width + col

h = date.hour(time)

if bar.isConfirmed and close != open
    col = close > open ? 0 : 1
    i = at(h, col, cols)
    set(grid, i, element(grid, i) + 1)

// The share of up bars in the hour this bar falls in.
ups   = element(grid, at(h, 0, cols))
downs = element(grid, at(h, 1, cols))
plot(ups + downs > 0 ? ups / (ups + downs) * 100 : none, "Up share this hour", aqua)
level(50, "Even", gray)
```

Note the helper is a pure function with no `var` and no stateful call inside it,
so its several call sites share nothing and it is safe to use anywhere. A helper
that held state would not be, and that distinction is the subject of the
functions page.

## See also

- [functions.md](./functions.md) for why a helper called inside a loop has one
  piece of state, and what to do about it
- [objects-and-methods.md](./objects-and-methods.md) for arrays of drawing
  objects, which is the other place parallel arrays turn up
- [libraries.md](./libraries.md) for moving array helpers out of a script
- [persistence.md](./persistence.md) for `var`, and for the rollback that
  restores an array's contents on a moving bar
- [control-flow.md](./control-flow.md) for the loop forms, `break`, `continue`
  and the per-bar loop budget
- [bars-and-history.md](./bars-and-history.md) for `[]` on a series, which is
  the other meaning of the same bracket
- [types-and-values.md](./types-and-values.md) for `array<T>` among the types
- [../README.md](../README.md) for the documentation index
- [../../spec/language.md](../../spec/language.md) section 14 for the
  specification of arrays, and section 14.2 for maps and matrices
- [../../examples/09-supply-demand-zones.oscript](../../examples/09-supply-demand-zones.oscript)
  for parallel arrays and a descending removal loop in a real study
