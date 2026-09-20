# 0015 Seven refusals taught as current behaviour are exercised by nothing

Status: open
Opened: 2026-09-20
Against: `tests/`, and the seven entries in `spec/errors.json` whose `test` is
now `null`
Severity: seven codes are raised by a call site, documented in the present tense,
and no test anywhere would notice if the call site stopped raising them

## What is wrong

Every entry in the catalogue used to carry `"test": "tests/errors/<CODE>"`. That
directory has never existed, in any commit. Resolving the field against the tests
that do exist left twenty-four codes with nothing to point at. Seventeen of those
are deferred, so nothing raises them and nothing could test them. Seven are not:

| Code | Title | Stage |
|---|---|---|
| OS2010 | This name is not a function | check |
| OS4003 | A whole number was required here | runtime |
| OS8007 | A plot sets the price pane's own formatting | check |
| OS8012 | An ordered comparison against none is always absent | check |
| OS8015 | This loop never runs | check |
| OS8016 | Unreachable code | check |
| OS8017 | The condition is constant | check |

Each is raised by a call site that `scripts/check-raises.mjs` can see at the
stage its entry names, so none of them is the promise-nothing-keeps defect that
check exists for. What none of them has is a test: no file under `tests/` writes
the code, so no assertion anywhere is about it, and a refactor that stopped
raising one would take the whole suite green with it.

Five of the seven are warnings in the OS8xxx range, which is the range a reader
is least likely to notice going missing: a warning that stops appearing looks
exactly like a script that stopped having the problem.

## How it was found

`scripts/check-catalogue-tests.mjs` resolves every pointer and prints the codes
that have none, split into the deferred and the current. It prints them on every
run rather than only when something is wrong, because this list is not a failure,
it is a fact about coverage that is worth seeing.

## What closing it looks like

Seven tests, each asserting the code and the span, and each written against the
wrong implementation it is meant to catch. Five of them are a script and a
compile. OS4003 needs a bar, and OS2010 is one line. Then the seven entries point
at them and the `null` is gone, which the check enforces from the other side: the
day a test names one of these codes, the `null` fails the build.

Two of them have a worked example that is already proved by
`scripts/check-examples-compile.mjs`, so the test is the example plus a span.

## How it would be tested

It is the test. The check that found the gap is what holds it closed.
