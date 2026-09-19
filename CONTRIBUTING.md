# Contributing

Thanks for looking. This is early, so the most valuable contributions right now
are to the specification rather than to code.

## The rules that are not negotiable

**1. Name nobody.** No other product, platform or company appears in source,
comments, documentation, examples, test names or commit messages. OpenScript
explains itself on its own terms. A build that names someone else fails:

```bash
node scripts/check-names.mjs
```

If you need to refer to prior art, describe it generically: "an existing chart
scripting language", "a copyleft licensed runtime".

**2. Original work only.** Do not copy text, documentation, error messages or
implementation from any other project into this one, and do not paste code you
do not have the right to relicense under Apache-2.0. If you ported an algorithm
from a published source, record the source, the author and the licence in the
file header, and only if that licence permits it.

**3. No `eval`.** The compiler emits a compiled program, which is data. Nothing
in this repository turns text into executable code at runtime. This is what lets
OpenScript run inside applications with a strict content security policy, and it
is not a preference.

**4. Every error is documented.** An error the compiler can emit must exist in
the error catalogue with a code, a cause, a fix and an example, and must have a
test that produces it. The build enforces both directions.

**5. Engines must agree.** Any change that alters a computed value has to keep
every engine in step. Cross-engine disagreement on the conformance suite blocks
a release.

## Writing style

- Plain text. No emoji, no decorative punctuation.
- Comments explain why, not what. If a line needs a comment to say what it does,
  rename something instead.
- Error messages tell the reader what to do. An error that cannot suggest a fix
  is a bug in the error.

## Commits

Commit when a validation passes, not when a session ends. Each commit should
leave the build green.

## Tests

Three layers, and a change usually touches more than one:

1. Unit tests per compiler stage and per standard library function.
2. Golden numbers: a study computed by OpenScript against an independently
   written reference, matched to the last decimal.
3. The conformance suite: script, input bars, expected output. This is the
   public contract, so adding a case is a deliberate act and removing one is
   close to a breaking change.

## Before opening a pull request

```bash
node scripts/check-names.mjs
npm test
```
