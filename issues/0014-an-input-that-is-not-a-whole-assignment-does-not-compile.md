# 0014 An input() anywhere but the whole of an assignment does not compile

Status: closed 2026-09-20
Opened: 2026-09-20
Against: `src/core/emit/outputs.ts` (`emitDeclarationCall`, the `input` case) and
`src/core/emit/values.ts` (`fold`, the `call` case)
Also touches: `spec/language.md` 13.2 and 13.4, `spec/decisions.md` decision 9,
and the OS3003 entry, all three of which say a script may write what the emitter
refuses
Severity: a script the specification allows, and the documentation teaches, is
refused at emit with OS6018, a code whose own message says the refusal is a
defect in the compiler

## What is wrong

`language.md` 13.2, on declaration options: "All option values must be
compile-time constants: literals, arithmetic over literals, or a call to
`input()`." 13.4 says an `input()` may appear anywhere at the top level of a
file. Neither is a corner: `decisions.md` decision 9 settled how the first one
reaches a compiled program, and the OS3003 entry's whole fix is to make the
option an input.

Measured against the built compiler, every one of these emits OS6018 and no
program:

```
study("Range", precision = input(2, "Precision"))     // 2.3, against 13.2
study("Range", overlay = input(true, "Overlay"))      // the same
study(input("R", "Title"))                            // the same
len = input(14, "Length") + 1                         // 3.5 check 5
len = 1 + input(14, "Length")                         // the same
e = sma(close, input(14, "Length") + 1)               // the same
```

These compile and run:

```
len = input(14, "Length")
plot(len + 1, "L", aqua)
```

So the rule is not about where an input may be read. It is that an `input()`
call which is not the entire right-hand side of a top-level assignment has
nowhere to go.

There is one option shape that does work, and it is what makes the gap easy to
miss. An input bound to a name and passed to a **later** declaration call is
carried correctly, and `tests/emit/declarations.test.ts` asserts it:

```
corner = input("topRight", "Corner", options = ["topLeft", "topRight"])
panel = table("P", rows = 1, cols = 1, position = corner)
```

That shape is not available to the `study()` or `strategy()` line itself, and
cannot be made available: the declaration is the first statement of the file, so
there is no name declared above it to pass. An option of the declaration is
therefore tunable only by writing the `input()` in place, which is the one
spelling that does not compile. Every declaration option is a literal today,
whatever `13.2` says.

## Why, in one sentence each

**The option case.** `optionField` in `emit/meta.ts` folds the written
expression and carries the value. `fold` resolves a **name** bound to an input
to `{ kind: "input", key }`, and its `call` case handles colour calls and
nothing else, so an `input()` written in place resolves to nothing and the
option is reported as an expression the format cannot carry. The format can
carry it: `fieldOf` already has the `input` case and decision 9 is what put it
there. Only the folding of the call is missing.

**The expression case.** `emitDeclarationCall` returns without emitting anything
for `input`, which is correct where the assignment is the declaration and the
statement is never emitted, and leaves the stack one value short everywhere
else. Verification catches it at 3.5 check 5, which is why the diagnostic is
OS6018 and not a diagnostic about the script.

## Why it was not fixed here

The check that found it, `scripts/check-examples-compile.mjs`, is about the
catalogue's worked examples, and both of these are the compiler rather than the
catalogue. The expression case is also not a one-liner: an `input()` read inside
an expression has to load its slot, and the same call written as the whole of
`name = input(...)` must go on emitting nothing, so the emitter has to tell the
two apart at the point where it has least context. That is a change to the
emitter with a shape worth deciding rather than guessing.

Two catalogue examples were moved off the defect so that the after blocks
compile, which is what the reader pastes: OS3003's fix now shows the literal
form, and OS1022's now deletes the trailing operator rather than completing the
expression. Both are correct fixes for their own codes. Neither states this
limitation, because the limitation is not theirs.

## What closing it looks like

`fold` resolving an `input()` call to the input it declares, so an option
carries `{ "input": key }` exactly as decision 9 says; and an input read inside
an expression loading its slot. Then OS3003's example can go back to the input
form its fix names, and `docs/inputs.md`'s "An `input()` may itself be the value
of a declaration option" stops being a sentence the compiler refuses.

## How it would be tested

The six lines above, compiled: each produces a program, and no diagnostic. Then
one run each, asserting that the option the program carries is the input's
resolved value and that the expression's value is the input's value plus one. A
test that only asserted the absence of OS6018 would pass against an emitter that
carried the wrong slot.

## How it closed

**The answer is that the two cases were never one question.** An `input()` call
declares a row of the settings dialog and a slot, and the engine writes that slot
at step 5 of every bar. It never compiles to an instruction of its own. The only
open question is whether the emitter must also put what the engine wrote on the
stack, and that is decided by where the call was written, not by anything about
the call. So the emitter does not work it out at the point with the least
context: `statements.ts` sends every statement that is entirely one declaration
call straight to `emitDeclarationCall`, and `emitCall` therefore reaches a
declaration call only where a value is wanted. An `input()` arriving through the
first emits nothing, as 12.2 says; one arriving through the second loads its
slot. The reasoning is written at `emitDeclarationCall` in
`src/core/emit/outputs.ts`, which is the function the next person will change,
and the read itself is in `src/core/emit/inputs.ts` beside the pass that gave
each input its slot.

**The option half.** `fold`'s `call` case resolves an `input()` to
`{ kind: "input", key }`, exactly as it already resolved a name bound to one, and
`fieldOf` carries it into the field as the `{ "input": "<key>" }` reference of
2.3. That is what decision 9 put in the format, and the engine and the chart
adapter already substituted it at load; nothing in either had to change.

**What now holds.** All six lines compile and carry the value:

```
study("Range", precision = input(2, "Precision"))
study("Range", overlay = input(true, "Overlay"))
study(input("R", "Title"))
len = input(14, "Length") + 1
len = 1 + input(14, "Length")
e = sma(close, input(14, "Length") + 1)
```

`tests/engine/inputs.test.ts` compiles each of them and runs it. The option tests
assert the reference and the value it resolves to, against a declaration that
writes three inputs of three types on one line, so an emitter that named
`inputs[0]` for every option fails rather than passing by coincidence. The
expression tests assert the number that came out of the run: 21 from a setting of
20, 15 from the default of 14, and, for the read one level down, a mean of 10.5
at a length of four and 10 at a length of five over closes of 1 to 12. One test
reads the whole path back out of the engine rather than out of this file: a grid
whose `rows` and `cols` are inputs written in place is four by five when the host
passes four and five, which is the setting, through the reference the field
carries, to the shape of the object the script writes cells into.

Each test was proved by mutation rather than by assertion. Folding that does not
resolve the call, folding that carries the input's default in place of the
reference, a read that emits nothing, a read of the slot next to the right one, a
read of `inputs[0]`, a reference to `inputs[0]`, and a declaration form that
emits the read as well were each put into the compiler, and each one made a test
fail.

The shape that already worked, an input bound to a name and passed to a later
declaration call, is asserted in `tests/emit/declarations.test.ts` and still
passes untouched.

One shape that is not an option value came back with the rest of it.
`plot(close, "C", fade(input(aqua, "Tint"), 50))` was refused for the same
reason, because the per-bar colour path of `stdlib.md` 14.2 emits the written
expression and the input in it emitted nothing. It compiles now and paints the
colour the setting gives it on every bar. The checker had always accepted the
expression; only the emitter could not carry it.

**The catalogue and the pages.** OS3003's worked example is back to
`study("Range", precision = input(2, "precision"))`, which is the form its own
fix sentence names, and `spec/errors.md` prints the same block.
`docs/inputs.md`'s "An `input()` may itself be the value of a declaration option"
is now a sentence the compiler agrees with. OS1022's example stays as deleting
the trailing operator, judged on its own merits: the statement was complete
before the stray operator, and the other half of its fix, supplying an operand,
invents a number the reader never wrote, which the diagnostics rule in
`CLAUDE.md` forbids.

**Nothing was widened.** 13.2's three forms and 13.4's placement are what is
implemented and nothing else. An expression over an input in an option, such as
`opacity = dim * 2` or `range = [input(0, "Low"), 100]`, is still refused rather
than written as an absent field, which is `issues/0003`. An `input()` inside a
block or a function is still OS3007, and one form of a function body that had
escaped that rule no longer does: `runBody` checked the single line form
`fn f(x) => x + input(3, "K")` as though it stood at the top level, so it
declared a settings row from inside a function and nothing said so. Both
spellings of a body are now the same construct to the placement rule, which is
what 13.4 already said, and `tests/unit/check-calls.test.ts` holds it.

## What this opened, and did not settle

Two things were found while closing it. Neither is decided here, and each is
worth its own issue rather than a guess inside this one.

**An `input()` written inside a read's expression has no rule.** 13.4 forbids a
block and a function and says nothing about the expression argument of
`req.timeframe` or `req.symbol`, which is neither: it is compiled as a separate
program over other bars, with its own frame. `stdlib.md` 15.4 says a **name** may
be read there when it is an input, and says nothing about a call. Today
`d = req.timeframe("1D", high + input(1, "K"))` compiled clean and emitted a body
whose stack does not add up, which no conforming engine will load and which this
compiler's own copy of 3.5 check 5 missed, because the underflow lands exactly on
`RET` and a `RET` reaches nothing after it. The emitter now refuses it: an
input's slot belongs to the top-level frame and no instruction reaches it from
another one. That is the compiler saying what it cannot carry, not the language
saying what a script may write. Whether a script may write it at all, and with
which code it is refused if not, is for the specification to settle.

**`var len = input(14, "Length")` reads a slot nothing writes.** It is accepted,
it compiles, and the name reads absent on every bar: `markDeclarationHandles`
gives the name a slot of its own, `buildInputs` gives the input a different one
because no binding adopted it, and nothing joins them. It is untouched by this
change, which deliberately leaves the `var` form exactly where it was rather than
routing it through the read and changing what it compiles to as a side effect.
