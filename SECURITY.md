# Security policy

## Reporting a vulnerability

Report a suspected vulnerability privately to
[rajandran@openalgo.in](mailto:rajandran@openalgo.in), or through this repository's
[private vulnerability reporting](https://github.com/marketcalls/openscript/security/advisories/new).
Please do not open a public issue for anything that could be exploited before a fix
exists.

Include what makes the report actionable: the affected version, the engine (the
TypeScript engine, the Python engine, or both), the smallest script or compiled
program that shows the problem, how the host runs it, and the impact you believe it
has. If you have a suggested fix, say so.

We aim to acknowledge a report within three working days, and to give an initial
assessment, including whether we consider it in scope, within ten working days. Fix
timelines depend on severity.

## What is in scope

OpenScript runs scripts written by other people, so the boundary between a script
and the process that runs it is the whole of its security surface. A compiled
program is data that an engine walks. It has no way to call into the host, open a
connection or touch a file, and every run is bounded by instruction, memory and
wall clock budgets. A report that breaks any part of that is the most serious kind
we can receive.

In scope:

- a script or a compiled program that makes an engine run code, call anything the
  instruction set does not expose, or read data its host did not hand it;
- a script or a compiled program that runs past its instruction, memory or wall
  clock budget, or whose failure reaches anything beyond its own run;
- crafted source that makes the compiler, the formatter or the editor services hang
  or exhaust memory in the page or process that calls them;
- the build and release pipeline, which can affect the published packages even
  though they have no runtime dependencies.

Out of scope:

- **Trading results.** A script that loses money, a backtest that differs from a
  live fill, or a signal that fires where its author did not intend is not a
  vulnerability. Report a wrong value as a bug, with the script and the bars.
- **What the host owns.** Credentials, orders, positions, risk checks and market
  data belong to the platform that runs the engine. OpenScript never receives them,
  and a platform that enforces a trading control only inside a script has put the
  control in the wrong place.
- **Settings in your own process.** Refusing code generation from strings is a
  runtime setting a host turns on for its own process. See
  [running the engine](docs/integrating/running-the-engine.md) for what it covers
  and what it does not.

## Supported versions

Fixes land on the latest minor release, on npm and on PyPI together. Older minors
do not receive backports.

## Build and release integrity

- The packages have no runtime dependencies, so the practical supply-chain risk is
  the development toolchain rather than anything a consumer installs transitively.
- Releases publish from the repository's release workflows by trusted publishing, so
  no long-lived registry token is stored anywhere. The npm package carries signed
  provenance, and the PyPI files are uploaded with attestations.
- The release workflows pin every action by commit, with the readable tag kept as a
  trailing comment, so a moved tag cannot change what a release runs.

If you find a way to influence a published package without a corresponding commit
on `main`, treat it as a high-severity report and use the private channel above.
