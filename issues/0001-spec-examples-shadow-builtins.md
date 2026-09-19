# 0001 Specification examples declare names the library already owns

Status: open
Opened: 2026-09-20
Against: `spec/language.md` sections 5.2, 7.5 and 8.2
Also touches: `spec/stdlib.md` section 9
Severity: the specification contradicts itself; every example named below is
OS2002 under the specification's own rule

## What is wrong

`spec/language.md` section 12.3 says that declaring a name in an inner scope when
the same name exists in an enclosing scope is OS2002, and section 12.4 says that
a built-in name lives in the global scope, so assigning to one is a shadowing
attempt and is OS2002 as well. Section 12.3 adds that a function parameter and a
function name are subject to the same rule.

Three examples in the same document break that rule, because each of them
declares a name that `spec/stdlib.md` section 9 defines as a library function.

| Where | The example line | Collides with | Defined at |
|---|---|---|---|
| `language.md` 5.2, line 533 | `fn change(src) => src - src[1]` | `change(src)` and `change(src, len)` | `stdlib.md` line 489 |
| `language.md` 7.5, line 942 | `var count = 0` | `count(cond, len)` | `stdlib.md` line 500 |
| `language.md` 8.2, line 1021 | `var count = 0` | `count(cond, len)` | `stdlib.md` line 500 |
| `language.md` 8.2, line 1024 | `var highest = none` | `highest(src, len)` | `stdlib.md` line 485 |

The fourth row was not part of the report that opened this issue. It sits in the
same fenced block as the third and has the same cause, so it is recorded here
rather than left for a second pass.

Line numbers are as of the date above and are given to make the sites easy to
find, not as a stable address.

## Why it matters

These are the examples a reader meets first: the one that introduces series
parameters, the one that introduces the rollback rule, and the one that
introduces `var`. A reader who copies any of them meets OS2002 on the first
compile, and the error message will name the specification's own example as the
mistake. That is the worst possible place for the language to disagree with
itself, because the reader has no way yet to tell which of the two documents is
right.

The names involved are exactly the ones section 12.4 warns about: short, obvious
words that a script wants for its own values and that the library took first.
The examples demonstrate the trap instead of avoiding it.

## What has already been done

The documentation set has been repaired to match the rule rather than the
examples, in this pass:

- `docs/language/functions.md` now writes `fn barChange(src)`.
- `docs/glossary.md`, `docs/troubleshooting.md` and `docs/reference/keywords.md`
  now write `var barCount = 0`.

The documentation therefore no longer matches the specification's examples word
for word. That divergence is deliberate and is the reason this issue exists: the
documentation follows the specification's rule, and the specification's examples
do not yet.

`scripts/check-examples.mjs` reads every fenced example in `docs/` and in
`examples/` and fails the build on any declaration that shadows a global. It does
not read `spec/`, for the same reason this issue is open rather than closed by a
quiet edit: turning it on over the specification would fail the build on a defect
the specification has not yet decided how to fix. When this issue closes, add
`spec` to the `SOURCES` list in that script and delete the comment above it.

## Options

1. **Rename in the examples.** `fn barChange(src)`, `var barCount = 0`,
   `var runningHigh = none`. Smallest edit, keeps every surrounding sentence,
   and matches what the documentation now says. It also quietly demonstrates the
   rule of 12.4 at the moment the reader is most likely to reach for the short
   name.
2. **Rename the library functions.** Not proposed. `change`, `count` and
   `highest` are the names a reader expects, the library is the scope that should
   hold the short name, and moving them would break every script written so far.
3. **Allow shadowing.** Not proposed. Section 12.3 states the reason it is banned:
   two different variables with one name is the shortest path to a value that is
   right in one place and stale in another.

Option 1 is recommended.

## Suggested addition while the examples are being edited

Section 12.4 could carry the same list of easily collided names that
`docs/language/variables-and-scope.md` carries, or point at it. The list is short,
it is the practical content of the rule, and a reader who has seen it once stops
reaching for `sum`, `size`, `level` and `count`.
