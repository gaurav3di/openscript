# Running the conformance suite

For anyone holding an engine, this one or another, who wants to know whether it
produces the numbers every other engine produces.

By the end of this page you will know how to run the suite against an engine,
how to run two engines against each other, what the result document says, and
what this repository's own adapter does not yet reach.

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

## What this adapter does not reach

Said here so a reader does not discover it as a surprise. Each is reported as
`unsupported` or `error` on the case, never as a pass.

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
