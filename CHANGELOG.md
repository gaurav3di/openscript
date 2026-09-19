# Changelog

What changed in each release, written for somebody deciding whether to upgrade.

This file is checked at release: a version with no entry, or an entry that says
nothing, fails the build before it can become permanent.

---

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
