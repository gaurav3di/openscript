<div align="center">

# OpenScript

**An open trading language. Write a study or a strategy once, plot it, backtest it, trade it.**

Compiles in the browser in milliseconds with no build step and no `eval`, runs
the same compiled program on a server, and is specified well enough that anyone
can write their own engine for it.

[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![status](https://img.shields.io/badge/status-early%20development-orange.svg)](./ROADMAP.md)

</div>

---

## Status

Early development. The specification is being written first, and the
implementation follows it. Nothing here is stable yet. Watch
[ROADMAP.md](./ROADMAP.md) for what lands when.

## What it looks like

```
study("EMA cross", overlay = true)

fast = input(9,  "Fast")
slow = input(21, "Slow")

ef = ema(close, fast)
es = ema(close, slow)

plot(ef, "Fast", aqua)
plot(es, "Slow", orange)

if crossUp(ef, es)
    signal("BUY")
```

The same file becomes a strategy by adding orders:

```
strategy("EMA cross", overlay = true)

if crossUp(ef, es)
    buy(qty = 1)

if crossDown(ef, es)
    close()
```

One script. One set of numbers on the chart, in the backtest, and in the market.

## Why it exists

Chart scripting today is closed. You write in someone's editor, your script runs
on their servers under their limits, and the only way out is a webhook. The
numbers you backtest are not the numbers you trade, and you cannot check either.

OpenScript is the opposite of that:

- **Yours.** Plain text files in a folder. Version control, diffs, your own editor.
- **Local.** It compiles and runs on your machine. No execution quota, no loop
  timeout, no cap on how many things you may draw.
- **Honest.** A higher timeframe read has to say whether it repaints. The
  compiler warns when a script would.
- **Connected.** The same script places real orders through your own broker
  connection, on paper by default.
- **Open.** Apache-2.0, a written specification, and a conformance suite anyone
  can run against their own implementation.

## How it is built

The compiler does not emit JavaScript. It emits a **compiled program**: a plain
data structure of instructions, defined by a versioned schema.

That one decision carries the whole project:

1. It runs in a browser under a strict content security policy, with no `eval`
   and nothing for a security team to approve.
2. A server-side engine is a few hundred lines that walk an instruction list,
   not a second implementation of the language.
3. Anyone can write an engine in any language, and prove it correct by running
   the conformance suite.

One compiler. One compiled format. Many small engines, all of which must agree
to the last decimal.

The same decision shapes the editor. This project ships the language
intelligence as pure functions with no DOM: highlight, complete, diagnose, hover,
signature, format. Highlighting comes from the real lexer, completions from the
standard library manifest, and the errors you see while typing are the compiler's
own, with their fixes taken from the error catalogue. A host supplies the text
component and the panel around it, and keeps its own design. The editor is not a
second implementation of the language to be kept in step.

```
source text
   -> tokens
   -> tree
   -> checked tree        (errors carry a code, a line and a fix)
   -> compiled program    (plain data, versioned schema)
   -> any engine          (browser, server, yours)
```

## Errors

Every error has a stable code, a message, the cause, the fix and an example,
held in one machine-readable catalogue. The compiler, the editor and the
documentation all read that same file, so the documentation cannot drift from
the compiler. The build fails if an error exists without a documented entry, or
an entry without a test.

## Documentation

- [ROADMAP.md](./ROADMAP.md) - what is being built, in what order
- [docs/](./docs) - guides, once there is something to guide
- [spec/](./spec) - the language specification and the compiled program schema
- [CONTRIBUTING.md](./CONTRIBUTING.md) - how to work on this

## Licence

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

Apache-2.0 was chosen deliberately over a copyleft licence. A trading platform
that wants to embed OpenScript must be able to do so without publishing its own
source, or the language cannot become a shared standard.

## A note on independence

OpenScript is an independent open source language. It is not affiliated with,
sponsored by, or endorsed by any charting or trading platform, and it is not a
reimplementation of any existing product. Its specification, its documentation
and its error text are original work.
