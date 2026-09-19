# OpenScript compiled program specification

Version of this document: draft, tracking compiled format version 1.0 and language
version 1.

This document defines the **compiled program**: the plain data structure an
OpenScript compiler emits and an engine executes. It is the contract that lets a
second engine exist. Someone who has never seen our implementation must be able to
write a conforming engine, in a language of their choosing, from this document,
`language.md` and the library manifest alone.

A compiled program is data. It is never code in any host language, it contains no
expressions to be interpreted by a host compiler, and an engine never calls `eval`,
never builds a function from text and never loads generated source. An engine is a
loop over an instruction list.

Two engines that both pass the conformance suite must produce identical output for
identical input, to the last decimal. An unspecified corner is a defect in this
document, not a licence for an engine to choose.

## Contents

1. [How to read this document](#1-how-to-read-this-document)
2. [The shape of a compiled program](#2-the-shape-of-a-compiled-program)
3. [The machine](#3-the-machine)
4. [The instruction set](#4-the-instruction-set)
5. [Per-bar execution](#5-per-bar-execution)
6. [State, checkpoints, rollback and replay](#6-state-checkpoints-rollback-and-replay)
7. [Warmup and the absent value](#7-warmup-and-the-absent-value)
8. [Determinism](#8-determinism)
9. [Versioning and compatibility](#9-versioning-and-compatibility)
10. [Errors an engine raises](#10-errors-an-engine-raises)
11. [Becoming a chart](#11-becoming-a-chart)
12. [A worked example](#12-a-worked-example)
13. [Conformance checklist](#13-conformance-checklist)

---

## 1. How to read this document

**Must, may, never.** "Must" is a requirement on a conforming engine or a
conforming compiler. "May" marks a genuine choice, and every use of it says what
the choice may not change. "Never" is a prohibition.

**Compiler and engine.** The **compiler** turns source text into a compiled
program. The **engine** loads a compiled program and runs it over bars. The
**host** supplies bars, instrument facts, settings, a drawing surface and an order
route. Nothing in this document requires the compiler and the engine to be written
by the same people or in the same language, which is the point of it.

**Encoding.** The canonical encoding of a compiled program is a text document in
the object notation described in section 2.14. An engine may hold the program in
memory in any form it likes once it has read it. Where this document shows a
structure, it shows the canonical encoding.

**Field tables.** Every field table gives the field name, its type, whether it is
required, and what it means. A field typed `T?` may be null. A required field that
is missing makes the program invalid, and an invalid program is refused at load
time (section 3.5), never half executed.

**Error codes.** An engine reports a failure with a stable code, as `language.md`
requires. Section 10 lists every code this document uses and marks the ones it
introduces to the catalogue. `errors.md` is authoritative; if a code here disagrees
with the catalogue, the catalogue wins and this document is wrong.

**Examples.** Every instruction carries a source fragment and the instructions it
compiles to. Instruction indices in an example are relative to the start of that
fragment unless the example says otherwise.

---

## 2. The shape of a compiled program

A compiled program is one object with the fields below, in this order in the
canonical encoding. Everything else in this section defines one of them.

| Field | Type | Required | Holds |
|---|---|---|---|
| `openscript` | object | yes | Format version and language version, section 2.1 |
| `requires` | array of string | yes | Capability tags the engine must have, section 2.2 |
| `compiler` | object | yes | Who emitted this, for a bug report. Never read by the engine |
| `source` | object | yes | Source hash, line count, optional file name |
| `meta` | object | yes | The declaration: study or strategy and its options, section 2.3 |
| `limits` | object | yes | Loop budget and retained history depth, section 2.4 |
| `lib` | object | yes | The library functions this program calls, section 2.5 |
| `inputs` | array | yes | Declared inputs, section 2.6 |
| `channels` | array | yes | Per-bar output channels, section 2.7 |
| `outputs` | object | yes | Plots, fills, levels, markers, tables, alerts, paint, section 2.8 |
| `consts` | array | yes | The constant pool, section 2.9 |
| `series` | array | yes | Series registers, section 2.10 |
| `frame` | object | yes | Slot count of the top-level frame, section 2.11 |
| `cells` | array | yes | Persistent value cells, section 2.11 |
| `states` | array | yes | Library state regions, section 2.11 |
| `functions` | array | yes | User function bodies, section 2.12 |
| `callSites` | array | yes | One entry per user function call path, section 2.12 |
| `loops` | array | yes | One entry per loop, section 2.13 |
| `code` | array | yes | The per-bar instruction list, section 2.14 |
| `debug` | object | yes | Source positions and names, section 2.15 |

An empty table is written as an empty array, never omitted. A program with no user
functions carries `"functions": []`. Uniform presence costs three characters and
removes a whole class of "is it missing or is it empty" from every engine.

### 2.1 openscript

```json
"openscript": { "format": "1.0", "language": 1 }
```

| Field | Type | Means |
|---|---|---|
| `format` | string | The compiled format version, `major.minor`, section 9 |
| `language` | number | The language version the source declared or defaulted to |

`format` governs the structure of this document: the instruction set, the field
names, the encoding. `language` governs meaning: which front end parsed the source,
and which version of the standard library's behaviour the engine must apply. They
move independently, because a format change that adds a field has nothing to do
with a library function that was computing a number slightly wrong.

**An engine must select library semantics by `language`, not by the newest it
implements.** An engine that has both version 1 and version 2 of a function runs
version 1 for a program that says `"language": 1`, forever. That is how
`language.md` section 4.1 is kept: a saved script never changes its numbers.

### 2.2 requires

```json
"requires": ["core.1", "arrays", "orders"]
```

A list of capability tags. At load time the engine compares the list against its
own capabilities and refuses the program, naming the first tag it does not have, if
any is absent (OS6003).

Tags are the real compatibility mechanism, and the version number is the coarse
one. A version number says how new a program is; a tag says what it actually needs.
An engine that implements everything except order placement can run every study
ever written and refuses exactly the strategies, with a message that says which
capability it lacks rather than "too new".

The tags defined in format 1.0:

| Tag | Required when the program |
|---|---|
| `core.1` | Always. The instruction set of section 4 |
| `arrays` | Uses the `ARRAY` or `ELEM` instruction, or any array library function |
| `functions` | Declares a user function |
| `loops` | Contains a loop |
| `orders` | Is a strategy that places, modifies or cancels an order |
| `objects` | Creates a line, label, box or polyline object |
| `tables` | Declares a table |
| `alerts` | Declares an alert |
| `req.timeframe` | Reads a higher timeframe |
| `req.instrument` | Reads another instrument |

A compiler must emit every tag the program needs and must not emit a tag it does
not need, because a spurious tag turns an engine that could have run the program
into an engine that refuses it.

### 2.3 meta

The declaration statement, evaluated at compile time. Every option value here is a
compile-time constant, by `language.md` section 13.2, so nothing in this object can
depend on a bar.

| Field | Type | Default | Means |
|---|---|---|---|
| `kind` | string | required | `"study"` or `"strategy"` |
| `title` | string | required | Legend and picker name |
| `short` | string | `title` | Shorter legend name |
| `overlay` | bool | `false` | Draw on the price pane |
| `precision` | number | `4` | Decimals on this study's axis and legend, 0 to 10 |
| `format` | string | `"price"` | `"price"`, `"percent"` or `"volume"` |
| `range` | array? | `null` | `[min, max]` fixed pane scale |
| `scale` | string | `"right"` | `"right"`, `"left"` or `"none"` |
| `group` | string | `""` | Category in a picker |
| `onUnconfirmed` | bool | `false` | Allow deferred effects on a moving bar, section 5.4 |

When `kind` is `"strategy"`, `meta` also carries the trading options of
`language.md` section 13.3, under a `strategy` sub-object:

```json
"strategy": {
  "capital": 100000, "currency": "", "qty": 1, "qtyType": "units",
  "product": "intraday", "fillOn": "nextOpen", "slippage": 0,
  "commission": 0, "commissionType": "perTrade",
  "pyramiding": 1, "closeOnSessionEnd": false
}
```

A study program carries no `strategy` object. The compiler writes every option with
its effective value, defaults included, rather than omitting the ones the script
left out. An engine therefore never needs a table of defaults, and a default that
changes in a later language version cannot silently change an old program, because
the old program carries the old value in writing.

### 2.4 limits

```json
"limits": { "loops": 2000000, "history": null }
```

| Field | Type | Means |
|---|---|---|
| `loops` | number | Loop iterations allowed per bar, section 5.5 |
| `history` | number? | Retained series depth in bars, or `null` for unbounded |

Both come from the script's `limits()` statement or from the language defaults.
`history: null` means the engine retains every bar it has been given, which is the
default, and makes OS4002 unreachable.

A host may refuse to run a program whose `limits` exceed what it is willing to
spend. It refuses at load time with OS5003, naming the limit and the value it
allows. It must not silently cap the value, because a program that quietly gets a
smaller budget than it asked for produces a wrong number instead of a message.

### 2.5 lib

```json
"lib": {
  "manifest": 1,
  "functions": [
    { "name": "sma", "arity": 2, "state": true, "effect": "none" },
    { "name": "buy", "arity": 4, "state": false, "effect": "order" }
  ]
}
```

| Field | Type | Means |
|---|---|---|
| `manifest` | number | The library manifest version, tied to `openscript.language` |
| `functions` | array | Every library function this program calls, in first-use order |

A function entry:

| Field | Type | Means |
|---|---|---|
| `name` | string | The manifest name, including any namespace, as in `math.round` |
| `arity` | number | Argument count after defaults are filled, section 4.9 |
| `state` | bool | The function holds per-call-site state |
| `effect` | string | `"none"`, `"signal"`, `"order"`, `"draw"` or `"log"`, section 5.4 |

The `CALL_LIB` instruction names a function by its index in this array, so a
program's own table is the only name resolution an engine does, once, at load.

At load the engine checks every entry against its manifest: the name must exist,
the arity must match, and `state` and `effect` must agree with the manifest. A
mismatch is OS6004. This catches a program compiled against a newer library before
it computes a single wrong number, and it is why the entries carry facts the engine
already knows: they are there to be disagreed with.

### 2.6 inputs

One entry per `input()` call, in source order. Each input owns a slot in the
top-level frame, and the engine writes the effective value into that slot at the
start of every bar (section 5.1).

| Field | Type | Means |
|---|---|---|
| `key` | string | Settings key, the name the input was assigned to |
| `kind` | string | `"number"`, `"bool"`, `"string"`, `"color"`, `"source"`, `"interval"`, `"time"` or `"select"` |
| `label` | string | Row label in the settings dialog |
| `default` | value | The declared default, in constant pool value form (section 2.9) |
| `min` | number? | Numeric lower bound, inclusive |
| `max` | number? | Numeric upper bound, inclusive |
| `step` | number? | Numeric step for a spinner |
| `options` | array? | Allowed values for `"select"` |
| `group` | string | Settings group heading |
| `tooltip` | string? | Help text for the row |
| `slot` | number | The frame slot this input is written into |

The host supplies a settings object keyed by `key`. For each input the engine
resolves the effective value as: the host's value when the host supplies one and it
passes validation, otherwise `default`. Validation is exact: wrong type, a number
outside `min` or `max`, a `"select"` value not in `options`. A value that fails
validation is OS3008 and the program does not run, rather than falling back to the
default, because a settings dialog that silently ignores what a user typed is worse
than one that says the value is out of range.

An input value is never absent. `input()` cannot declare `none` as a default,
because the default's type is what fixes the input's type.

### 2.7 channels

Everything a script draws for a bar leaves the machine through a **channel**. A
channel holds at most one value per bar. The `EMIT` instruction is the only way to
write one.

| Field | Type | Means |
|---|---|---|
| `id` | number | Channel index, equal to its position in the array |
| `type` | string | `"number"`, `"string"`, `"color"` or `"bool"` |
| `defer` | bool | Held back on an unconfirmed bar, section 5.4 |
| `once` | bool | The verifier requires exactly one write on every path, section 3.5 |

One instruction and one flat table cover plots, levels, markers, alert conditions,
alert messages, bar colouring and pane background. The alternative, an instruction
per drawing surface, would have added six opcodes that all do the same thing and
would have made every new surface a format change. A surface is a declaration in
`outputs` that points at a channel; it is not machinery.

A channel's value is absent unless something wrote it, and absent is what the host
sees: a gap in a plot, no marker, no alert, a bar left its own colour.

### 2.8 outputs

The declared, fixed shape of the study. It is fixed before bar 0 because a legend,
a settings dialog and a pane have to exist before the first bar runs
(`language.md` section 7.1).

```json
"outputs": {
  "plots": [], "fills": [], "levels": [], "markers": [],
  "tables": [], "alerts": [], "barColor": null, "background": null
}
```

**`plots[]`**

| Field | Type | Means |
|---|---|---|
| `key` | string | Stable identity, unique within the program |
| `title` | string | Legend title |
| `type` | string | `"line"`, `"step"`, `"area"`, `"histogram"`, `"column"` or `"line-markers"` |
| `channel` | number | The channel carrying its value |
| `color` | color | Default colour |
| `colorChannel` | number? | A channel carrying a per-bar colour, when the call's colour argument is not constant |
| `width` | number | Line thickness |
| `lineStyle` | string | `"solid"`, `"dashed"` or `"dotted"` |
| `offset` | number | Bars to shift the drawn column right, negative for left |
| `overlay` | bool? | Force this one plot onto the price pane |
| `scale` | string? | `"right"`, `"left"` or `"none"` |
| `priceFormat` | string? | Axis formatting for the scale this plot maps to |
| `ohlc` | object? | Four plot keys drawn as bar-shaped elements |

A plot's colour argument is constant in almost every script, so the common case is
a declaration and no per-bar cost. When it is not constant the compiler allocates a
second channel and emits it beside the value, which is how a script paints a
histogram by sign without a second plot.

**`fills[]`**

| Field | Type | Means |
|---|---|---|
| `between` | array of two string | The two plot keys to fill between |
| `colorUp` | color? | Where the first plot is above the second |
| `colorDown` | color? | Where the second is above the first |
| `colorUpChannel` | number? | Per-bar colour, as on a plot |
| `colorDownChannel` | number? | Per-bar colour |
| `opacity` | number | 0 to 1 |
| `overlay` | bool? | Draw on the price pane |

**`levels[]`**

| Field | Type | Means |
|---|---|---|
| `title` | string | Label |
| `channel` | number | The channel carrying the price |
| `color` | color | Line colour |
| `lineStyle` | string | `"solid"`, `"dashed"` or `"dotted"` |
| `lineWidth` | number | Thickness |

A level's price arrives through a channel and is therefore evaluated every bar, and
**the level drawn is the one from the last bar executed**. The alternative was to
require a compile-time constant, which is simpler and would have made
`level(previousDayHigh, ...)` impossible; a level that tracks the data is worth a
channel.

**`markers[]`**

One entry per `signal()` call site.

| Field | Type | Means |
|---|---|---|
| `key` | string | Stable identity |
| `channel` | number | The channel carrying the marker text, `defer` true |
| `position` | string | `"above"`, `"below"` or `"at"` |
| `shape` | string | `"label"`, `"arrowUp"`, `"arrowDown"`, `"circle"` or `"square"` |
| `color` | color? | Plate colour |
| `textColor` | color? | Text colour |

A marker is emitted when its channel holds a string for the bar, and not otherwise.
A call site that fires more than once on a bar, which can only happen inside a
loop, leaves the last text written; one bar and one call site produce at most one
marker.

**`tables[]`**

| Field | Type | Means |
|---|---|---|
| `key` | string | Stable identity |
| `slot` | number | The frame slot holding the table handle |
| `position` | string | `"topLeft"`, `"topRight"`, `"bottomLeft"` or `"bottomRight"` |
| `rows` | number | Row count |
| `cols` | number | Column count |
| `options` | object | Text size, colours, borders |

A table's cells are written by library calls against the handle, not by channels: a
grid of two hundred cells would otherwise need two hundred channels, and almost all
of them would be absent on almost every bar. The cell buffer is an output buffer
cleared at the start of each execution of a bar and committed with the rest
(section 5.1).

**`alerts[]`**

| Field | Type | Means |
|---|---|---|
| `key` | string | Stable identity |
| `title` | string | Short label |
| `condChannel` | number | Boolean channel, `defer` true |
| `messageChannel` | number? | String channel for the message, `defer` true |

**`barColor`** and **`background`** are each either `null` or
`{ "channel": n }`. There is one of each per program. A script with three
`barColor()` calls writes the same channel three times and the last write on the
bar wins, which is the same rule as any other channel and needs no extra sentence
anywhere else.

### 2.9 consts

The constant pool. Every literal in the program, deduplicated, plus three reserved
entries.

**Entries 0, 1 and 2 are fixed:**

```json
"consts": [ ["z", null], ["b", false], ["b", true], ... ]
```

Index 0 is the absent value, 1 is `false`, 2 is `true`. Fixing them costs three
pool entries in every program and saves three opcodes in every engine, because
`CONST 0` is then the whole of pushing absence and no instruction needs to encode a
literal of its own.

Each entry is a two element array `[tag, value]`:

| Tag | Value encoding | Example |
|---|---|---|
| `"z"` | `null` | `["z", null]` |
| `"b"` | `true` or `false` | `["b", true]` |
| `"n"` | a finite number | `["n", 14]` |
| `"s"` | a string | `["s", "BUY"]` |
| `"c"` | `[r, g, b, a]` | `["c", [255, 136, 0, 1]]` |

A colour is four numbers: red, green and blue as whole numbers from 0 to 255, and
alpha as a number from 0 to 1. A hex literal `#ff8800` compiles to
`[255, 136, 0, 1]` and `#ff880080` to `[255, 136, 0, 0.5019607843137255]`, which is
128 divided by 255 in binary64 and is exact in the sense that every engine computes
the same bits from the same division. Storing a colour as a string would have been
shorter to read and would have left the alpha byte to be parsed and divided by each
engine separately, which is a place for two engines to differ by one part in 255.

A pool entry is never an array literal. `[1, 2, 3]` compiles to three pushes and an
`ARRAY` instruction, because an array literal must produce a **new** array every
time it is evaluated, and a shared pool object would be the same array on every
bar.

### 2.10 series

A **series register** is the per-bar history of one value. Only a register has
history, and the `HIST` and `HISTP` instructions are the only way to read it.

| Field | Type | Means |
|---|---|---|
| `id` | number | Register index, equal to its position in the array |
| `kind` | string | `"bar"`, `"computed"` or `"argument"` |
| `field` | string? | For `"bar"`: which bar field, see below |
| `name` | string? | Source name, for a debugger |

A `"bar"` register is filled by the engine from the host's bar before the bar's
code runs. The fields and their exact definitions:

| Field | Value |
|---|---|
| `open`, `high`, `low`, `close` | The bar's prices |
| `volume` | The bar's volume, absent when the host supplies none |
| `time` | Bar open time, milliseconds since the Unix epoch, UTC |
| `hl2` | `(high + low) / 2` |
| `hlc3` | `(high + low + close) / 3` |
| `ohlc4` | `(open + high + low + close) / 4` |
| `hlcc4` | `(high + low + close + close) / 4` |
| `bar.index` | Zero based position in the dataset |
| `bar.count` | `bar.index + 1` |
| `bar.isFirst`, `bar.isLast`, `bar.isConfirmed`, `bar.isRealtime`, `bar.isNew` | Booleans the host states |
| `bar.updates` | How many times this bar has been executed, counting from 1 |

The derived fields are written as expressions because their order of operations is
part of the contract: `hlc3` adds high to low, adds close to that, then divides. A
different association gives a different last bit, and a study that matches a
reference implementation on one engine and not on another is exactly the failure
this project exists to prevent.

An absent `volume` rather than a zero is deliberate, on the same ground as the
chart contract's treatment of an unknown tick size: a script that sizes something
by volume has to be able to tell "no trades" from "nobody told me".

A `"computed"` register is written by `SSTORE`: it is a top-level name whose history
the program reads. A `"argument"` register is written by `SSTORE` immediately before
a user function call, to retain a series argument's per-bar values for that call
site (section 4.10).

**The compiler allocates a register for a top-level name only when the program
reads that name's history**, and otherwise gives it a plain slot. This changes
memory, never numbers. A host that wants every name watchable in a debugger asks
the compiler for full retention, which allocates a register for every top-level
name and sets `debug.retain` to true.

### 2.11 frame, cells and states

Three regions, three lifetimes. Section 3.2 defines them as memory; this is what
the program declares about them.

```json
"frame": { "slots": 7 },
"cells": [ { "id": 0, "kind": "var", "name": "stop" } ],
"states": [ { "id": 0, "fn": 3 } ]
```

**`frame.slots`** is the number of slots in the top-level frame. Slots hold every
name that is not a register and not persistent: top-level names, block-scoped
names, loop variables, loop bounds, input values and table handles. They are set to
absent at the start of every execution of a bar.

**`cells[]`** are persistent values: one entry per `var` or `live var` declaration.

| Field | Type | Means |
|---|---|---|
| `id` | number | Cell index |
| `kind` | string | `"var"` or `"live"` |
| `name` | string? | Source name, for a debugger |

A `"var"` cell obeys the rollback rule. A `"live"` cell does not (`language.md`
section 8.2). Both survive from bar to bar; both start uninitialised, and
`CELL_INIT` is what initialises one.

**`states[]`** are per-call-site regions for library functions that hold state.

| Field | Type | Means |
|---|---|---|
| `id` | number | State region index |
| `fn` | number | Index into `lib.functions` |

The contents of a state region are defined by the library manifest, not here. What
this document requires of the manifest is that a state region is **snapshottable by
a mechanical copy**: a fixed record of numbers, booleans and strings, plus at most
one queue of values with a bounded length. An engine must be able to copy and
restore a region without knowing which function owns it, because the rollback and
replay rules of section 6 apply to every region at once.

### 2.12 functions and callSites

```json
"functions": [
  { "name": "change", "params": 1, "slots": 2, "code": [ ... ] }
],
"callSites": [
  { "fn": 0, "argc": 1, "cellBase": 2, "stateBase": 1, "series": [4] }
]
```

A **function** entry:

| Field | Type | Means |
|---|---|---|
| `name` | string | Source name, for a debugger and for an error message |
| `params` | number | Parameter count. Parameters occupy slots 0 to `params - 1` |
| `slots` | number | Frame size, including the parameters |
| `code` | array | The body's instruction list, ending in `RET` |

A **call site** entry, one per distinct **call path**, not per syntactic call:

| Field | Type | Means |
|---|---|---|
| `fn` | number | Index into `functions` |
| `argc` | number | Arguments this site passes, equal to `functions[fn].params` |
| `cellBase` | number | Added to every cell operand inside the body |
| `stateBase` | number | Added to every state operand inside the body |
| `series` | array of number | Register bound to each series parameter, `-1` for a parameter with no history read |

`language.md` section 11.4 says state is allocated per call site, and its own
example makes clear what that has to mean when a stateful helper is called from two
places: the `var` inside `barsSince` is a separate counter per call. So state is
allocated per **call path**, the chain of call sites from the top level down. With
recursion banned the call graph is a directed acyclic graph, so the set of paths is
finite and the compiler enumerates it. A function body addresses its cells and its
state regions relative to the frame's bases, and the call site supplies them, which
is what makes one body serve many independent pieces of state.

The number of paths can grow multiplicatively in a program where several functions
each call the next twice. A compiler that would exceed an engine's declared region
count reports OS5004 naming the two functions whose nesting caused it, rather than
emitting a program no engine will load.

### 2.13 loops

One entry per loop in the program, in source order. The `TICK` instruction names
one.

| Field | Type | Means |
|---|---|---|
| `id` | number | Loop index |
| `kind` | string | `"for"`, `"forIn"` or `"while"` |
| `line` | number | Source line of the loop header |
| `col` | number | Source column of the loop header |

The loop table exists so that OS5001 can name the line of the loop that was running
when the budget ran out, which is the loop's header line and not the line of
whatever instruction happened to be executing.

### 2.14 code, and the canonical encoding

`code` is the top-level instruction list: the body of the per-bar loop. It is an
array of instructions. Each instruction is an array whose first element is the
opcode name as a string, followed by its operands:

```json
["CONST", 4]
["CALL_LIB", 0, 2, 0]
["HALT"]
```

The opcode is a name rather than a number so that a program is readable, diffable
and hashable by hand, and so that a format that adds an opcode does not renumber
anything. Decoding happens once, at load; the cost of a string is paid per program,
not per bar. An engine may map the names to its own integers on load and must not
depend on any numbering, because none is defined.

`code` and every function's `code` must end with a terminator: `HALT` for `code`,
`RET` for a function body. Falling off the end of an instruction list is not
defined, and the verifier rejects a list that could.

**The canonical form**, which is what a hash is taken over:

- UTF-8, with no byte order mark.
- No whitespace between tokens.
- Object keys sorted ascending by Unicode code point. Sorted rather than in the
  order this document lists them, because a sort is a rule an emitter in any
  language can follow without a table.
- A number is written as the shortest decimal string that reads back as the same
  binary64 value, with a leading `-` for a negative, no leading `+`, no leading
  zero before a digit other than in `0.x`, and an exponent written as `e` followed
  by an optional `-` and the decimal exponent when the shortest form needs one.
- A string escapes only what it must: the quote, the backslash and the code points
  below 0x20, the last as `\u00XX` except for `\n`, `\r` and `\t`.

`source.hash` is `"sha256:"` followed by the lowercase hexadecimal SHA-256 of the
UTF-8 source text, after the CRLF normalisation of `language.md` section 3.1.
`source.hash` identifies the source; the hash of the canonical encoding identifies
the program. A host records both against a chart, a backtest run and a live
process, which is what makes a result reproducible months later.

### 2.15 debug

```json
"debug": {
  "pos": [[0, 6, 11], [1, 6, 18], [2, 6, 7]],
  "fnPos": [[0, [[0, 3, 18]]]],
  "names": { "slots": [], "cells": [], "series": [], "channels": [] },
  "retain": false
}
```

| Field | Type | Means |
|---|---|---|
| `pos` | array | Source positions for `code`, see below |
| `fnPos` | array | `[functionIndex, positions]` pairs, same form, for function bodies |
| `names` | object | Slot, cell, register and channel names, by index |
| `retain` | bool | The compiler gave every top-level name a register |

`pos` is a list of `[instructionIndex, line, column]` triples in ascending index
order. The position of any instruction is the triple with the greatest index at or
below it, so a run of instructions from one expression costs one triple.

`debug` never affects execution. An engine may drop it after load. It may not be
absent from the program, because an error message without a line is the thing this
project promised not to ship.
