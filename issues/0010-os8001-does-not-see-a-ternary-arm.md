# 0010 OS8001 does not see a stateful call in a ternary arm

Status: open
Opened: 2026-09-20
Found by: the phase three gate, writing a study that guards a division the way
the published reference guards it
Against: `src/core/check/` wherever OS8001 decides what a branch is, and
`spec/errors.md` OS8001
Also touches: `spec/language.md` 9.5, which says only the taken arm of a ternary
is evaluated, and 11.4, which states the consequence for a call site that does
not execute
Severity: a silent wrong column on input a user can write, in the exact shape
the warning exists to catch. The value drawn is a real number computed from the
wrong set of bars, which is the hardest kind of wrong to see on a chart.

## What is wrong

OS8001 says:

> {name} advances only on the bars where this branch runs, and is absent on the
> rest.

`language.md` 9.5 says of the ternary:

> Both arms must have the same type, or one arm may be `none`. Only the taken
> arm is evaluated.

So a stateful call in a ternary arm is exactly the shape OS8001 describes: the
call site does not execute on the bars the other arm is taken, its state does
not advance, and its series is absent there. The engine does this correctly and
the specification says it should. The warning is not reported.

## The reproduction

```
version 1
study("Gate probe", overlay = false)

gate = close > open

// Form one: the call sits inside an if block.
inBranch = none
if gate
    inBranch = ema(close, 5)

// Form two: the same call sits in a ternary arm.
inTernary = gate ? ema(close, 5) : none

plot(inBranch, "In a branch", red)
plot(inTernary, "In a ternary", blue)
```

Reported: `OS8001` at line 9, the `if` form, and nothing at line 12.

## Why it matters more than the `if` form

The ternary is how a script guards a division, and guarding a division is the
most common reason to write a guard at all. The published form of it is:

```
traded = sum(volume, len)
plot(traded > 0 ? sum(term, len) / traded : none, "Share", green)
```

`traded` is absent for the first `len - 1` bars, so `traded > 0` is absent,
which takes the false arm. The windowed total in the true arm therefore does not
execute on those bars at all, so its own window starts filling at bar `len - 1`
and its first value lands at bar `2 * len - 2`. The study draws a real number,
computed from a window made of the bars the guard happened to let through,
`len - 1` bars later than it should. Nothing is reported.

The fix OS8001 itself recommends is the fix here too, and it is one line:

```
flow   = sum(term, len)
traded = sum(volume, len)
plot(traded > 0 ? flow / traded : none, "Share", green)
```

## What to change

Whatever decides "inside a branch" for OS8001 has to include a ternary arm.
Both arms, not only the true one: a stateful call in the false arm advances only
on the bars the condition failed, which is the same defect wearing the other
sign. The `if` form and the ternary form are one rule, and `language.md` 11.4
already states it as one rule.

## Where the gate hit it

`tests/gate/studies/scripts/flow-share.oscript` and `chande-momentum.oscript`
were both written with the windowed total inside the arm, both compiled with
nothing reported, and one of them drew a column nineteen bars short. Both now
take their totals at the top level, with a comment saying why, because the
compiler cannot yet say it for them.
