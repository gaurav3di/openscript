# 0007 OS8009 is reported for a plot that does draw

Status: closed 2026-09-24
Opened: 2026-09-20
Found by: the phase three gate, writing a study that carries one piece of
per-bar state into another at a session boundary
Against: `src/core/check/warmup.ts` and `src/core/check/outputs.ts`, and
`spec/errors.md` OS8009
Severity: a warning that is false on input a trader can write, on the one
warning in the language whose whole purpose is to be believed before the study
is run

## What is wrong

OS8009 says "This plot can never draw", and its message is
`{title} plots a value that is absent on every bar`. It is reported when the
checker's warmup analysis answers `never` for the plotted expression.

A `var` that is assigned from another `var` **before** that other one has been
assigned on the same file's later lines is analysed as `never`, and everything
computed from it is `never` too, so every plot built on it draws OS8009. The
plot draws.

Minimal reproduction, and the column the engine actually publishes over four
rising bars:

```
version 1

study("Probe", overlay = true)

var carried = none
var running = none

if not bar.isFirst
    carried = running

running = close

plot(carried, "Carried", aqua)
```

Reported: `OS8009` at the `plot` line.
Published: `[null, 100, 101, 102]`, a value on every bar from bar 1.

## Why it matters more than it looks

This is not an unusual shape. It is the shape of every rollover: a running
figure is carried into a held one at a boundary and then restarted, and the
carry has to be read **before** the restart or each frame is handed its own
first bar as the whole of the frame before it. Two studies in the phase three
gate are written this way, a session pivot set and a trend level that steps
across at a flip, and both drew the warning while both drew their lines.

The order the checker is sensitive to is the order the study's meaning requires,
so the obvious edit is not available:

| Shape | Reported | Published |
| --- | --- | --- |
| the copy, then the assignment | OS8009 | the previous bar's value, from bar 1 |
| the assignment, then the copy | nothing | **this** bar's value, from bar 1 |
| `var running = close`, then as written | nothing | the previous bar's value, from bar 1 |

The middle row is a different study. The third row is the workaround the gate's
two studies use, and it works because seeding the `var` from a bar field gives
the name a warmup of bar 0 at the point the copy reads it.

## What is actually happening

`src/core/check/warmup.ts` defines `never` as "a value that is absent on every
bar of the run", and the file is explicit that this is the case where the
compiler can tell a trader a line will not appear. A `var` initialised to `none`
starts there. The checker reads a name's warmup at the point of use, in source
order, so a name whose own assignment comes later in the file is still `never`
when it is copied, and `never` is absorbing: `later` and the ternary's `earlier`
both carry it through, so one `never` operand makes a whole expression `never`,
and `recordOutput` reports OS8009 on it.

What the analysis is missing is that a `var` is one name over the whole run, and
that a use inside a bar can read a value a later line wrote on the bar before.
Source order is the right order for a plain assignment, which is recomputed
every bar and cannot be read before it is written; it is not the right order for
a `var`.

## Options

1. **Fix the warmup of a `var` at the name rather than at the use.** Take the
   warmup of a `var` to be the earliest of its initialiser and every assignment
   to it anywhere in the file, which is one pass over the assignments before the
   expressions are walked. A `var` read before any assignment on the first bar
   genuinely holds its initialiser, so the answer is still truthful; it is just
   not order sensitive.
2. **Report OS8009 only when nothing in the file could ever give the name a
   value.** Narrower than option 1 and it keeps the warning for the case it was
   written for, which is a placeholder that was left behind.
3. **Leave it and document the shape.** Cheapest, and the worst of the three:
   the warning exists so that a trader believes it before running the study, and
   a warning that is wrong about a common shape teaches them not to.

Option 1 looks right and small. Nothing here proposes weakening what OS8009
catches: the placeholder case, `var x = none` with no assignment anywhere, stays
exactly as it is under every option above.

## What this issue does not claim

The engine is correct throughout. Nothing is miscomputed, no column is wrong and
no warmup in a published program is affected: `compiled-program.md` section 7
carries no warmup field, and the line starts on the bar the value stops being
absent. This is a diagnostic that is false, and only that.

## How it closed

Option 1, in the one form that stays truthful without a second pass.
`src/core/check/assigned.ts` collects, before any expression is walked, every
name some line of the file gives a value, leaving out an assignment of the
literal `none`. A read of a `var` whose warmup is still `never` at that line,
and which a later line gives a value, now sees a floor of bar 0 rather than
`never`: the later line wrote it on the bar before, or on an earlier pass of the
same loop, and an exact bar would need that line's warmup before it had been
read. A floor claims nothing, which is what withdrawing a false `never` needs.

A plain name is untouched, because it is recomputed every bar and cannot be read
before this bar's line writes it. The placeholder case is untouched too:
`var x = none` that nothing writes, or that a later line only writes `none`
into, is still OS8009.

Tests: `tests/unit/check-warmup.test.ts` holds the reproduction above with no
OS8009, and both placeholder shapes with it. The comment in
`tests/gate/studies/scripts/session-pivots.oscript` that pointed here now says
why its running extremes are seeded from a bar field, which is that `max` and
`min` propagate absence, rather than blaming the checker.
