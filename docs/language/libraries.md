# Libraries

By the end of this page you can organise a long script so that its reusable
parts are genuinely separable, share a block of functions between scripts
without losing track of which copy is current, and understand exactly what a
library will be when the language grows one, including the rule that a published
version never changes.

## On this page

- [Where the language stands today](#where-the-language-stands-today)
- [One file, organised to be split](#one-file-organised-to-be-split)
- [The test: does the helper need the file?](#the-test-does-the-helper-need-the-file)
- [Sharing a block between scripts today](#sharing-a-block-between-scripts-today)
- [What a library will be](#what-a-library-will-be)
- [What may be exported, and what may not](#what-may-be-exported-and-what-may-not)
- [State crosses the boundary unchanged](#state-crosses-the-boundary-unchanged)
- [Versioning](#versioning)
- [A published version is immutable](#a-published-version-is-immutable)
- [Deprecating instead of removing](#deprecating-instead-of-removing)
- [Designing a library a stranger can rely on](#designing-a-library-a-stranger-can-rely-on)
- [What is decided and what is not](#what-is-decided-and-what-is-not)

## Where the language stands today

Be clear about this before reading further.

| Thing | Status in version 1 |
|---|---|
| One file, one `study()` or `strategy()` declaration | How every script works |
| `fn` at the top level of that file | The only unit of reuse |
| `import` of another file | Reserved word, not implemented |
| `as`, for naming an import | Reserved word, not implemented |
| `type`, for a record a library would hand back | Reserved word, not implemented |

A file carries exactly one declaration, and every function it calls is either in
the standard library or declared in that same file. Writing `import` today is an
error whose message says the word is reserved for a later version, which is a
different message from the one you get for a word that does not exist, and that
difference is deliberate: it tells you the gap is known and named rather than
forgotten.

So this page has two halves. The first is what to do today, which is real work
with a real payoff. The second is the shape a library will take, written down
now so that the way you organise a script today survives it.

## One file, organised to be split

A long script separates naturally into three regions: the declaration and the
inputs, the helpers, and the per-bar body that uses them. Keeping them in that
order, with the helpers in one block, costs nothing and makes the eventual
extraction a matter of moving lines rather than rewriting them.

```
version 1

study("Keltner squeeze", overlay = true, precision = 2)

// Inputs

len     = input(20, "Basis length", min = 2, max = 500)
mult    = input(2,  "Deviation multiple", min = 1, max = 5)
atrLen  = input(10, "ATR length", min = 1, max = 200)
atrMult = input(1.5, "ATR multiple", min = 1, max = 5)

// Helpers
// Everything below takes what it needs as arguments and reads nothing from the
// file scope, so any one of these could move to another file unchanged.

// [basis, upper, lower]. Absent until bar n - 1, the warmup of sma and stdev.
fn deviationBands(src, n, k) =>
    basis = sma(src, n)
    dev   = k * stdev(src, n)
    [basis, basis + dev, basis - dev]

// [basis, upper, lower]. Absent until bar max(n, aLen) - 1.
fn rangeBands(src, n, aLen, k) =>
    basis = ema(src, n)
    dev   = k * atr(aLen)
    [basis, basis + dev, basis - dev]

// True when the first band pair sits entirely inside the second. Absent when
// either pair is still warming up, because a comparison against an absent
// value is absent and that is the honest answer during warmup.
fn inside(a, b) => a[1] < b[1] and a[2] > b[2]

// Body

dev = deviationBands(close, len, mult)
rng = rangeBands(close, len, atrLen, atrMult)

squeezed = inside(dev, rng)

upper = plot(dev[1], "Upper", aqua)
lower = plot(dev[2], "Lower", aqua)
plot(dev[0], "Basis", orange, width = 2)
fill(upper, lower, fade(aqua, 90))

background(squeezed ? fade(yellow, 90) : none)

if squeezed and not squeezed[1]
    signal("SQUEEZE")
```

Everything under the helpers banner could be cut and pasted into another file
with no edits at all, because none of it mentions `len`, `mult`, `atrLen` or
`atrMult`. That is the property to aim for, and the next section is how to check
that you have it.

## The test: does the helper need the file?

Read the body of a helper and ask whether every name in it is a parameter, a
local, or a standard library name. If one is not, the helper belongs to this
file and cannot move.

```
// Two alternatives, not two functions to write in one file: a name may be
// declared once, and a second fn called basis would be OS2017.
len = input(20, "Length", min = 2, max = 500)

// Legal, and stuck here forever. It reads len from the file scope, so it means
// something different in a file where len means something else, and it means
// nothing at all in a file with no len.
fn basis(src) => sma(src, len)

// Movable. Everything it needs arrives through the call.
fn basisOver(src, n) => sma(src, n)
```

The language allows the first form, because a function body is a block scope
nested inside the file scope, and it is sometimes the right thing for a
throwaway helper in a short script. It costs you three things: the function can
no longer be understood from its own text, it cannot be tested on its own, and
it cannot be moved. A parameter costs six characters.

The same test rules out a few other shapes, for reasons that are worth spelling
out rather than discovering:

| A helper that | Cannot move, because |
|---|---|
| Calls `input()` | `input` is top level only, so the call is already illegal inside a function |
| Calls `plot`, or another call [../../spec/language.md](../../spec/language.md) section 15.3 makes top level only | Those are top level only for the same reason: the study's fixed surface is built before bar 0 |
| Calls `signal`, `background` or `barColor` | Legal anywhere, but it now paints the consumer's chart, which is the consumer's decision to make |
| Places an order | Only a `strategy()` file may do that, so the helper has silently made itself untransplantable |
| Reads `chart.symbol` or another instrument fact and branches on it | Movable, but it now behaves differently per chart, which has to be documented rather than discovered |

A helper that computes and returns is portable. A helper that draws or trades is
part of a particular study.

## Sharing a block between scripts today

With no `import`, sharing means copying, and copying means the copies drift. The
discipline that makes that survivable is small.

Keep one canonical copy in a file of its own, even though nothing compiles it
yet, and give the block a header that says what it is and which revision this
copy came from.

```
// bands, revision 4
// Canonical copy: helpers/bands.oscript
// Changed in 4: rangeBands takes the ATR length separately from the basis
// length. A call written for revision 3 passes one length and now gets the
// wrong second band, so check your call sites.

fn deviationBands(src, n, k) =>
    basis = sma(src, n)
    dev   = k * stdev(src, n)
    [basis, basis + dev, basis - dev]
```

Then a consuming script carries the same header, and one look tells you whether
it is behind.

```
version 1

study("Bands on a higher timeframe", overlay = true, precision = 2)

tf   = input("1D", "Timeframe", kind = "interval")
len  = input(20, "Basis length", min = 2, max = 500)
mult = input(2,  "Deviation multiple", min = 1, max = 5)

// bands, revision 4
// Canonical copy: helpers/bands.oscript

fn deviationBands(src, n, k) =>
    basis = sma(src, n)
    dev   = k * stdev(src, n)
    [basis, basis + dev, basis - dev]

// Body

// The whole computation is folded on the coarser bars, in confirmed mode, so
// the value changes only when a higher timeframe bar closes.
upperDaily = req.timeframe(tf, deviationBands(close, len, mult)[1], mode = "confirmed")
lowerDaily = req.timeframe(tf, deviationBands(close, len, mult)[2], mode = "confirmed")

up = plot(upperDaily, "Upper", aqua, style = "step")
dn = plot(lowerDaily, "Lower", aqua, style = "step")
fill(up, dn, fade(aqua, 92))
```

Be honest with yourself about the cost. A copy is a fork: a bug fixed in the
canonical file is not fixed in the six scripts that copied it, and no tool in
the language will tell you. Two habits keep it manageable. Copy blocks that are
small and stable rather than large and evolving, and write the revision in the
header every single time, because a header that is sometimes missing is a header
nobody trusts.

## What a library will be

> Planned. None of the code in this section compiles under version 1. What is
> already fixed is the set of reserved words and the compatibility promise; the
> spelling below is the shape the project intends, written here so that the way
> you organise a script today is the way you will organise it then.

A library is a file with a declaration of its own that exports functions, and a
consumer imports it under a name and calls through that name.

```
// Planned: a library file.

version 1

library("bands", version = "1.2.0")

// Exported: part of the published surface, and therefore bound by every rule
// in the versioning section below.
export fn deviationBands(src: series number, n: number, k: number = 2) =>
    basis = sma(src, n)
    dev   = k * stdev(src, n)
    [basis, basis + dev, basis - dev]

// Not exported: private to the library, free to change in any release.
fn midpoint(a, b) => (a + b) / 2
```

```
// Planned: a consumer.

version 1

study("Bands", overlay = true, precision = 2)

import "bands@1.2.0" as bands

len  = input(20, "Length", min = 2, max = 500)
mult = input(2,  "Deviation multiple", min = 1, max = 5)

b = bands.deviationBands(close, len, mult)

upper = plot(b[1], "Upper", aqua)
lower = plot(b[2], "Lower", aqua)
plot(b[0], "Basis", orange, width = 2)
fill(upper, lower, fade(aqua, 90))
```

Three properties of that sketch are not negotiable, because they follow from
decisions the language has already made.

**The import names the version.** A consumer that did not pin a version would
have its numbers changed by somebody else's edit, which is the thing this whole
design exists to prevent.

**The import binds a name, and calls go through it.** `bands.deviationBands` is
a namespace member, the same shape as `math.pi` and `session.isOpen`, so the
language needs no new meaning for the dot. It also means two libraries may
export the same function name without colliding, and a reader can see which
library a line depends on without scrolling to the imports.

**A library file has its own declaration.** A file carries exactly one, and a
library is not a study: it declares no inputs, plots nothing and trades nothing.
A third declaration form is how that is said, rather than a `study()` that
behaves differently depending on whether anyone imported it.

## What may be exported, and what may not

| Exportable | Why |
|---|---|
| A function | The unit of reuse, and the only thing a consumer can call |
| A function returning several values as an `array<number>` | Already the convention throughout the standard library |
| A constant expressed as a zero-argument function | Nothing else in the language can carry a value across a file boundary |

| Not exportable | Why not |
|---|---|
| An `input()` | Inputs build the settings dialog of a study, before bar 0. A library that added rows to a dialog it does not own would make the consumer's settings unpredictable from the consumer's own source |
| A `plot`, or another drawing call [../../spec/language.md](../../spec/language.md) section 15.3 makes top level only | The fixed surface belongs to the consuming study: its legend, its axis, its saved layout |
| An order | Only a strategy trades, and a library that placed orders would be trading somebody else's account from a file they did not read |
| A file-scope `var` | Shared mutable state between unrelated consumers would make one script's numbers depend on whether another script happened to run first, which no engine could reproduce |

The line through all four is the same: a library computes, and the consumer
decides what to do with the answer. That is what makes a library safe to import
by reading its signature rather than its body.

## State crosses the boundary unchanged

A library function may hold `var`, and may call stateful library functions like
`ema` or `cum`. The rule for where that state lives does not change when the
function moves into a library: **state is allocated per call site, in the
consumer.**

So a consumer that calls `bands.trailingStop(...)` in two places has two
independent trailing stops, and two different studies on the same chart have
their own again. A library author can therefore write a stateful helper without
asking who else is calling it, and a consumer can call one twice without the two
calls interfering. This is the same rule as for a local `fn`, and the functions
page explains what it costs and what it makes possible.

Two things follow for a library author. Never document a function as though
there is one of it: if it counts something, it counts per call site. And never
build a function whose correctness depends on being called exactly once per bar,
because a consumer will call it inside a branch, the state will advance only on
the bars that branch runs, and the result will be absent on the rest.

## Versioning

A library version is a promise about what a consumer's numbers will do. The
promise is the same one the language makes about itself: a script that compiled
and produced a number keeps compiling and producing that number.

| Change | Version part to raise | Why |
|---|---|---|
| Add a new exported function | Minor | Nothing a consumer already calls has moved |
| Add an optional parameter, with a default, at the end | Minor | Every existing call means exactly what it meant |
| Improve the implementation with identical output | Patch | Nothing observable changed |
| Fix a comment, a tooltip or documentation | Patch | The same |
| Add a required parameter | Major | Every existing call breaks at compile time |
| Reorder parameters | Major | Positional calls keep compiling and silently change meaning, which is the worst outcome available |
| Rename a parameter | Major | Named calls break |
| Change a default value | Major | A call that was written to rely on the default changes its numbers with no edit |
| Change the arithmetic so a result differs | Major | A chart that redraws itself after an update is worse than a chart that is slightly wrong in a documented way |
| Change a warmup length | Major | The consumer's plot starts on a different bar, and any script that guarded on absence changes behaviour |
| Remove a function | Never | Deprecate it instead; see below |

Note how much of that table is about changes that keep compiling. A change that
breaks the build is annoying for an afternoon. A change that compiles and moves
the numbers is a strategy that traded differently and nobody knew why, which is
why reordering a parameter and changing a default are treated as severely as
removing a function.

## A published version is immutable

**Once a library version is published, its contents never change. To change
anything, publish a new version.**

This is the rule the whole design rests on, so it is worth being explicit about
why, because at first it looks like unnecessary ceremony for a one character
typo fix.

A backtest is only evidence if it can be run again. The project already promises
that a chart, a backtest run and a running strategy each pin the script revision
they started with, and that editing a script does not silently change a study on
a chart or a strategy holding a position. A library version that could be edited
after publication would drive a hole straight through that promise: the same
pinned revision would produce different numbers on Tuesday than it produced on
Monday, with nothing in the consumer's own history to explain it.

It also protects the thing that makes the language a standard rather than a
product. Two engines must agree to the last decimal on the same compiled
program, and a compiled program records the versions it was built against. If a
version could change underneath, agreement between engines would mean only that
they were both compiled on the same day.

And it protects a reader. A consumer who pinned `1.2.0` reviewed `1.2.0`. They
can go on trusting that review for as long as the pin stands, and the moment
they raise the pin, that is a change in their own file, in their own version
control, visible in a diff, which is exactly where a change of this consequence
belongs.

The practical consequences:

- Publishing is one way. There is no edit, and a correction is a new version.
- Withdrawing a version may mark it as unsafe, but it does not alter it, because
  something in production may be pinned to it and stopping it dead is not an
  improvement on leaving it working.
- A version number is a name, not a ranking. `1.2.1` does not replace `1.2.0`;
  it sits beside it, and a consumer moves when the consumer decides to.

## Deprecating instead of removing

The language never removes a construct that turns out to be a mistake. It keeps
working, the compiler emits a warning naming the replacement, and it is still
there several versions later. A library should behave the same way.

```
// Planned.

// Deprecated in 2.1.0. Use bandsWithSource, which takes the source explicitly
// instead of assuming close. This function keeps working and keeps returning
// the numbers it always returned.
export fn bands(n, k) => bandsWithSource(close, n, k)
```

The old function stays, and it is implemented in terms of the new one so the two
cannot drift apart. A consumer sees a warning, moves when they have time, and
nothing of theirs breaks on a day they were not expecting to work on it.

The alternative, deleting a function in a new major version, sounds tidy and
means that every consumer has to do work on your schedule rather than theirs.
For a trading script, that work happens on a live strategy, which is the worst
possible moment to be editing anything.

## Designing a library a stranger can rely on

| Do | Because |
|---|---|
| One concern per library | A consumer imports what they use, and a version bump touches the scripts it actually affects |
| Annotate every exported parameter | The signature is all a consumer reads before calling |
| State each function's warmup in a comment above it | The consumer's plot starts where your warmup says, and "after a while" is not an answer they can code against |
| State what the function does with an absent input | Absence propagates by default; if yours does something else, that is news |
| Return several values as one `array<number>` with a documented order | Three functions would be three call sites and would compute the shared work three times |
| Keep the exported surface small | Everything exported is a promise you are making for years |
| Write example call sites in a comment | They double as the tests you will want when you change the implementation |

| Do not | Because |
|---|---|
| Read the chart's instrument facts silently | The function behaves differently per chart and the consumer cannot see why |
| Draw, paint, signal or alert | That is the consumer's surface, and their decision |
| Keep state that assumes one caller | A call site can be anywhere, including inside a loop and inside a branch |
| Use a name a consumer is likely to want | An import binds a namespace, so your names are safe; the ones inside your own file still are not |

## What is decided and what is not

| Decided | Where |
|---|---|
| `import`, `as` and `type` are reserved words in version 1, so using one as a name is an error today and adding the feature later cannot break your script | The reserved word list in the language specification |
| A script that compiles under version 1 keeps compiling and keeps producing the same numbers | The compatibility promise |
| A bug fix that changes a number is a version change, not a patch | The same promise |
| A construct that turns out to be a mistake is deprecated, never removed | The same promise |
| State is allocated per call site, which is what makes a stateful helper reusable | The functions section of the language specification |

| Not decided | Note |
|---|---|
| The spelling of the library declaration, the export keyword and the import statement | The sketches above are intent, not specification |
| How a library is identified and where a host looks for one | A file path, a name and a version, or both |
| Whether a library may export a type once `type` exists | It is the obvious next question and it is open |

Write your helpers to take parameters and return values, keep them in one block
with a header, and none of the open questions above can cost you a rewrite.

## See also

- [functions.md](./functions.md) for the function rules a library inherits,
  including per-call-site state
- [collections.md](./collections.md) for returning several values as an array,
  which is how a library function hands back more than one number
- [objects-and-methods.md](./objects-and-methods.md) for why a helper that draws
  belongs to a study rather than to a library
- [warmup.md](./warmup.md) for the warmup lengths a library function has to
  document, and why "after a while" is not one
- [variables-and-scope.md](./variables-and-scope.md) for the scope rules that
  decide whether a helper can move
- [execution-model.md](./execution-model.md) for what runs once and what runs
  per bar, which is why an input cannot be exported
- [../README.md](../README.md) for the documentation index
- [../../spec/language.md](../../spec/language.md) section 4.1 for the
  compatibility promise, and section 18 for what is reserved
- [../../ROADMAP.md](../../ROADMAP.md) for the promises that hold from version 1
