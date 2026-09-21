# Running the conformance suite

For anyone holding an engine, this one or another, who wants to know whether it
produces the numbers every other engine produces.

By the end of this page you will know how to run the suite against an engine,
how to run two engines against each other, what the result document says, and
what each of this repository's two adapters does not yet reach.

---

## What the suite is

A directory of cases under `cases/`, each one a directory of named files: a
script, its bars, its instrument, the frames its destination answered, and
what came out. [`spec/conformance.md`](../../spec/conformance.md) is the whole
rule: section 2 for what a case holds, section 6 for what "matches" means,
section 9 for how a result is reported and section 10 for what happens when two
engines disagree. This page repeats none of it; it says which command to run.

The cases in the tree are harvested from runs of the shipped strategies by
`scripts/harvest-cases.mjs`, and `npm test` holds them to what this engine
produces. Section 10 says a case is never edited to make an engine pass, and
that includes this one.

## The adapter

An engine takes part through an adapter, a program the suite starts once per
case. This repository's own is `scripts/adapter.mjs`, and it answers the three
invocations section 9 gives, each with one JSON object on standard output:

```
npm run build
node scripts/adapter.mjs --describe
node scripts/adapter.mjs cases/order/buy
node scripts/adapter.mjs --actual cases/order/buy
```

The first is the engine's identity. The second is one case result, with its
outcome and, on a failure, the first difference. The third is what the engine
computed for the channels the case asserts, with no comparison made, which is
what the second mode below is built on.

An adapter for another engine answers the same three invocations in the same
shapes. The runner starts every adapter with the runtime it runs on itself, so
an adapter is a JavaScript file; an engine in another language is started by a
small JavaScript file that starts it and relays its output, which is that
engine's to write.

## The second engine's adapter

`engine/adapter.mjs` is that file for the engine in
[`engine/`](./the-python-engine.md), and it answers the same three invocations:

```
npm run build
node engine/adapter.mjs --describe
node engine/adapter.mjs cases/order/buy
node engine/adapter.mjs --actual cases/order/buy
```

It is the one adapter here that does something on the way. The second engine
implements no compiler, so the relay compiles `script.os` with this repository's
compiler and hands the engine the compiled program as the canonical text a host
would send it, on standard input; the engine loads that text, runs the bars and
answers. Section 1 of the specification provides for exactly that: an
implementation that only has an engine reads compiled programs produced
elsewhere, runs the engine half, and says so. What a result means, therefore, is
that the second engine ran the program the first one emitted, which is also the
production arrangement: a container with no runtime for this language is handed
a compiled program as data.

Everything the engine answers goes through `python -m openscript`, which is the
adapter proper and can be driven on its own:

```
echo '{"program":"<the canonical program text>"}' | python -m openscript <case-directory>
```

**What it claims.** The lowest profile the specification's table names, and the
identity it writes carries `engineOnly` beside it, because section 8's word for
an implementation with no compiler is not one of the three profiles a runner
accepts. Everything it cannot do is named on the case with the `unsupported`
outcome, and the engine is what names it: a program needing a capability it does
not serve, or a library function its manifest does not hold, is refused at load
with that tag or that function in the refusal, and the refusal becomes the
feature the case reports.

**What it does not reach.** Said here so a reader does not discover it as a
surprise, and each is `unsupported` or `error` on the case, never a pass.

- **Every channel but two.** It answers `diagnostics` and `values`. The
  first adapter above answers `diagnostics`, `orders`, `trades` and
  `performance`, so today the two engines can be compared directly on
  `diagnostics` and on nothing else. That is a hole in the coverage of the whole
  suite rather than of either adapter, and it is the reason a run of the two
  against each other over `cases/` compares nothing: both cases there are
  strategy cases, which this engine reports unsupported by name.
- **A compiler case.** A case whose assertion is a diagnostic raised by
  compiling is `unsupported`: the compiler here is the first engine's, and its
  diagnostics are not the second engine's to claim.
- **`ticks.csv` and a secondary series.** The machine re-executes a bar and
  rolls its state back, and how a tick row becomes the newest bar's four prices
  is written down nowhere, so a replay would be the adapter's invention.
- **`frames.csv`.** An order frame is folded by a ledger, and this engine has
  none yet.
- **`expectedExitCode`.** Section 2 names the field and fixes no shape for it,
  so no shape is read.
- **A time input outside the one timezone this engine reads.** A host with a
  zone supplies its own reader; this engine has been given none.

## Running it

Both commands are run from the repository root, after `npm run build`.

**Against the expected files.** The runner walks `cases/`, hands each case to
the adapter in a child process of its own with a timeout, and writes the result
document of section 9 to standard output:

```
node scripts/run-suite.mjs
node scripts/run-suite.mjs --adapter path/to/their-adapter.mjs --out result.json
```

**Engine against engine.** Each case is handed to both adapters with
`--actual`, and the runner compares the two answers channel by channel with
tolerance zero, whatever the case declares, through the same comparison the
adapter uses. The first adapter's values are the `expected` side of a reported
difference and the second's the `actual` side:

```
node scripts/run-suite.mjs --against path/to/their-adapter.mjs
```

`--cases <dir>` walks another suite root, `--timeout <ms>` bounds one
invocation, and `--out <file>` writes the document to a file instead of
standard output. The one-line summary goes to standard error either way, so
standard output is the document and nothing else.

## Reading the result

The exit code is the verdict: zero for a passing run, non-zero otherwise. A run
fails on any `fail`, `nonFinite` or `error` outcome, and on any `unsupported`
one, because section 8 says an implementation with an unsupported case inside
the profile it claims does not pass that profile. A case outside the claimed
profile is not run and is reported `skipped`, which is never a pass.

A crash, a hang past the timeout, or an answer that is not one JSON object is
the `error` outcome, with a reason in the row: the program that suffered it
cannot report it, which is why an adapter is invoked once per case and never
for the suite as a whole.

The document's `suiteRevision` is the package version the cases shipped with,
because the page fixes no other place for a revision yet.

## What the reference adapter does not reach

Said here so a reader does not discover it as a surprise. Each is reported as
`unsupported` or `error` on the case, never as a pass. The second engine's own
list is in its section above.

- **Frames the destination did not answer itself.** This engine's backtest
  answers its own frames from a simulated destination and takes none from a
  file, so the frames it answered are held to the case's `frames.csv` byte
  for byte. When they are the same frames, the fold was over the case's input;
  when they are not, the case is `unsupported` with that said. Every
  harvested case holds the frames this destination answered, so every one of
  them runs.
- **Channels beyond what a run records.** The adapter answers `diagnostics`,
  `orders`, `trades` and `performance`, which are what a harvested case
  asserts. A case asserting a per-bar or chart channel is `unsupported`, by
  name.
- **A warning case.** The diagnostics a run records are the ones it raised; a
  compile warning is not among them.
- **`ticks.csv` and a secondary series.** A backtest replays no intrabar
  update and holds no series but its own.
- **A per-column tolerance.** Section 6 allows one and fixes no shape for it,
  so none is read.
- **A strategy case with no `instrument.json`.** Section 3's default
  instrument names no currency, and the money layer refuses to charge in none,
  so such a case is answered with that refusal in its diagnostics. A harvested
  case always states its instrument.
- **The money rounding digit count.** It is a fact of a run that no case file
  carries; the adapter uses the fixture's, which every harvested case ran
  under, until the page gives it a place.
