# Changelog

What changed in each release, written for somebody deciding whether to upgrade.

This file is checked at release: a version with no entry, or an entry that says
nothing, fails the build before it can become permanent.

---

## Unreleased

**The library the reference page promises now runs.** Ninety-five names compiled
and were then refused at load with an error that named a function and gave no
reason. Every one of them is settled: it either runs or says it is planned at the
call, where you can see what you wrote.

Sixty-three names that could not run now do. The moving averages `dema`, `tema`,
`vwma`, `swma`, `alma`, `linreg` and `ma`; the trend frames `psar`, `adx`,
`aroon` and `ichimoku`; the oscillators `stoch`, `stochRsi`, `ppo`, `cci`,
`williamsR`, `tsi`, `trix`, `cmo`, `dpo`, `ultimateOsc` and `awesomeOsc`;
`keltner`, `chop` and `hv`; the whole of the volume section, `vwap` and
`vwapAnchor` among it; `percentRank`, `correlation` and `covariance`; every
calendar call in `date`, and `session.isIn` with them; and the six instrument
facts `chart.timezone`, `chart.pointValue`, `chart.currency`,
`chart.instrumentType`, `chart.hasVolume` and `chart.hasOpenInterest`.

The arithmetic for the studies was already written and gated against reference
vectors; what was missing was a form an engine could drive a bar at a time, so
each one is now a step over a state region like the rest of the library, and its
whole-series form is that step folded. There is still one implementation of every
formula, and the engine holds none of it.

The calendar is new. It reads an instant in a named zone using the runtime's own
timezone database rather than a table copied into this package, because a copied
table goes stale silently in exactly the way a fixed offset does. Two readings
that have no single instant are settled in the specification rather than left to
an engine: an hour a spring change removed resolves to where it would have been,
and an hour an autumn change repeated resolves to the first of the two.
`date.weekOfYear` is the ISO week, which the specification now states.

Fifty-nine names are now marked planned instead of failing at load. The strategy
surface, everything in `order`, `leg` and `book` that is folded from a ledger, and
the position facts beyond the five an engine reads from the account's own row: no
engine holds a ledger in this release. So are the four session facts read off the
instrument's trading hours, which the engine's host record does not yet carry.
Nothing was removed from the specification; a marked name is refused where it is
written, with a message saying it is planned.

A test now fails the build if a name the checker accepts can neither run nor says
it is planned, so this cannot come back quietly.

**Three diagnostics now say what is true.** Calling or reading a name the library
lists as planned reports OS2020, whose message says the name is planned. It used to
report OS2001, which told a reader the name was not defined at this point in the
file and offered them a different function as the fix. OS2004 no longer tells a
reader to assign the value to a name at the top level in the case where it already
is one: a declaration handle, a runtime object and a library fact that is not a
series have no history whatever they are named, and the fix now says so. OS6016 no
longer describes a program below the engine's format as though it were above it,
and says that the major number decides in either direction.

**The integration guide described a surface the engine does not have.** The page on
running the engine told an integrator to hand over columnar arrays, one per field.
The engine takes one object per bar, so code written from that page did not compile
against the library. The page now describes the surface as it is, and the memory
case it was making, which is real and unanswered, is measured in `issues/0005`.

## 0.1.0-alpha.1

The first release published by the automation rather than by hand.

Fixes a version skew that would have bitten anybody running the tests on a
different runtime than the author. Test discovery passed a glob to the runtime's
test runner, which expands it on a recent version and treats it as a literal path
on an older one, so the suite silently found no files and reported success.
Discovery now walks the filesystem in code, and finding zero test files is a
failure rather than a pass.

The supported runtime floor moves to Node 22. Node 20 reached end of life earlier
this year, and supporting a runtime nobody should be running was forcing a worse
test setup.

The build now reports two version numbers of its own: the package version, so a
bug report can establish which build produced a number, and the compiled program
format version, so an engine written by somebody else can refuse a program it does
not implement. Both are generated from the files that already state them rather
than typed into source.

## 0.1.0-alpha.0

First publication. **This version parses and does not compute anything.**

A lexer, a parser, a syntax tree, and diagnostics carrying a code, a line, a
column and a fix. It will tell you whether a script is well formed. It will not
calculate a moving average, draw anything, or place an order.

It exists to reserve the name and to prove the release path while the stakes are a
placeholder, on the principle that automation which has never run is not
automation.

What is behind it: the language specification, a 143 entry error catalogue in
prose and machine readable form, the compiled program format, the host interface a
platform implements, a conformance suite design, twelve worked example scripts and
72 pages of documentation. All twelve examples parse with no diagnostics, which
was the gate for this phase.

Published with no long lived credential. The checker and the engine are next.
