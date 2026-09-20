# Objects and methods

By the end of this page you can create a line, a label, a box, a polyline or a
table, change it on a later bar, keep track of the ones you created, and decide
when an object should be deleted rather than left to pile up.

Everything else a script draws is a column of one value per bar, declared before
bar 0 and filled in as the bars arrive. An object is different: it is created at
a moment the script chooses, it stays where it was put, and the script can move
it, restyle it or delete it any number of bars later.

## On this page

- [An object is not a plot](#an-object-is-not-a-plot)
- [The four drawing objects](#the-four-drawing-objects)
- [Anchors are a time and a price](#anchors-are-a-time-and-a-price)
- [There is no method syntax, and why](#there-is-no-method-syntax-and-why)
- [Every mutation call](#every-mutation-call)
- [Handles](#handles)
- [Lifetime](#lifetime)
- [One object that follows the chart](#one-object-that-follows-the-chart)
- [A capped set of objects](#a-capped-set-of-objects)
- [Deleting, and the stale handle](#deleting-and-the-stale-handle)
- [When to delete](#when-to-delete)
- [Objects cannot be read back](#objects-cannot-be-read-back)
- [Tables](#tables)
- [The errors you will meet](#the-errors-you-will-meet)

## An object is not a plot

| | A plot | An object |
|---|---|---|
| Declared | Once, at the top level, before bar 0 | On any bar, anywhere in the script |
| Shape | One value per bar, forever | Two points, or one point, or a path |
| Changed later | No; you give it a new value each bar | Yes; move it, restyle it, retext it |
| Hidden | By giving it the absent value | By deleting it |
| Removed | Never | By `draw.delete`, and only by that |

The split exists because the two are used for different things. A legend, a
price axis and a settings dialog have to exist before the first bar runs, so the
set of plotted columns is fixed at compile time and wrapping a `plot` in an `if`
is OS3006. Geometry has no such constraint: a trendline between two swing points
is not a column of numbers, and nothing about the chart needs to know in advance
how many of them there will be.

So: a value per bar is a plot, and a thing with a position is an object.

## The four drawing objects

| Call | Makes | For |
|---|---|---|
| `draw.line(t1, p1, t2, p2, color = gray, width = 1, style = "solid", extendLeft = false, extendRight = false)` | a `line` | A trendline, a level, a ray |
| `draw.label(t, p, text, color = none, textColor = white, align = "center", tooltip = "")` | a `label` | A plate of text at a point |
| `draw.box(t1, p1, t2, p2, color = none, fillColor = none, opacity = 0.12, width = 1, text = "", textColor = white, tooltip = "")` | a `box` | A zone: supply, demand, an opening range |
| `draw.polyline(times, prices, color = gray, width = 1, closed = false, fillColor = none, opacity = 0.12)` | a `polyline` | A path or a closed shape through many points |

`draw.polyline` takes two parallel arrays, one of times and one of prices,
rather than one array of points, because version 1 has no record type to make a
point out of. It gets its natural shape when `type` arrives, and the word is
already reserved so that adding it cannot break your script.

## Anchors are a time and a price

Every object is positioned by a timestamp and a price, never by a bar index.

That is a rule about correctness, not about taste. `bar.index` is a position
inside the data the engine happened to be given, so loading more history
renumbers every bar and drags anything anchored to an index sideways across the
chart. A bar's `time` does not move. The compiler warns about the same mistake
in a different place: storing `bar.index` in a `var` is OS8014, with the fix
naming `time`.

```
// The pivot is only knowable rightBars bars after it happened, so its anchor is
// the time of the bar it happened on, not the time of the bar we are on now.
draw.label(time[rightBars], high[rightBars], "Swing high", color = red)
```

Subtracting two bar indices inside one run is still fine, because both came from
the same numbering: `bar.index - element(zoneBar, i)` is a real count of bars.
It is storing one and comparing it later that breaks.

## There is no method syntax, and why

The calls read verb first, with the object as the first argument:

```
draw.setText(zone, "Demand, 14 bars old")
draw.setColor(zone, lime)
draw.delete(zone)
```

There is no `zone.setText(...)`. The dot in `draw.setText` is not a method call:
`draw` is a namespace, and `setText` is a name inside it, exactly as `math.pi`
and `session.isOpen` are names inside theirs. The language has one meaning for
`a.b`, and it is "the member `b` of the namespace `a`".

The reason is that version 1 has nothing a method could be built out of. There
is no `type` keyword, so a value has no fields; there are no function values, so
nothing can be attached to a value; and both words are reserved rather than
implemented. Adding a second meaning for the dot before those exist would be a
grammar that had to be unlearned later. Verb-first also puts the interesting
word at the start of the line, which is what you scan for when reading somebody
else's study.

## Every mutation call

| Call | Applies to | Does |
|---|---|---|
| `draw.setFrom(obj, t, p)` | line, box | Move the first anchor |
| `draw.setTo(obj, t, p)` | line, box | Move the second anchor |
| `draw.setBounds(obj, t1, p1, t2, p2)` | line, box | Move both in one call |
| `draw.setAt(label, t, p)` | label | Move a label |
| `draw.setPoints(polyline, times, prices)` | polyline | Replace the path |
| `draw.setText(obj, text)` | label, box | Change the caption |
| `draw.setColor(obj, color)` | all | Change the line or border colour |
| `draw.setTextColor(obj, color)` | label, box | Change the text colour |
| `draw.setFillColor(obj, color)` | box, polyline | Change the fill |
| `draw.setWidth(obj, width)` | line, box, polyline | Change the thickness |
| `draw.setStyle(obj, style)` | line, box | `"solid"`, `"dashed"` or `"dotted"` |
| `draw.setExtend(line, left, right)` | line | Continue the line to the pane edge |
| `draw.setTooltip(obj, text)` | all | Detail shown while the pointer rests on it |
| `draw.delete(obj)` | all | Remove one object |
| `draw.deleteAll()` | all | Remove every object this script created |
| `draw.count()` | n/a | How many objects this script currently holds |

Every one of these may appear anywhere in a script: inside an `if`, inside a
loop, inside a function. They are per-bar events, not declarations.

## Handles

A creation call returns a handle. The handle is an ordinary value: it can be
assigned, kept in a `var`, pushed into an array and passed to a function. That
is what lets a script come back to an object on a later bar.

```
var zone = none
zone = draw.box(t1, p1, t2, p2)
push(liveZones, zone)
```

Two handles in the language are not like that, and it is worth knowing which:

| Handle | From | Lives | Notes |
|---|---|---|---|
| `line`, `label`, `box`, `polyline` | the `draw` namespace | Until you delete it | An ordinary value: store it, pass it, put it in an array |
| `plot` | `plot(...)` | For the whole run | A compile-time value. It cannot be stored in a `var` or passed to a function; it exists so `fill` can name two columns |
| `table` | `table(...)` | For the whole run | Declared at the top level like a plot; `cell` and `clear` name it |

The absent value is the natural "no object yet" for a drawing handle, and
`isNone(handle)` is the test. That pairing does real work in the sections below.

## Lifetime

**An object persists until the script deletes it.** Not until the next bar, not
until the chart is scrolled. The language fixes no number for how many a script
may hold at once; the budget is the host's memory, and a host that cannot hold
another one has to say so, with OS5010, rather than quietly dropping the
oldest.

That is a deliberate choice. A limit that silently discards your oldest drawing
produces a study that is correct on a short chart and wrong on a long one, in a
way the source does not show, and the only way to discover it is to notice
something missing. The cost of the choice is that housekeeping is now your job,
which is what the rest of this page is about.

One piece of housekeeping is done for you. The newest bar of a live chart is
executed again on every update, and the rollback rule restores the object set to
what it was at the end of the previous bar before each re-execution. So a script
that creates one line per bar creates one line per bar, not one per tick, and a
live chart does not slowly fill with duplicates.

## One object that follows the chart

The most common object script is not a set of objects at all. It is one object,
created once and moved every bar.

```
version 1

study("Price tag", overlay = true, precision = 2)

atrLen = input(14, "ATR length", min = 1, max = 200)

spread = atr(atrLen)

var tag = none

// Created once. Creating it on every bar instead would leave fifty thousand
// labels on the chart, all but one of them behind the visible window.
if bar.isFirst
    tag = draw.label(time, close, "", color = fade(black, 20), textColor = white)

// Moved and rewritten every bar. The guard is not ceremony: on any bar where
// the handle is absent, every call below would be a mistake.
if not isNone(tag)
    draw.setAt(tag, time, close)
    reading = isNone(spread) ? "warming up" : text(spread, 2)
    draw.setText(tag, text(close, 2) + "  ATR " + reading)
    draw.setTextColor(tag, close > open ? lime : red)
```

Note the string. There is no implicit conversion in the language, so
`"ATR " + spread` is OS2003 and the number has to go through `text()`. And
`text()` never produces the absent value: a reading that is still warming up
comes back as the literal word "none", which on a chart is worse than useless.
Deciding what an absent reading looks like is the script's job, and the ternary
is where that decision is written down.

## A capped set of objects

When a study draws one object per event, the script owns the cap. An array of
handles plus one trim is the whole pattern.

```
version 1

study("Breakout rays", overlay = true, precision = 2)

len  = input(20, "Lookback", min = 2, max = 500)
keep = input(5,  "Rays kept", min = 1, max = 50)

// The prior window's high, read one bar back so that this bar's own high
// cannot be part of the level it is breaking.
priorHigh = highest(high, len)[1]
broke = close > priorHigh

// An array of handles. The element type comes from the first push.
var rays = []

if broke
    ray = draw.line(time, priorHigh, time, priorHigh, aqua, 1)
    draw.setExtend(ray, false, true)
    draw.setTooltip(ray, "Broke " + text(priorHigh, 2))
    push(rays, ray)

// Oldest first, because shift takes from the front. Deleting the object and
// removing the handle happen in one statement so they cannot drift apart.
while size(rays) > keep
    draw.delete(shift(rays))

plot(priorHigh, "Prior high", gray, style = "step")
```

Two details make this safe. The trim runs on every bar, not only on the bars
that created something, so a change to `keep` in the settings dialog takes
effect immediately. And `draw.delete(shift(rays))` deletes exactly the handle it
removes, which is the shape to copy: a delete in one place and a remove in
another is how a script ends up holding handles to objects that are gone.

## Deleting, and the stale handle

A handle outlives the object it names. Deleting the object does not clear the
variable, and using a handle after its object is gone is OS4005, with a message
naming the bar the object was deleted on.

Here is the shape, complete, with the guard in place.

```
version 1

study("One live zone", overlay = true, precision = 2)

leftBars  = input(5, "Pivot left bars",  min = 1, max = 50)
rightBars = input(5, "Pivot right bars", min = 1, max = 50)

// A pivot is reported rightBars bars after the bar it formed on, which is the
// first bar on which it could honestly be known.
pivot = pivotLow(low, leftBars, rightBars)

var zone       = none
var zoneBottom = none

// A new pivot replaces the old zone. Nothing deletes the old object for you, so
// the script does it before it loses the handle by overwriting it.
if not isNone(pivot)
    if not isNone(zone)
        draw.delete(zone)
    zoneTop    = min(open[rightBars], close[rightBars])
    zoneBottom = low[rightBars]
    zone = draw.box(time[rightBars], zoneTop, time, zoneBottom,
                    color = lime, fillColor = fade(lime, 85), text = "Demand")

// Price closed through it, so the zone is finished. Delete the object and
// forget the handle in the same block. Forgetting only one of the two is the
// bug this section is about.
if not isNone(zone) and close < zoneBottom
    draw.delete(zone)
    zone = none
    zoneBottom = none

// Still alive, so stretch its right edge to this bar. setTo moves the second
// anchor only, which leaves the left edge where the pivot put it.
if not isNone(zone)
    draw.setTo(zone, time, zoneBottom)
```

Take out the two lines that set `zone` back to the absent value and the study
compiles, draws correctly for a while, and then stops with OS4005 on the first
bar after a zone is broken, because `draw.setTo` is being handed a box that no
longer exists.

Why is that an error rather than a call that quietly does nothing? Because a
script mutating a deleted object has lost track of its own state, and it will go
on losing track. The silent version of this bug is a study that appears to work
while half its drawing calls land nowhere, and no chart will ever tell you.

| Wrong | Right |
|---|---|
| `draw.delete(zone)` and leave `zone` holding the handle | `draw.delete(zone)` then `zone = none` |
| Guard with `zone != 0` or a separate bool | Guard with `isNone(zone)`, which is the language's own test |
| Delete in one branch, remove the handle in another | Do both in the same block |

## When to delete

| Situation | Do |
|---|---|
| The object describes a condition that has ended | Delete it on the bar the condition ends, and clear the handle |
| The object is old enough to be noise | Keep the creation bar or time alongside the handle and delete on age |
| The study draws one object per event | Cap the count, delete oldest first |
| The whole picture is a function of the current state and is cheap | `draw.deleteAll()` and redraw, but only on `bar.isLast` |
| The object is the study's entire output and every one still means something | Keep it, and say so in a comment |

The rebuild pattern deserves a word of warning. `draw.deleteAll()` followed by a
redraw is the simplest correct thing when a study shows the present state rather
than a history, but doing it on every bar means fifty thousand rebuilds to
display the last one. Guard it with `bar.isLast` and the cost disappears, and
the rollback rule keeps it honest while the newest bar is still moving.

`draw.count()` tells you how many objects the script is holding right now. It is
worth putting in a table cell while you are developing a drawing-heavy study,
because the number climbing forever is the symptom of every bug on this page.

## Objects cannot be read back

A drawing object can be written to and deleted. There is no call that asks a box
where its edges are, or a label what its text says.

So a script that needs to reason about what it drew has to remember it: an array
of handles, and one array per fact about them, all indexed together.

```
var zones      = []                 // handles
var zoneTop    : array<number> = []
var zoneBottom : array<number> = []
var zoneBar    : array<number> = []
```

That is the parallel array technique from the collections page, and here it is
not a style choice but the only option. Two consequences worth planning for: a
removal loop over these must count downwards, so that removing one record cannot
renumber a record the loop has yet to visit, and every add and every remove must
touch all four arrays in the same block.

This is a known gap rather than a settled design. The specification records that
these objects are, for now, write only, and that the alternative, adding reads,
is still open. Write your scripts so the answer does not matter: keep the facts
you need in your own arrays, and treat the object as a picture of them.

## Tables

A table is the other object a script creates, and it behaves differently on
purpose.

```
version 1

study("Session panel", overlay = true, precision = 2)

// Declared at the top level, before bar 0, like a plot: the pane has to know
// what it is reserving room for before any data arrives.
panel = table("Session", 3, 2, position = "topRight", textColor = silver)

spread = atr(14)
opened = session.isOpen

// Written only on the newest bar. The panel shows one state, the current one,
// so writing it on every bar would be fifty thousand writes to display the
// last of them. Rollback makes this safe while the bar is still moving.
if bar.isLast
    cell(panel, 0, 0, "Symbol")
    cell(panel, 0, 1, chart.symbol, textColor = white)
    cell(panel, 1, 0, "ATR 14")
    cell(panel, 1, 1, isNone(spread) ? "warming up" : text(spread, 2))
    cell(panel, 2, 0, "Session")
    cell(panel, 2, 1, opened ? "open" : "closed",
         textColor = opened ? lime : gray)
```

`table` is top level only, for the same reason `plot` is. `cell` and `clear` may
appear anywhere. A cell reference outside the declared rows and columns is
OS4008, which names the grid's size, and `clear(panel)` empties every cell so a
table can be rebuilt from scratch.

There is no `draw.delete` for a table. It is a fixed surface of the study, like
a plot, and it lives as long as the study does.

## The errors you will meet

| Code | Means | Usual fix |
|---|---|---|
| OS4005 | A setter was given an object that was deleted | Set the handle to the absent value when you delete, and guard with `isNone` |
| OS4008 | A cell outside the table | Declare the table with enough rows and columns, or clamp the index |
| OS3006 | `plot`, `fill`, `level` or `table` inside a block | Move it to the top level; hide a plot by plotting the absent value |
| OS8014 | A persistent value holds a bar index | Store `time` instead; indices shift when history loads |
| OS5002 | An array of handles grew past the element ceiling | Cap it, and delete the objects as you drop the handles |

## See also

- [collections.md](./collections.md) for arrays of handles, parallel arrays and
  the descending removal loop
- [functions.md](./functions.md) for why a helper that creates objects behaves
  the same at every call site, and where its state lives
- [libraries.md](./libraries.md) for what a drawing helper has to look like
  before it can be shared
- [realtime-and-confirmation.md](./realtime-and-confirmation.md) for the
  rollback rule that stops a live chart filling with duplicate objects
- [bars-and-history.md](./bars-and-history.md) for why an anchor is a time and
  never a bar index
- [absent-values.md](./absent-values.md) for the absent value, which is how a
  handle says "no object yet"
- [../README.md](../README.md) for the documentation index
- [../../spec/stdlib.md](../../spec/stdlib.md) section 14 for the drawing and
  output calls, with every argument
- [../../examples/09-supply-demand-zones.oscript](../../examples/09-supply-demand-zones.oscript)
  for objects created, mutated and deleted over hundreds of bars
