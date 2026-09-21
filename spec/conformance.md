# Conformance

How the conformance suite is built, how an implementation runs it, and what a
passing result does and does not entitle anyone to claim.

The suite exists because the project makes one promise it cannot keep by
discipline: **every engine produces the same numbers**. A chart drawn by one
engine and a backtest run by another have to agree, or the whole design (one
compiler, one compiled format, many small engines) is worth nothing. The suite
is where that promise is checked, mechanically, by anyone.

A conforming implementation is one that passes the suite. There is no other
definition, and in particular reading the specification carefully is not one.

---

## 1. What is under test

The suite tests two different things and keeps them apart.

**The compiler.** Source text goes in, and either a set of diagnostics or a
compiled program comes out. A compiler case asserts the diagnostics, or asserts
that compilation succeeded.

**An engine.** A compiled program and a set of bars go in, and per-bar output
comes out. An engine case asserts that output.

Most cases are both: the case holds source, the runner compiles it and then runs
it. An implementation that only has an engine (it reads compiled programs
produced elsewhere) runs the engine half and says so; see profiles in section 8.

What is not under test: speed, memory, the look of a chart, the wording of a
diagnostic message. Those matter, and they are not what the suite fixes.

### Where a case comes from

**A strategy case is harvested from a run, not written by hand.** A run record
already holds every file section 2 names: the script, the bars, the settings, and
what came back. `caseFilesFrom` projects one into the other and computes nothing,
so what a case asserts is what a run actually produced.

The distinction is not stylistic. A case written by hand asserts what somebody
believed a run does, and it agrees with that belief whether or not any engine
ever behaved that way. A harvested case asserts what an engine did on a day, over
bars that existed, under settings somebody chose.

A record has to carry the script's own text to be harvestable, which is record
version 2 and later. Earlier records identify their script by hash, and a hash
settles whether two files are the same without yielding either of them, so a
record written before version 2 replays and reruns but cannot become a case. The
text is checked against that hash when the record is written, because a case
whose script is a different revision than the one that produced its expected
output cannot reproduce that output, and the engine under test would be blamed
for a disagreement that was in the case all along.

A record also has to carry the instrument record of `host-interface.md` 4.1 as
the engine was handed it, which is record version 3 and later, because
`instrument.json` is that record and a run's symbol, tick size and volume flag
are not this suite's defaults. An earlier record carries the money layer's
contract, which holds six of the twelve facts, so it replays and reruns and
cannot become a case either. And the one fact 4.1 requires of every host, the
volume flag, is the one an engine does not refuse a run without: a record whose
host never stated it is refused a case rather than handed a value, because a
file stating the flag would give the engine under test a study the expected
output did not come from, and a file omitting it is not the record section 2
names.

A record that cannot make a whole case makes none. A directory missing one file
fails on an implementation we did not write, and the cost of that lands on its
author rather than on us.

---

## 2. A case on disk

One case is one directory. The directory path, relative to the suite root, is
the case identifier, and it is the same string that appears in the test column of
`feature-matrix.md`. A case with no matching matrix row fails the build, and a
matrix row naming a case that does not exist fails the build, so the two
documents cannot drift apart.

```
cases/
  absent/
    ordering/
      case.json
      script.os
      bars.csv
      expected.csv
      notes.md
```

| File | Required | Holds |
|---|---|---|
| `case.json` | yes | What this case is, what it asserts, and any declared tolerance |
| `script.os` | yes | The source text |
| `bars.csv` | for an engine case | The input bars, in full |
| `expected.csv` | for a columnar assertion | One column per asserted output channel, one row per bar |
| `expected.json` | for a non-columnar assertion | Diagnostics, drawings, table contents, orders, trades, log lines |
| `instrument.json` | no | Instrument facts: the record of `host-interface.md` 4.1. Defaults in section 3 |
| `settings.json` | no | Values for the script's inputs. Absent means every input takes its declared default |
| `backtest.json` | for a strategy case | What the report was folded under and the script never states: the money rounding digits, the charge schedule the host supplied and the report window. Section 3 |
| `bars.<name>.csv` | no | A secondary bar series, for a higher timeframe or other instrument read |
| `ticks.csv` | no | Intrabar updates, for a case that tests the moving bar |
| `frames.csv` | no | Order frames delivered between bars, for a strategy case that asserts the fold |
| `notes.md` | no | Why the case exists and what it is defending against |

That table is the whole of a case directory. A runner reads no other file from
it, and a file the table does not name is not input: a case that needs something
no row covers is a case the suite cannot run until the row exists.

The source file is always named `script.os` inside a case, whatever extension
user-authored files end up carrying, so a runner never has to guess a name or
scan a directory.

### `case.json`

```json
{
  "id": "absent/ordering",
  "category": "semantics",
  "profile": "core",
  "languageVersion": 1,
  "description": "An ordering comparison with an absent operand is absent, not false.",
  "asserts": ["values"],
  "now": 1735689600000,
  "tolerance": { "abs": 0, "rel": 0 }
}
```

| Field | Means |
|---|---|
| `id` | Must equal the directory path. Duplicated on purpose so a moved directory is caught |
| `category` | One of the categories in section 7 |
| `profile` | Which profile this case belongs to: `core`, `chart` or `strategy` |
| `languageVersion` | The version the script is compiled under. A case always pins it, never relies on the newest |
| `description` | One sentence. It is the failure message a runner prints |
| `asserts` | Which output channels this case checks: any of `diagnostics`, `values`, `markers`, `fills`, `levels`, `barColors`, `background`, `table`, `drawings`, `alerts`, `orders`, `trades`, `performance`, `log` |
| `now` | The fixed value `chart.now()` returns, in UTC milliseconds. Required if the script calls it |
| `tolerance` | Section 6. Absent means exact |
| `expectedExitCode` | For a case that asserts a runtime failure: the error code that must be raised, and the bar index it must be raised on |

A case asserts only the channels it names. A case about the absent value does not
assert drawings, so a change to drawing output cannot break it, and the failure
that does appear points at the thing that actually changed.

---

## 3. How bars are supplied

**Every byte of input lives in the case directory.** A case never names a symbol
and expects a runner to fetch it, never reads a date range from anywhere, never
opens a network connection and never reads the wall clock. That is the whole
reason a case is reproducible on a laptop with no connection, on a build machine
in another country, and in five years.

### `bars.csv`

A header row and one row per bar, oldest first, comma separated, no quoting, no
blank lines, LF line endings, UTF-8:

```
time,open,high,low,close,volume
1735689600000,100.0,101.5,99.75,101.25,15000
1735693200000,101.25,102.0,100.5,100.75,12400
```

- `time` is the bar's **open** time in UTC milliseconds, an integer, strictly
  increasing. Bar spacing is not required to be uniform, because real sessions
  are not.
- `open`, `high`, `low`, `close` are decimal numbers written in the shortest form
  that reads back to the exact binary64 value intended. Section 6 explains why
  that phrasing matters.
- `volume` is a number and may be `0`.
- An absent field is written `none`. It is legal in `volume` and in the price
  fields, because real feeds have holes and a language whose central idea is the
  absent value must be tested against them.
- Extra columns are an error rather than ignored, so a typo in a header cannot
  silently drop an input.

### Instrument facts

`instrument.json` supplies what the host would supply. When it is absent, these
are the defaults, and they are chosen to be boring rather than realistic so that
a case testing something else is not accidentally testing a session rule:

```json
{
  "symbol": "TEST",
  "exchange": "TEST",
  "interval": "60",
  "timezone": "UTC",
  "tickSize": 0.01,
  "lotSize": 1,
  "hasVolume": true,
  "session": { "start": "00:00", "end": "24:00", "days": [1, 2, 3, 4, 5, 6, 7] }
}
```

Which facts the record holds, which of them a host must state and what a script
sees when one is absent are the instrument record's (`host-interface.md` section
4.1). The block above is this suite's default set and nothing more: `true` for the
volume flag is the value that matches the default bars, which carry a volume
column, and a case about an instrument with no volume states it as `false`.

The `session` value in that block is a default of this suite as well. The session
is the instrument record's session (`host-interface.md` section 4.3).

A case that is about sessions, timezones or instrument facts says so in
`instrument.json` and in its `notes.md`.

### Secondary series

A higher timeframe or other instrument read is served from a file, never from a
provider. `bars.60.csv`, `bars.1D.csv` and `bars.OTHER.csv` are matched by the
name the script asks for. A read whose file is missing is a case failure, not an
absent series, because a silently empty series is exactly the bug the suite is
meant to catch.

### Intrabar updates

`ticks.csv` drives the moving bar, and it is how rollback, `live var` and
deferred orders are tested:

```
time,price,volume
1735693200000,101.30,100
1735693200000,101.55,250
```

Each row replaces the newest bar and re-executes it. The runner applies the rows
in file order. A case with a `ticks.csv` normally asserts that the final per-bar
output is identical to the same case run without it, which is the rollback rule
of `language.md` 7.5 expressed as a test.

### frames.csv

`frames.csv` supplies order frames the way `bars.csv` supplies bars, so a strategy
case can assert the fold against input the engine did not choose. One row is one
frame, and the fields of a frame are the ones `host-interface.md` section 7.2
names:

```
afterBar,intent,status,filledQty,avgFillPrice,orderRef,text,time
0,1,working,0,none,R1,,1735689600500
1,1,filled,25,101.5,R1,,1735693200750
1,1,filled,25,101.5,R1,,1735693200750
2,1,filled,40,101.75,R1,,none
```

- `afterBar` is the zero-based index of the bar after whose execution the frame is
  delivered, so the fold happens at a bar boundary before the next execution
  (`host-interface.md` section 7.2). Several rows may name one bar and are
  delivered in file order, which is how a case orders two frames that cross.
- `intent` is an ordinal, not an id: 1 is the first intent the run placed, 2 the
  second. A case cannot know the id an engine minted and must not depend on its
  spelling, so the runner maps the ordinal to the engine's own `intentId`. An
  ordinal greater than the number of intents the run placed is how a case hands an
  engine a frame naming an order its ledger does not hold, and what becomes of one
  is the fold's own first step (`stdlib.md` section 17.8): it is delivered like
  any other row and refused there, rather than passed over by whatever reads the
  file.
- `status` is one word a host may send, from the vocabulary of `stdlib.md` section
  17.7.
- `filledQty` is cumulative. `avgFillPrice` is absent as `none`, written the way
  `bars.csv` writes an absent field.
- `time` is the destination's own instant for this frame, UTC milliseconds
  (`host-interface.md` section 7.2), and absent as `none` where the destination
  stated none. It is not a bar time and is not required to fall inside the bar
  the row names: what it is, is the instant the destination said it spoke at.
- `orderRef`, `text` and `time` are optional columns, and an omitted column is
  absent on every row. They are left out from the right, because the columns are
  read by position: a header is a prefix of the list above, and a file that kept
  a later column while dropping an earlier one names its fields in an order
  nothing reads. Extra columns are an error, as in `bars.csv`.

The four rows above are a working frame, a fill, the same fill repeated, and a
frame whose cumulative quantity rose after the row had gone terminal and whose
destination stated no instant for it. A case asserts what came of them through
the `orders` channel of `expected.json`, and a case with no `frames.csv` is
handed no frames at all.

**One field of the ledger is folded from the `time` column, which is why it is a
column.** `stdlib.md` 17.7 moves a row's `updatedAt` to a frame's `time`: when a
frame last changed the row. While no column carried it, an engine folding a
case's frames had nothing to move that field to and left it at `placedAt`, an
engine answering its own frames carried the instant it spoke, and the two
disagreed on every row whose destination answered later than the bar that placed
the order. They agree wherever the frames arrive at that same bar, because there
the two instants are one, so a suite made only of those frames could not tell
the two readings apart and passed both. With the column the instant is input
like every other byte of a case, and a case whose destination answered a bar
later than the one that placed the order can be reproduced from its own file.

A case is not required to state one. A frame carries an instant only where its
destination stated one, so a file required to carry a number would make a case
invent what nobody said, and an absent column and a `none` in it already mean
the same thing here as they do for `orderRef` and `text`. What closes the gap is
not the requirement but the writing: whatever projects a run into a case writes
the column on every row, so a harvested case carries the instants its own run
had, and a hand-written case that states none is asserting an `updatedAt` that
stayed where the placement put it, which its own input then reproduces.

### `backtest.json`

What a strategy run's report was folded under, and the script never states.
`instrument.json` is what the engine read about the instrument and
`settings.json` is what the script's inputs were set to; this file is the rest of
what the host decided, the part the money and the report depend on:

```json
{
  "digits": 2,
  "costs": null,
  "range": { "from": null, "to": null }
}
```

- `digits` is the number of decimal places every money figure is rounded to,
  half to even, once per fill total. It is a fact of the run and not of the
  instrument: `host-interface.md` 4.1 defines the instrument record as twelve
  facts and a rounding digit count is not among them, so it is not in
  `instrument.json`, and a file that put it there would not be the record
  section 2 says that file is. It is always stated, because every run rounds to
  some count, and a case that left it out would be run under whatever count a
  runner assumed.
- `costs` is the charge schedule the host supplied, whole and as the host stated
  it, or `null` when the host supplied none and the run was charged under the
  schedule the declaration states (`strategy(...)`'s commission, commission type
  and slippage), which an engine derives from `script.os` the same way. A
  supplied schedule's own currency and digit count are the contract's, because
  a run under a schedule that disagrees with its contract is refused before its
  first bar (OS6021), so the two cannot differ inside one case.
- `range` is the window the report is about: both bounds inclusive, in UTC
  milliseconds, and `null` for a bound the host did not state. Every bar in
  `bars.csv` executes, and a bar outside the window is warmup: its orders are
  real, a position opened on it is carried into the window, and it gets no point
  of the report's own. The window is compared against the bars' own times and
  never against a calendar, and a window holding no bar is refused (OS6020)
  rather than reported as a flat curve.

The file is required of a strategy case, and a harvested case always carries
it. A strategy case without it is malformed and a runner reports it `error`
(section 9), never a case run under a default: a digit count nobody stated is a
figure two engines round differently. The three are not in `settings.json`
because that file is the script's inputs keyed by name, and a digit count or a
window beside them would be a key an input could also be named.

### Where bars come from

Synthetic bars are preferred, and most cases use a short hand-written series
whose values were chosen to exercise the rule: a divide by zero, a flat run, a
gap, a bar with an absent volume. A case that needs real market data carries the
bars in the case and records in `notes.md` where they came from, who holds the
rights and under what licence they may be redistributed. Bars that cannot be
redistributed do not become a case.

---

## 4. Expected output

### `expected.csv`

One row per input bar, in the same order, and one column per asserted channel:

```
bar,ema20,signal
0,none,
1,none,
19,100.4375,
20,100.6390625,BUY
```

- `bar` is the zero-based bar index and must match the row position. It is
  redundant on purpose, so a dropped row is caught at the row it was dropped at
  rather than at the end.
- An absent value is written `none`, never as an empty field, because an empty
  field and a missing field are indistinguishable in this format and absence is
  the value most worth being unambiguous about.
- An empty field means "this channel produced nothing on this bar", which for an
  event channel such as a signal is different from an absent number.
- A number is written in the shortest decimal form that round-trips to the exact
  binary64 value recorded. Nothing is rounded for readability.
- A bool is `true` or `false`. A string is written as written, with a comma,
  quote or newline escaped by the usual quoting rules. A colour is written
  `#rrggbbaa`, always eight hex digits, always lower case, after the alpha
  conversion of `compiled-program.md` 3.1.

### `expected.json`

Everything that is not one value per bar: diagnostics, drawing objects, table
contents, orders, trades, the performance summary and log lines. Each is an
ordered list, and each element is a flat object of named fields.

```json
{
  "diagnostics": [
    { "code": "OS2004", "line": 7, "column": 12, "severity": "error" }
  ]
}
```

An element of the `orders` channel is a ledger row of `stdlib.md` section 17.7,
compared on the fields the case names and no others.

**`performance` is a list of one flat object**, holding the run's summary
statistics and nothing nested. The channel is a list for the same reason every
other one here is, so a reader and a runner need one shape rather than two. The
summary is folded from the fills the `orders` and `trades` channels fix, under
the digit count, the schedule and the window `backtest.json` states (section 3)
and the capital `script.os` declares, so nothing the figures came from is
outside the case.

**A trade marker belongs to the `markers` channel, not to `performance`.**
Section 2's vocabulary already has `markers`, and a marker is a chart output that
a study can produce as readily as a strategy, so folding it inside a performance
summary would put one channel in two places depending on what produced it.

**The equity curve is not a conformance channel, and neither is any other series
derived from the fills.** Section 2's vocabulary does not name one, and this is
the reason rather than an oversight. An equity curve is one value per bar
computed from the fills and the bar closes, both of which the case already
asserts: the `orders` and `trades` channels fix every fill, and `bars.csv` fixes
every close. A case asserting the curve as well is asserting the same facts a
second time, so it can only fail in two ways. Either it fails together with the
channels it is derived from, and says nothing they did not, or it fails alone,
which means the engines disagree about arithmetic the suite is already comparing
directly under section 6.

The cost is not small. A four hundred bar strategy case carries a four hundred
point curve, which is most of the bytes in the file and grows with every case
added, so a suite of a hundred cases pays megabytes for a channel that cannot
tell anybody anything new. An implementation that wants the curve compared has
the `values` channel and `expected.csv`, which is where one value per bar
belongs; that is a decision for a case that is about the curve, not a tax on
every case that is about money.

A diagnostic is compared on `code`, `line`, `column` and `severity` only. The
message text and the suggested fix are deliberately not compared, because
improving the wording of an error is something the project wants to keep doing,
and a suite that froze the wording would make every improvement a breaking
change. The catalogue in `errors.md` owns the wording, and its own build check
owns the requirement that the wording exists.

### How an expected file is produced

An expected file is generated by a designated reference run and then reviewed by
a person before it is committed. "Whatever came out" is not an expectation.

For library numerics the bar is higher: the expected values must also agree with
an independently written reference implementation of the same function, and
`notes.md` records which reference, its author and its licence. A function that
only agrees with itself has been tested for stability, not for correctness.

---

## 5. Determinism requirements on a runner

A case must produce the same result on every machine, so a runner:

- opens no network connection;
- reads no clock (`chart.now()` comes from `case.json`);
- reads nothing outside the case directory, including environment variables;
- depends on no locale for number formatting, case conversion, sorting or date
  formatting;
- runs cases in any order it likes, but never lets one case affect another;
- may run cases in parallel, and must produce identical results if it does not.

A runner that cannot satisfy these reports `error` for the case rather than
guessing.

---

## 6. Comparing numbers

"Matches" is meaningless without a rule, so here is the rule, completely.

### The default is exact

**A conformance comparison is bit-exact unless the case declares otherwise.**
Default tolerance is `abs = 0` and `rel = 0`.

This is not strictness for its own sake. `language.md` 7.6 requires binary64
arithmetic with round-to-nearest-even in source order, and forbids
reassociation, fused multiply-add and extended precision registers. Given that,
two correct implementations computing the same expression over the same inputs
have no licence to differ by even one bit. A tolerance would only be hiding the
place where one of them took a shortcut the specification forbids.

### The comparison function

For an asserted numeric value:

```
compare(actual, expected, abs, rel):

    1. if expected is absent and actual is absent          -> pass
    2. if exactly one of them is absent                    -> fail
    3. if actual is not a finite number                    -> fail
    4. a = normaliseZero(actual)
       e = normaliseZero(expected)
    5. if bits64(a) == bits64(e)                           -> pass
    6. if abs == 0 and rel == 0                            -> fail
    7. if |a - e| <= max(abs, rel * |e|)                   -> pass
    8. otherwise                                           -> fail
```

Each step, and why it is that way:

1. **Absence is compared first and never numerically.** Two absent values match.
2. **Absence is never inside a tolerance.** A number is not nearly absent. Warmup
   length is a specified property (`language.md` 7.3), so producing a value one
   bar early is a defect however small the value is.
3. **A non-finite result is always a failure.** `language.md` 5.1 says infinity
   and not-a-number never appear as values, so producing one is a defect in the
   engine, not a near miss. It is reported with its own outcome, `nonFinite`, so
   it is never buried in a list of ordinary numeric failures.
4. **Signed zero is normalised.** Negative zero and positive zero compare equal.
   The sign of zero is not observable in the language: there are no infinities to
   divide into, and division by zero produces absence, so no script can tell the
   two apart. Comparing raw bits would therefore fail a case over a difference no
   script can see.
5. **Bit equality is the normal outcome**, and it is a bit comparison rather than
   a decimal one so that a formatting decision can never make two different
   values look equal.
6. **Exact by default**, as above.
7. **The tolerance form is `max`, not a sum.** With `max`, exactly one bound is
   in force at any magnitude: the absolute bound near zero and the relative bound
   away from it, with the crossover at `|e| = abs / rel`. The common additive
   form `abs + rel * |e|` always loosens the absolute bound a little by the
   relative term, so a value that was meant to be compared at `abs` is quietly
   compared at slightly more than `abs`. A failure under the `max` form can also
   name which of the two bounds it broke, which the additive form cannot.

### Declaring a tolerance

A case that needs slack declares it and says why:

```json
"tolerance": {
  "abs": 0,
  "rel": 1e-12,
  "reason": "Expected values come from an independently written reference whose internal accumulation order differs."
}
```

- `reason` is required whenever either bound is non-zero. A tolerance without a
  stated reason fails the build. This is the rule that stops tolerance from being
  the thing an engine author widens until the suite goes green.
- A tolerance may be declared per case, or per column, and a per-column
  declaration overrides the case. Per-column exists so that one channel derived
  from an outside reference does not loosen every other channel in the same case.
- The suite caps a declared tolerance at `rel = 1e-9` and `abs = 1e-12`. Anything
  looser is not a conformance case. It may still be a useful comparison, and it
  belongs in the separate golden-port corpus, which is not part of the badge.

The cap is enforced at both ends. A runner meeting a `case.json` past it
reports the case `error` (section 9), and `caseFilesFrom` refuses a record whose
run declared a tolerance past it with OS6021, the code the run itself refuses a
setting with, and writes no file at all: a directory the suite will not accept
fails every runner it meets, and the blame lands on the engine under test. The
two figures are read out of this section by a test and held to the constants
the projection carries, because the engine reads no page.

### Everything that is not a number

| Kind | Compared |
|---|---|
| Absence | Present or absent, on exactly the same bars. Never subject to tolerance |
| Bool | Exactly |
| String | As an exact sequence of Unicode code points. No normalisation, no trimming, no case folding |
| Colour | Four integer channels 0 to 255, each exactly, after the alpha has been converted to a byte by the rule in `compiled-program.md` 3.1. A colour is stored as `#rrggbbaa` so there is one spelling of any colour |
| Time | An exact integer in UTC milliseconds |
| Event channel | Fired or not fired on each bar, and the payload compared field by field |
| Ordered list | Length first, then element by element at the same index. A length mismatch fails before any element is compared, and the report names the first index that differs |

### Cross-engine comparison is always exact

When the suite compares two engines against each other rather than against an
expected file, the tolerance is zero, always, whatever the case declares. A
declared tolerance exists only to absorb the difference between OpenScript and an
outside reference implementation. Two engines running the same compiled program
over the same bars have no such excuse.

---

## 7. Categories of case

| Category | Asserts | Example |
|---|---|---|
| `lexical` | Diagnostics from tokenising | A tab in leading whitespace is OS1002 at the right column |
| `syntax` | Diagnostics from parsing | A chained comparison is OS1008 |
| `static` | Diagnostics from checking | A shadowed name is OS2002 naming the outer line |
| `warning` | An OS8xxx diagnostic, and that compilation still succeeded | A stateful call inside a branch warns and still runs |
| `semantics` | Per-bar values | Persistence, scope, control flow, the absent value |
| `numerics` | Per-bar values against an independent reference | Every library function, with its exact warmup |
| `surface` | Markers, fills, levels, bar colours, background, table contents, drawing objects | A fill stops across an absent bar |
| `time` | Per-bar values derived from time, session and instrument facts | A weekly rule at a session boundary |
| `external` | Per-bar values from a higher timeframe or another instrument, served from case files | A daily high folded onto hourly bars, with the alignment bar named |
| `intrabar` | Output after a `ticks.csv` replay | Rollback makes a moving bar idempotent |
| `strategy` | Orders, fills, position, trades, performance | A reversal in one order, with the cost model applied |
| `runtime` | A raised error code and the bar it was raised on | The loop budget raises OS5001 and stops the bar |
| `limits` | Behaviour at and past a declared limit | An array past its element limit is OS5002 |
| `program` | The compiled program itself | Round trip through the schema and run again, identical output |
| `log` | The log stream | A log line carries its bar index and changes no value |
| `rejection` | That something is refused | A case whose only assertion is that compilation failed with a given code |

Every category except `program` runs on every engine. `program` runs on every
compiler.

---

## 8. Profiles

An implementation does not have to implement everything to be useful, and it does
not get to imply that it did. A result is claimed against a profile:

| Profile | Covers | An implementation claiming it can |
|---|---|---|
| `core` | Lexical, syntax, static, warning, semantics, numerics, runtime, limits, log, program | Compile and run the language and produce correct numbers |
| `chart` | `core` plus surface, time, external | Also produce everything a chart draws |
| `strategy` | `chart` plus strategy | Also place orders and produce a backtest report |

A profile is cumulative, so `strategy` includes everything. An implementation may
also report `engine-only`, meaning it runs compiled programs supplied to it and
implements no compiler; it then runs every case except the compiler-diagnostic
categories, and its report says so.

### What a profile cannot say

A profile says what an **implementation** covers. There is a second kind of hole
it cannot express, and conflating the two would let the suite claim agreement it
has no right to require: a region the **specification** does not fix.

`stdlib.md` section 20.11 lists these, and gap 1 is the live one. The
transcendental calls (`exp`, `log`, `log10`, `log2`, `pow`, `hypot` and the
trigonometric family, and `alma`, `hv` and `chop`, which are built on them) have
no portable reference algorithm written yet. `compiled-program.md` section 8.3
forbids an engine from answering them out of the platform's maths library, and
nothing yet says what it should answer instead.

**No case may assert a value that reaches an open gap.** Not reported
`unsupported`, not admitted with a tolerance: not admitted. An engine that meets
such a case is being compared against arithmetic no document fixes, so a correct
engine can fail it, and section 10 would then stop a release over a defect that
is in this specification rather than in either engine. Section 11 says a case is
in practice never removed, which is the other half of the reason: a case admitted
today under a gap could not be withdrawn when the gap closes.

This is a debt and not a carve-out. It is recorded in 20.11 with what would close
it, and the calls return to the profiles that cover them on the day a reference
algorithm is written. Until then an implementation is told plainly which calls
carry no cross-engine guarantee, which is the same courtesy a profile extends
about features: it does not have to cover everything, and it does not get to
imply that it did.

The reason it cannot be deferred quietly is deployment. Those calls are answered
by the platform's own library today, and a platform is not one thing: two C
libraries, two processor architectures and several operating systems all answer
them differently in the last bit, and browser engines differ from each other as
well. A gap that looks theoretical on one machine is a visible disagreement
across a real install base.

A case that an implementation does not support is reported `unsupported` with the
feature named. It is not a pass, it is not a failure, and it is counted and
printed separately on every report. An implementation with any `unsupported` case
inside the profile it claims does not pass that profile.

---

## 9. Running the suite and reporting a result

### The adapter

An implementation ships an adapter: a program the suite invokes, which writes one
JSON object to standard output and exits 0. The suite makes no requirement about
what language the adapter is written in and does not load the engine into its own
process, because an engine written in another language must be a first-class
participant rather than a special case.

**An adapter is invoked once per case, and never for the suite as a whole.** It
is handed one case directory and answers for that case alone. The runner walks
the suite, invokes the adapter once per case, and assembles the result document
below; an adapter never writes that document and never learns how many cases
there are.

The reason is the `error` outcome. That row covers "a crash, a hang, a timeout",
and none of the three can be reported by the program that suffered it: a process
that hangs writes nothing at all, and one that dies takes any partial document
with it. Only a caller holding a clock and a child process can turn those into an
outcome, and it can only do so for one case at a time. An adapter invoked once
for the whole suite loses every result when it dies on the ninth case of four
hundred, and the failure is reported as the whole run being broken rather than as
one case erroring.

Three invocations, and an adapter implements all three:

| Invocation | Writes |
|---|---|
| `adapter --describe` | The engine's own identity: `name`, `version`, `profile`, `languageVersions` and `schemaVersion`. The runner copies these into the result document, because only the engine knows them |
| `adapter <case-directory>` | One case result: the object the `cases` array below holds, for that case |
| `adapter --actual <case-directory>` | The engine's actual output for the channels the case asserts, and no comparison |

The third exists for section 10. Comparing two engines against each other means
comparing what each produced, and a case result carries an outcome and a first
difference rather than the values themselves, so two adapters reporting `pass`
prove only that both matched an expected file, which is the thing section 10 says
is not enough. In `--actual` mode an adapter makes no comparison, reads no
tolerance and reports no outcome: it writes what it computed, in the encoding
section 4 gives that channel, and the runner does the comparing. That keeps one
comparison in one place, which is what makes "exactly, whatever the case
declares" mean the same thing for both engines.

### The result document

```json
{
  "suiteRevision": "2026.1",
  "engine": { "name": "...", "version": "...", "profile": "chart" },
  "languageVersions": [1],
  "schemaVersion": "1.0",
  "platform": "...",
  "startedAt": 1735689600000,
  "cases": [
    { "id": "absent/ordering", "outcome": "pass", "durationMs": 3 },
    {
      "id": "ta/momentum/rsi",
      "outcome": "fail",
      "channel": "values",
      "column": "rsi14",
      "bar": 41,
      "expected": "68.21847374634195",
      "actual": "68.21847374634193",
      "bound": "rel",
      "difference": "2.8e-16"
    },
    { "id": "draw/polyline", "outcome": "unsupported", "feature": "draw.polyline" }
  ],
  "summary": { "total": 0, "pass": 0, "fail": 0, "error": 0, "unsupported": 0, "skipped": 0 }
}
```

Outcomes:

| Outcome | Means |
|---|---|
| `pass` | Every asserted channel matched under section 6 |
| `fail` | A channel did not match. The first difference is reported with its channel, column, bar index, expected value, actual value and which bound it broke |
| `nonFinite` | The engine produced infinity or not-a-number, which is always a defect |
| `error` | The adapter could not run the case: a crash, a hang, a timeout, a malformed case |
| `unsupported` | The implementation does not implement the feature, which it names |
| `skipped` | The case was not run. A skipped case is never counted as a pass, and a run with any skipped case in the claimed profile is not a passing run |

A failing run exits non-zero. Numbers in a report are written as the shortest
round-tripping decimal, exactly as in an expected file, so a difference in the
last bit is visible in the report rather than rounded away by the reporting.

---

## 10. Two engines disagreeing is a release blocker

The suite runs in two modes. The first compares each engine against the expected
files. The second compares the engines against each other, case by case, channel
by channel, exactly (section 6).

The second mode catches what the first cannot. Two engines can both pass against
an expected file while sitting on opposite sides of a declared tolerance, and
they can both pass every case while disagreeing about behaviour that no case
covers yet. Comparing them directly finds both.

**A disagreement between two engines blocks the release.** Not a warning, not an
issue to be triaged later. A backtest that disagrees with the chart is worthless,
and a language whose engines disagree is not a standard. The procedure is fixed:

1. The release stops.
2. The disagreement becomes a defect report naming both engines and the first
   differing bar.
3. Somebody decides which engine is right **by reading the specification**, not
   by preferring the engine that was written first.
4. If the specification does not decide it, the specification is the defect.
   `language.md` says in its own opening that an unspecified corner is a defect in
   that document, so the rule is applied rather than argued about. The section is
   written, and only then is the engine fixed.
5. A case reproducing the disagreement is added, with `notes.md` recording what
   happened. The case is never the thing that gets changed.

That last point generalises. **A case is never edited to make an engine pass.**
Three responses to a failure are legitimate: fix the engine, fix the
specification and then the engine, or find that the case is itself wrong and
correct it with a reviewed explanation of why the old expectation was not what
the specification said. Loosening a tolerance is not on the list.

---

## 11. Suite versioning

The suite is released with a revision, and a result is only meaningful against
one. Between revisions:

- Cases may be added at any time.
- A case may be corrected only with the reviewed explanation above.
- A case is removed only when the feature it tested is removed, which
  `language.md` 4.1 does not permit within a language version, so in practice a
  case is never removed.
- Adding cases can turn a previously passing implementation into a failing one.
  That is the suite working. A badge names a revision for exactly this reason.

---

## 12. What a passing result means

### What it does mean

At suite revision R, implementation X at version V ran every case in profile P
and produced the recorded output for all of them, at the tolerances the cases
declare, on a machine that ran no network and no clock. Anyone can rerun the same
suite revision against the same build and get the same report.

That is a strong claim. It means the implementation agrees with every other
passing implementation on everything the suite covers, to the bit.

### What it does not mean

- **Not correctness on anything the suite does not cover.** The suite is a finite
  set of cases and the language has an infinite set of programs. A passing
  implementation can still be wrong on a construct nobody has written a case for
  yet, and the honest response to finding one is a new case.
- **Not correctness of the numbers in any financial sense.** The suite fixes
  agreement with a written specification. If the specification defines a function
  in a way a practitioner would call wrong, every conforming engine will be
  wrong together, identically, and the suite will be green.
- **Not robustness.** Nothing here proves an implementation survives hostile
  input, a pathological script or a file designed to exhaust memory. Fuzzing is a
  separate discipline and is not a conformance claim.
- **Not performance.** No case has a time budget. An implementation that takes an
  hour per case passes.
- **Not security.** Passing says nothing about whether it is safe to run an
  untrusted script in an implementation, which depends on the host's isolation,
  not on the engine's arithmetic.
- **Not fitness for trading.** Conformance is about a language. Whether a system
  built on it should be given money is a question about the system, its data, its
  broker connection and its operator.
- **Not an endorsement.** A passing result is self-asserted. The project runs no
  certification process, charges nothing and vouches for nobody. A badge is
  credible exactly to the extent that its result document is published alongside
  a build that anybody can rerun.
- **Not a claim about another revision.** A badge for revision R says nothing
  about revision R+1, which may contain cases R did not.
- **Not a claim about another profile.** `core` is not `chart`, and a badge must
  name its profile. A badge that does not name a profile and a revision is not a
  conformance claim at all.

### The badge

A badge carries four things and is not valid without all four: the implementation
and its version, the suite revision, the profile, and a link to the result
document. Everything else on a badge is decoration.
</content>
