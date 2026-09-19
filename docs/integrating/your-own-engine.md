# Writing your own engine

For a platform that will not run somebody else's interpreter in its hot path.
That is a reasonable position and you should not have to.

By the end of this page you will know what you have to implement, what you do
not, how you prove it is correct, and roughly what it costs.

---

## Why this route exists at all

A compiled program is **data**, not code. That single decision is what makes this
page possible: there is a format to implement rather than a runtime to embed.

If the compiler emitted JavaScript, your only options would be to run JavaScript
or to give up. Instead there is a documented instruction set, and an engine for
it is the sort of thing a good engineer writes in a few weeks in whatever
language your infrastructure already speaks.

## What you implement

Two things, and the second is the harder one.

### 1. The instruction set

[`spec/compiled-program.md`](../../spec/compiled-program.md), sections 2 to 11.
The shape of a program, the machine, the opcodes, per-bar execution, state and
rollback, warmup and the absent value, determinism, versioning.

It is written to be implementable from the document alone. If you find a corner
where two competent implementers would reasonably choose differently, that is a
defect in the document and we want to hear about it, because it means two
conforming engines could disagree.

### 2. The strategy runtime

[`spec/stdlib.md`](../../spec/stdlib.md) section 17: the ledger, the fill fold,
the protective levels and the order they are evaluated in.

**This is where a subtle mistake loses money rather than drawing a wrong line**,
so it is worth naming the two that will catch you.

**Frames are cumulative, not deltas.** A venue reports an order's state as a
running total, and the same frame can arrive twice or out of order. Folding a
repeat as though it were a new fill double counts a position, silently, and only
in production.

**A fill can arrive after a terminal status.** A cancel races a fill and the venue
acknowledges the cancel first. An engine that treats a terminal order as closed
forever loses that fill, and the account then holds a position the strategy does
not know exists. Everything downstream of that is confidently wrong: the ledger,
the profit and loss, the protective levels, and the exit that will never be sent.

The specification settles both. Follow it exactly rather than reasoning from
first principles, because both answers are defensible and only one is shared.

## What you do not implement

The compiler. You consume compiled programs; you never parse OpenScript.

That matters more than it sounds. The language can gain syntax without you
changing anything, because the format is the contract and the format has its own
version, which moves far more slowly than the language does. See
[`spec/compiled-program.md`](../../spec/compiled-program.md) section 9.

## How you prove it

[`spec/conformance.md`](../../spec/conformance.md). A case is a script, its input
bars, and the expected output, with a stated comparison tolerance so that
"matches" means something precise.

Run the suite. Every case passes, or you have a list of the ones that do not.

**This is the part that makes the route tractable.** Without it, "we implemented
the specification" is an opinion, and a risk team cannot sign off on an opinion.
With it, you know when you are done, which is the thing a specification alone
never tells you.

Two rules that come with it:

- **Two engines disagreeing is a release blocker**, not a bug report. A backtest
  that disagrees with a chart is worthless, and so is the chart.
- **Floating point order of operations is part of the contract.** Where a formula
  can be arranged two ways, the specification says which, because arithmetic that
  is mathematically equivalent is not numerically equivalent and your users will
  find the difference before you do.

## Roughly what it costs

An honest estimate rather than an encouraging one. Weeks, not days, and most of
it is the strategy runtime rather than the instruction set. The instruction set is
mechanical once you have read it. The runtime has the two hazards above and a
number of cases that only appear when a real venue behaves badly.

Budget for the conformance suite finding things. That is what it is for, and a
first run that passes everything usually means the suite was not wired up
correctly.

## Current status, stated plainly

**No engine written by somebody outside this project has passed the suite yet.**
The second engine, which is the first real test of whether the format travels, is
Phase 6 on the [roadmap](../../ROADMAP.md).

If you are considering this route now, we would rather work with you on it than
have you discover the gaps alone, and any ambiguity you find in the format is a
defect we want to fix while there is still one implementation to keep in step.
