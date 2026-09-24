# 0020 The second engine implements neither arrays nor the log, and nothing said so

Status: closed 2026-09-24
Opened: 2026-09-22
Against: `engine/openscript/library/` (no array module) and
`engine/openscript/logbook.py` (written and wired to nothing)
Also touches: `spec/conformance.md` section 8, and Phase 6's gate in `ROADMAP.md`
Severity: the two engine gate reported agreement on a library the second engine
does not have, because no case reached it

Phase 6's gate is that the two engines agree on every conformance case. It has
been green. Writing the first `core` profile cases for Phase 7 showed why:
**no case reached an array or the log**, so neither engine was ever asked, and
the gate was measuring the part they both implement.

Four cases written against the first engine are held in this issue rather than
in `cases/`, because landing them turns `npm run suite:agree` red on a gap that
is real and is nobody's mistake in the suite. `conformance.md` section 10 says
the case is never the thing that gets changed, and these are not changed: they
are not shipped yet, and this issue is where they wait.

## What the second engine answered

```
array/element-limit: unsupported: the library function push
array/out-of-range:  unsupported: the library function push
log/no-side-effect:  unsupported: the library function print
log/print:           unsupported: the library function print
```

`OS6004` is the engine refusing a library function it does not have, which is
the honest answer. What is not honest is the identity beside it:
`engine/adapter.mjs` describes itself with `"profile": "strategy"`, and section
8 says a profile is cumulative, so `strategy` includes `core`, and `core`
includes the `limits` and `log` categories. The second engine claims a profile
it cannot meet.

## What is actually missing

**Arrays.** `engine/openscript/library/` has twenty four modules and none of
them is about arrays. There is no `push`, and by inspection no element access,
length or sort either. The first engine has them and `stdlib.md` specifies them.

**The log.** `engine/openscript/logbook.py` is written: it holds `PRINT`, a
`LOG_ENTRIES` table and a `Line` type carrying the bar index and the value,
including an absent one. Nothing imports it. Searching the whole engine for
`logbook` or `LOG_ENTRIES` outside that file returns nothing, so the module is
a complete description of a feature wired to no machine.

## What closes this

Arrays and the log implemented in the second engine, and then the four cases
below moved into `cases/` and the suite run in both modes. Until then the
second engine should either implement them or claim a profile it meets, and
today there is no profile below `core` for it to claim, which is itself worth
deciding.

## How it closed

**Arrays.** `engine/openscript/arrays.py` holds every call `stdlib.md` lists
for an array, written to agree with `src/core/engine/library/arrays.ts` to the
bit: the reductions accumulate in index order, `sort` uses the same total order
with absence last ascending and first descending, and an absent element makes a
reduction absent. It lives beside the library rather than in it, because the
library package raises nothing and an array call has two refusals of its own:
OS4004 for an index outside the extent, including an element taken from an empty
array, and OS5002 past the language's million element ceiling. Each is raised
without a position and the machine gives it the instruction's, through one
method that the `ARRAY` and `ELEM` instructions now share with every library
call. `Serving` joins the array calls as a table of its own, and
`engine/tests/test_arrays.py` holds every call.

**The log.** `print` is in the manifest, from `logbook.py`'s own row, and carries
the `log` effect, so the machine holds it until step 9 like an order. The
conformance run loop hands step 9's records to the side of the run that owns
each: an order to the desk and a `print` to a `Logbook`, which is the module
this issue found wired to nothing. `docs/integrating/running-a-strategy.md` tells
a host that drives the engine directly how to do the same.

**The cases.** The four held here are in `cases/array/` and `cases/log/`, word
for word, and `npm run suite:agree` passes on them in both engines: sixteen
cases pass where twelve did. Their feature matrix rows are `implemented`. Their
text is no longer repeated here, since a case written out in two places is two
places to keep in step.

**What this does not close.** The second engine still claims the `strategy`
profile and has no tables and no drawing objects, which the `chart` profile's
`surface` category covers. No case reaches them yet, so nothing fails, which is
the same shape this issue was. It is recorded as issue 0021 rather than left for
the first surface case to find.
