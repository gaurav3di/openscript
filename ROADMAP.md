# Roadmap

Each phase ends with a gate that either passes or does not. A phase is not done
because the code is written; it is done because the gate passed.

Estimates assume one developer working steadily.

---

## Phase 0. Specification and skeleton

Three weeks.

- The language specification.
- The feature matrix: one row per language feature, its status, and the test
  that proves it.
- The error catalogue format.
- The compiled program schema, written down and versioned, because every engine
  and every adopter depends on it.
- Twelve target scripts written by hand: EMA cross, Supertrend, anchored VWAP,
  RSI divergence, opening range breakout, straddle premium, higher timeframe
  bias, a dashboard table, a drawing heavy study, and three strategies. If the
  language cannot express these cleanly, the language changes now rather than
  later.
- Repository, licence, continuous integration, an empty conformance suite.

**Gate:** all twelve scripts read cleanly to someone who has never seen the
language, and every construct they use is in the specification.

## Phase 1. Front end

Three to four weeks.

Tokens, tree, and errors that carry a code, a line, a column and a caret under
the offending text.

**Gate:** parses all twelve target scripts and several hundred real world
scripts without crashing, and every error it can emit exists in the catalogue.

## Phase 2. Checker and bar engine

Four to six weeks.

Name and type checking, warmup handling, series history, values that persist
across bars. The instruction engine, with no `eval` anywhere. First chart
output: plots, bands, levels, inputs, a generated settings dialog, saved layout.

**Gate:** EMA, RSI, MACD, Bollinger Bands and Supertrend match reference
implementations to the last decimal, and each one's warmup is exact.

## Phase 3. The whole visual surface

Four to six weeks.

Markers, shapes, bar colouring, pane background, tables, line and label and box
objects a script mutates over time, alerts, higher timeframe reads, other
instrument reads.

**Gate:** one hundred independently written studies reproduced in OpenScript,
each matching its reference output exactly.

## Phase 4. The editor

Three to four weeks.

The editor splits in two, and the split is the point.

**This project ships the language intelligence, headless.** Six pure functions,
text in and data out, no DOM anywhere: highlight, complete, diagnose, hover,
signature, format.

None of them is hand written, because a hand written one drifts from the language
and nobody notices for a release. Highlighting comes from the real lexer, which is
step one of the compiler. Completions come from the standard library manifest, the
same file the example check already reads its globals from. Errors as you type are
the compiler's own errors, with the fix taken from the error catalogue, which is
also what the documentation site is generated from. The editor is not a second
implementation of the language to be kept in step. It is the compiler wearing a
different hat.

**The host ships the editor on screen.** The text component, the panel, the apply
button, saving and revisions, and the theme. Every host has a design system and
none of them wants to fight a styled panel shipped by a language package.

The same headless functions wrap into a language server later, so the same
highlighting, completions and errors appear in a desktop editor for anyone who
would rather keep their scripts in version control and write them there.

**Gate:** someone with no setup writes and plots a working script in under two
minutes, and the same script opens in a desktop editor with identical errors.

## Phase 5. Strategy and backtest

Six to eight weeks.

Orders, position, brackets, sizing, a cost model that matches the market being
traded, backtest over a from and to date range, and the report: equity curve,
drawdown, trade list, win rate, expectancy, and every trade marked on the chart.

**Gate:** a backtest is reproducible from its stored script revision months
later, and two runs can be compared well enough to tell a real improvement from
noise.

## Phase 6. The second engine, and live running

Four to five weeks.

A server-side engine running the same compiled program. Process isolation per
strategy, scheduling against exchange calendars, per-script logs, paper trading
by default and live only when deliberately armed.

**Gate:** the two engines agree on every conformance case. A disagreement is a
release blocker, because a backtest that disagrees with the chart is worthless.

## Phase 7. The standard

Ongoing.

An importer for scripts written in other chart languages, a documentation site
generated from the specification and the error catalogue, a versioned compiled
format with a compatibility promise, a conformance badge, and an engine written
in a third language to prove the format travels.

---

## Promises that hold from version 1

- **A saved script never stops working.** A file declares the language version
  it was written for, and every past front end is kept.
- **Nothing changes under you.** A chart, a backtest run and a running strategy
  each pin the script revision they started with. Editing a script does not
  silently change a study on a chart or a strategy holding a position.
- **Every error is documented.** Enforced by the build, not by discipline.
- **Engines agree.** Cross-engine equality on the conformance suite is a release
  blocker.
