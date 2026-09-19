# 0001 Specification examples declare names the library already owns

Status: closed 2026-09-20, one edit outstanding
Opened: 2026-09-20
Decided: 2026-09-20, `spec/decisions.md` entry 22
Against: `spec/language.md` sections 3.10, 5.2, 7.5, 8.1, 8.2 and 11.4, and
`spec/errors.md` with `spec/errors.json`
Also touches: `spec/stdlib.md`, which defines the names that were taken, and
`scripts/check-examples.mjs`
Severity: the specification contradicts itself; every example named below is
OS2002 under the specification's own rule

## What is wrong

`spec/language.md` section 12.3 says that declaring a name in an inner scope when
the same name exists in an enclosing scope is OS2002, and section 12.4 says that
a built-in name lives in the global scope, so assigning to one is a shadowing
attempt and is OS2002 as well. Section 12.3 adds that a function parameter and a
function name are subject to the same rule.

Examples in that document and in the error catalogue break that rule, because
each of them declares a name the library already owns.

The report that opened this issue listed four sites. Running the shadowing check
over `spec/` reports 27 declarations: seven in `language.md`, thirteen in
`errors.md`, which carry into `errors.json` because the catalogue is rendered
from it, and seven more in blocks the checker already treats as deliberate.
The full list is below.

## The decision

`spec/decisions.md` entry 22 takes option 1 as it stands: the library keeps the
short name and the example takes a longer one. The reason is that these are the
examples a reader meets first, and a reader who copies one meets OS2002 on the
first compile with the specification's own line named as the mistake. Renaming
the library instead would move `change`, `count` and `highest` out of the scope
that should hold the short name, and allowing shadowing is the bug section 12.3
exists to prevent.

None of the replacement names is in the global scope. Each was checked against
the same 185-name list the checker builds from `stdlib.md` and `language.md`.

## Every site, and what it becomes

`spec/language.md`:

| Where | The name | Becomes |
|---|---|---|
| 3.10, both fenced examples that end with `low = 0` | `low` | `base` |
| 3.10, the example declaring `fn change(src) => src - src[1]` | `change` | `barChange` |
| 5.2, the same declaration and the `plot(change(hlc3), ...)` line that calls it | `change` | `barChange` |
| 7.5, the rollback example, all three lines | `count` | `barCount` |
| 8.1, `count = count + 1` and `count = count[1] + 1`, and the sentence below the block | `count` | `barCount` |
| 8.2, the first `var` example, both lines | `count` | `barCount` |
| 8.2, the second half of the same block, all three lines | `highest` | `runningHigh` |
| 11.4, the `barsSince` example, the declaration and both call sites | `barsSince` | `sinceTrue` |

The plot title `"Change"` in section 5.2 stays as it is. A title is a string,
not a name, and nothing in the global scope collides with it.

`spec/errors.md` and `spec/errors.json`, six entries, each in both files and in
both the `before` and the `after` block where the name appears, and in the
**Cause** or **Fix** prose wherever it repeats the name:

| Entry | The name | Becomes |
|---|---|---|
| OS1009 | the parameter `level` | `mark` |
| OS1011 | `highest` | `runningHigh` |
| OS2005 | the local `sum` | `runningTotal` |
| OS4012 | `order` | `sortOrder` |
| OS5008 | `log` | `logLines` |
| OS8011 | `count` | `barCount` |

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
The examples demonstrated the trap instead of avoiding it.

## What has been done

- `docs/language/functions.md` writes `fn barChange(src)`, and `docs/glossary.md`,
  `docs/troubleshooting.md` and `docs/reference/keywords.md` write
  `var barCount = 0`. This was done before the decision and is what the
  specification has now been brought to, so the two no longer diverge.
- The `spec/language.md` renames in the table above have landed.
- The `spec/errors.md` and `spec/errors.json` renames in the table above have
  landed.

## What is outstanding

One edit, and it is deliberately the last of the three: `scripts/check-examples.mjs`
still reads `const SOURCES = ['docs', 'examples']`. Add `'spec'` to that list and
delete the comment block above it that explains why `spec` is absent. Running the
check with `spec` added passes today, over 1314 examples, so the edit is
unblocked and this issue closes with it.

## Options, for the record

1. **Rename in the examples.** Taken. `base`, `barChange`, `barCount`,
   `runningHigh`, `sinceTrue`, and the six catalogue renames above. Smallest
   edit, keeps every surrounding sentence, and it quietly demonstrates the rule
   of section 12.4 at the moment the reader is most likely to reach for the
   short name.
2. **Rename the library functions.** Not taken. `change`, `count` and `highest`
   are the names a reader expects, the library is the scope that should hold the
   short name, and moving them would break every script written so far.
3. **Allow shadowing.** Not taken. Section 12.3 states the reason it is banned:
   two different variables with one name is the shortest path to a value that is
   right in one place and stale in another.

## Still on the table, and not part of this decision

Section 12.4 could carry the same list of easily collided names that
`docs/language/variables-and-scope.md` carries, or point at it. The list is short,
it is the practical content of the rule, and a reader who has seen it once stops
reaching for `sum`, `size`, `level` and `count`. The decision record does not
settle this, so it stays a suggestion against `language.md` rather than a
condition of closing.

## Closed

The names were renamed in the specification's own examples, and
`scripts/check-examples.mjs` now reads `spec/` alongside `docs/` and `examples/`.
1314 examples check against the 185 globals the library defines.

The check was deliberately blind to the specification while this was open, so
that a build passing could not be mistaken for the disagreement being settled.
That exemption is now gone, which is the part that matters: a document that
exempts itself from its own rules is the document nobody can trust.
