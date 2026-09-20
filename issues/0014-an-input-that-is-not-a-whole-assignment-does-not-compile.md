# 0014 An input() anywhere but the whole of an assignment does not compile

Status: open
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
