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
| `instrument.json` | no | Instrument facts: symbol, exchange, tick size, lot size, session, timezone. Defaults documented in section 3 |
| `settings.json` | no | Values for the script's inputs. Absent means every input takes its declared default |
| `bars.<name>.csv` | no | A secondary bar series, for a higher timeframe or other instrument read |
| `ticks.csv` | no | Intrabar updates, for a case that tests the moving bar |
| `notes.md` | no | Why the case exists and what it is defending against |

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
  "session": { "start": "00:00", "end": "24:00", "days": [1, 2, 3, 4, 5, 6, 7] }
}
```

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
  `#rrggbbaa`, always eight hex digits, always lower case.

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

### Everything that is not a number

| Kind | Compared |
|---|---|
| Absence | Present or absent, on exactly the same bars. Never subject to tolerance |
| Bool | Exactly |
| String | As an exact sequence of Unicode code points. No normalisation, no trimming, no case folding |
| Colour | Four integer channels 0 to 255, each exactly. A colour is stored as `#rrggbbaa` so there is one spelling of any colour |
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

A case that an implementation does not support is reported `unsupported` with the
feature named. It is not a pass, it is not a failure, and it is counted and
printed separately on every report. An implementation with any `unsupported` case
inside the profile it claims does not pass that profile.

---

## 9. Running the suite and reporting a result

### The adapter

An implementation ships an adapter: any program the suite can invoke with a case
directory path, which writes one JSON object to standard output and exits 0. The
suite makes no requirement about what language the adapter is written in and does
not load the engine into its own process, because an engine written in another
language must be a first-class participant rather than a special case.

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
