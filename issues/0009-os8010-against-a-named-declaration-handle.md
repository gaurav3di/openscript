# 0009 OS8010 is reported for a named declaration handle the catalogue exempts

Status: closed 2026-09-24
Opened: 2026-09-20
Found by: the phase three gate, writing a band study whose three rails are named
symmetrically
Against: `src/core/check/check.ts`, `reportNamesNeverRead`, and
`spec/errors.md` OS8010 with `spec/errors.json`
Also touches: `spec/stdlib.md` 14.2, which says naming a `fill` or a `level`
result is legal, and `spec/language.md` 5.4, which defines a declaration handle
Severity: a warning on input the specification explicitly calls legal. It is a
warning rather than an error, so a study still runs, but a suite that treats a
warning as a failure, which this project's own gate does, cannot write the form
the specification describes.

## What is wrong

The OS8010 entry in `spec/errors.json` says, in its `cause`:

> A name bound to a declaration handle is exempt: it is a compile-time binding
> with nothing left in the bar loop, and naming a fill or a level result and
> never reading it is legal (`language.md` 5.4).

`spec/stdlib.md` 14.2 says the same from the other side:

> `fill` is the only call in version 1 that takes one, so a `fill` or `level`
> result is normally discarded; naming it is legal and does nothing.

`reportNamesNeverRead` has no such exemption. It skips a binding whose kind is
`library`, `function`, `parameter` or `loop`, and reports everything else that
nothing reads.

## The reproduction

```
version 1
study("Handle probe", overlay = true)
topRail = plot(high, "Top", red)
lowRail = plot(low, "Low", blue)
shade = fill(topRail, lowRail, gray)
mark = level(100, "Mark", gray)
```

Reported:

```
OS8010 5:1 shade is assigned at line 5 and never read.
OS8010 6:1 mark is assigned at line 6 and never read.
```

Both are the exact case the catalogue names as exempt. The same warning appears
for a `plot` handle that is named and not passed to a `fill`, which is what a
three rail study writes when it names all three rails alike:

```
upperRail = plot(basis + width, "Upper", aqua)
middle    = plot(basis, "Basis", orange)      // OS8010, and nothing is wrong
lowerRail = plot(basis - width, "Lower", aqua)
fill(upperRail, lowerRail, fade(aqua, 88))
```

## The decision to take

Either the check gains the exemption the catalogue describes, or the catalogue
and `stdlib.md` 14.2 lose it. The first is right, and the reason is in the
`cause` text already: a handle is a compile-time binding, the statement runs
whether or not the name exists, and so the sentence OS8010 exists to say, that
an unread name costs time on fifty thousand bars, is not true of one.

The narrower reading, exempting only `fill` and `level` because those are the
two the sentence names, would leave the three rail study above warning. A
handle is a handle: `language.md` 5.4 gives `plot`, `plotCandles`, `fill` and
`level` the same kind of value and the same rules.

## Where the gate works around it

Every band study in `tests/gate/studies/` names only the handles it passes to
`fill` and leaves the middle rail's `plot` call unnamed. That is a workaround
for this issue and not a preference, and it should be reverted when this is
fixed.

## How it closed

The check gained the exemption the catalogue describes, and by type rather than
by call: `reportNamesNeverRead` in `src/core/check/check.ts` skips a binding
whose type is a declaration handle, which covers `plot`, `plotCandles`, `fill`
and `level` alike, as `language.md` 5.4 gives them one kind of value. The
catalogue and `stdlib.md` 14.2 needed no edit, because they already said this.

The workaround is reverted: the six three rail studies under
`tests/gate/studies/scripts/` name their middle rail `basisRail`, and the gate
compiles every one of them with nothing reported, which is now the regression
test from the outside. `tests/unit/check-handles.test.ts` holds all four handle
kinds named and unread with no warning, and an unread value beside them still
reported as OS8010.
