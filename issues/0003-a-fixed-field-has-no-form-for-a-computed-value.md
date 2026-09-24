# 0003 A declaration field fixed before bar 0 has no form for a value computed from an input

Status: closed 2026-09-24
Opened: 2026-09-20
Against: `spec/language.md` section 13.2 and `spec/compiled-program.md` sections
2.3 and 3.5
Also touches: `spec/feature-matrix.md`, the rows `input/option-from-input` and
`input/option-reference-checked` in section 13, and
`examples/05-opening-range.oscript`
Severity: a shape a reader will write on the first day has no form to take, and
the three documents that describe the field do not say so in one voice

## What is wrong

Three documents describe what may sit in a declaration field that is settled
before bar 0, and they do not draw the same line.

`spec/language.md` section 13.2 says an option value must be a compile-time
constant: "literals, arithmetic over literals, or a call to `input()`". Three
forms, and the third one names a call rather than a value.

`spec/compiled-program.md` section 2.3 says the compiled program carries either
the effective value or the object `{ "input": "<key>" }`, naming one entry of
`inputs[]`. Two forms, and the second is a bare reference to one input, not to an
expression over one.

`spec/compiled-program.md` section 3.5, check 10, adds the condition the source
document never states: the referenced input's resolved value has to be
admissible in the field it lands in. A key no input declares is OS6018 and a
resolved value the field refuses is OS6019.

Read together, the admissible set is smaller than section 13.2's sentence
suggests. `precision = input(2, "Decimals")` is admissible, because it is one
input and a number lands in a number field. `precision = input(2, "Decimals") + 1`
is not, because arithmetic over an input is neither a value the compiler can fold
nor a reference to one input. Nothing says this, and the first sentence a reader
meets reads as though it were allowed.

## The line the example was over

`examples/05-opening-range.oscript` line 56 used to write

```
shade = input(true, "Shade the range")
fill(highPlot, lowPlot, fade(aqua, 93), opacity = shade ? 1 : 0)
```

`opacity` is a fixed field of the band's declaration: a number from 0 to 1, with
no per-bar channel beside it, unlike the colour arguments on the same call. The
line fails twice over. A ternary over an input is not a literal, not arithmetic
over literals and not a call to `input()`, so section 13.2 does not admit it and
section 2.3 has nothing to write; and even if the reference form were stretched
to cover it, check 10 would refuse the value, because the input resolves to a
bool and the field takes a number.

The example has been changed to declare the opacity directly:

```
shadeOpacity = input(1,  "Shading opacity, 0 turns the shading off",
                     min = 0, max = 1)
fill(highPlot, lowPlot, fade(aqua, 93), opacity = shadeOpacity)
```

This is a bare input reference whose resolved value is a number in range, so it
is admissible under both documents as they stand, and it keeps what the script
meant: zero is off, and the switch is a settings row. It costs the reader a
slider where a checkbox would have done.

## What is already settled

`spec/decisions.md` entry 9 settles the one-argument case: a field of `meta`, of
`meta.strategy`, or of any declaration in `outputs` other than `kind` may hold
`{ "input": "<key>" }`, resolved once at load. Its reasoning is that a settings
value is fixed for the whole run, so the reference costs one substitution at load
and nothing per bar, and that forbidding it would leave OS3003 with no fix to
name. That entry reached `table(position = corner)` and nothing wider.

Entry 3 settles a neighbouring case in the other direction: `signal`'s automatic
placement was removed rather than given a per-bar channel, on the ground that
inventing machinery to carry a value no script writes is the wrong repair. The
same argument is available here and is the reason this is filed rather than
taken.

## Which diagnostic refuses it is not settled either

OS3003 is titled "This option must be a constant" and its **Cause** carries the
enumeration this issue is about: options "must be literals, arithmetic over
literals, or an input()". By that sentence it is the code. Its **Message** is
"{option} is read once, before the first bar, so it cannot depend on bar data",
and that sentence is not true of `opacity = shade ? 1 : 0`: the value depends on
a settings row, not on a bar, and it is fixed for the whole run. A reader given
that message would look for bar data in the line and find none.

So whoever takes option 1 below takes a second edit with it: either OS3003's
message widens to name a value that is constant but is neither a literal nor one
input, or the refusal gets a code of its own. That is an edit to `spec/errors.md`
and to the matching entry of `spec/errors.json`, and it is why this is filed
rather than fixed here.

## Options

1. **Leave the rule as it is, and say so plainly.** `language.md` section 13.2
   gains the sentence the compiled format implies: a call to `input()` is
   admissible as the whole of the value and not as a term inside a larger
   expression, and the resolved value has to be admissible in the field. Nothing
   in the format changes, no engine grows a load-time evaluator, and a script
   that wants a tunable opacity declares a tunable opacity. The cost is that
   `opacity = shade ? 1 : 0` is refused for a reason a reader has to be told
   rather than one they can derive, and that a single switch cannot drive several
   fields at once.
2. **Add a fourth form: an expression over compile-time constants and inputs,
   folded at load.** The compiled program would carry an expression rather than a
   value or a reference, the engine would evaluate it after resolving inputs and
   before bar 0, and check 10 would apply to the result rather than to the
   input. This is what a reader expects to be able to write. It is also a second
   evaluator: a subset of the expression grammar that runs outside the machine,
   with its own rules about which calls are admissible in it, its own errors, and
   its own place in the load sequence of section 5.1. Two engines that implement
   that subset differently disagree before the first bar.
3. **Admit only a conversion of one input, not an expression over several.**
   A middle form: the field carries `{ "input": "<key>", "map": ... }` for a
   fixed set of conversions, such as a bool to two numbers. It is narrower than
   option 2 and it buys exactly the case that prompted this issue. It is also a
   vocabulary nobody has asked for, and the first script that wants two inputs in
   one field reopens the question.

Option 1 is what the documents say today and is what the example has been written
to. Option 2 is the honest reading of what a reader expects, and is a language
change with a compiled home to design; it belongs to a language version rather
than to a repair. This issue exists so that whoever takes it takes it deliberately
and not by widening a sentence in `language.md` until the contradiction stops
showing.

## How it closed

Option 1, recorded as decision 67, with the refusal given a code of its own.

Measuring before deciding showed the problem was not only prose. The checker
accepted every shape this issue describes, and the emitter then had nothing to
write: `precision = input(2, "Decimals") + 1`, the example's own
`opacity = shade ? 1 : 0` and `fade(aqua, t)` over a setting in a level's colour
were each refused with OS6018, the code that tells a reader the compiler is
defective. An input whose default was another input, `m = input(n, "M")`,
compiled, and its default was written as absent with nothing said.

OS3025, "A setting is part of a larger expression here", is raised at the
argument for all four. An `input()` or a name holding one is admissible as the
whole of the value, and an input's own default, bounds and step read no setting
at all. OS3003 keeps bar data, which its message is about, and its cause now
names OS3025 for the other case. `language.md` 13.2 says the rule in the
paragraph under the one this issue quoted, and `docs/inputs.md` teaches it.

Tests: `tests/unit/check-plot-options.test.ts` holds each of the four shapes,
the whole-input and literal-arithmetic forms that must pass, and bar data still
reported as OS3003.
