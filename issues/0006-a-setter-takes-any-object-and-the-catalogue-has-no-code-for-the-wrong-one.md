# 0006 A setter takes any object, and nothing can refuse the wrong one

Status: closed 2026-09-20, for the defect it names. The two neighbours at the
foot of the file are untouched and still open; nothing else records them.
Opened: 2026-09-20
Against: `src/core/check/library-output.ts`, the `draw` setters, and
`src/core/check/types.ts`, which has no union type
Also touches: `src/core/engine/library/objects.ts`, which is where the value
arrives at run time, and `spec/errors.md` OS3011 and OS8019
Severity: a script that is wrong in one of the two ways below compiles, runs,
draws nothing and reports nothing. Neither is a compiler defect and both are
input a user can write.

**Not raised yet.** OS8019 is in the catalogue and nothing raises it: the
checker does not follow a reference to a deleted object.

## What is wrong

Eleven of the fourteen `draw` setters declare their object parameter as `any`:

```
draw.setFrom(obj: any, t: number, p: number) -> nothing
draw.setColor(obj: any, color: color) -> nothing
```

`any` is not a type of the language (`check/library.ts` says so): it is a
parameter that takes whatever it is given. It is written here because the real
type is a union. `draw.setFrom` moves the first anchor of a line **or** a box,
`draw.setFillColor` fills a box **or** a polyline, and `Type` in
`check/types.ts` has no union, so there is nothing else to write. Three setters
whose type is a single kind do say so and are checked: `setAt` takes a `label`,
`setPoints` a `polyline`, `setExtend` a `line`.

Two things follow, and they are separate.

**A setter applied to the wrong kind of object compiles.**
`draw.setFrom(aLabel, t, p)` type checks. At run time it is a drawing object,
so the engine writes `t1` and `p1` onto a label, which has no such anchor, and
the host sees a label carrying two properties nothing draws. Nothing is said to
anybody.

**A setter applied to something that is not an object at all compiles.**
`draw.setColor(5, red)` type checks, because `any` takes a number as readily as
a box. At run time the value is not a reference, so the call does nothing and
the script goes on. This is the worse of the two: the script is plainly wrong
and the engine is plainly silent.

## Why the engine does not refuse it

The catalogue has the code for the first case and it is a compile-time one.
OS3011, "Argument has the wrong type", says `{name}'s {argument} is {expected};
{found} was given`, and its stage is `check`. That is the right diagnostic and
the right stage: the type of the argument is known before any bar runs.

There is no run-time code for either case, and this project does not invent one.
Raising OS3011 from the engine would file a check-stage diagnostic against a bar,
which would be a second, quieter lie. So the engine does what the rest of the
object path does with a value it cannot use: nothing. That is defensible for an
absent handle, which `language.md` 6.7 makes a gap, and it is not defensible for
a number.

## The resolution, in the order it has to happen

1. **Give `Type` a union of object kinds**, or a narrower thing that covers this
   case: a set of object kinds a parameter accepts. It is needed by eleven
   entries and by nothing else in version 1, which is an argument for the
   narrower thing.
2. **Write the real types into the eleven signatures**, and the wrong kind then
   becomes OS3011 at the call site, with no new code and no new stage.
3. **Then the engine's `drawing()` helper has one case left**: a value that is
   not a reference at all, which after step 2 can only be `none`, and which is
   already a gap rather than a refusal.

Until step 1 lands, the eleven entries are unchecked and this issue is the
record of it.

## Two neighbours found at the same time, and still open

**OS8019 is in the catalogue and nothing emits it.** It warns, at compile time,
that a name still holds an object the script deleted, which is the shape that
produces OS4005 many bars later. Its cause text in `errors.md` promises it
beside OS4005's. `errors.md` section 5 rule 1 says an entry no code path can
emit fails the build, and the check that would prove it does not exist yet.
Emitting it needs the checker to follow a `draw.delete(name)` and see whether
the same path assigns `none` to that name.

**`cell()` raises OS4004 for a cell outside its grid, and OS4008 exists for
exactly that.** OS4004 is an array index and its message reads
"Index 3, 4 is outside the array, which holds 14 elements", where OS4008 would
read "Cell (3, 4) is outside a table of 7 rows and 2 columns". The call site is
`src/core/engine/library/objects.ts`, in the table half of that file rather than
the drawing half.

**Not raised yet.** OS8019 and OS4008 are in the catalogue and nothing raises
them. The checker does not follow a reference to a deleted object. A cell
outside the declared grid raises the broader OS4004, which names an index rather
than the shape.

## How it closed

All three steps, in that order.

1. `Type` gained `{ kind: 'objects', objects }`, a set of object kinds and not a
   general union, because a set is what the eleven entries mean and nothing else
   in version 1 needs more. It appears in a library signature and never as the
   type of an expression, so nothing downstream holds one.
2. The signature strings write the real kinds, spelled `line | box`, and
   `stdlib.md` 14.4 spells them the same way in its own table. The set is the
   kinds whose creation call takes that property: only `draw.line` takes a
   `style`, only `draw.label` and `draw.box` take a `tooltip`, only a line and a
   box have a second anchor. Two documentation tables said otherwise, in the two
   rows that promised more than any kind carries, and they were corrected.
3. So `draw.setFrom(aLabel, t, p)` is OS3011 at the argument, naming the kinds it
   does take, and `draw.setColor(5, red)` is OS3011 as well. A declaration handle
   in the same position keeps OS3019, which is the code the catalogue's own
   example for it has always shown and which that example did not produce while
   the parameter was written `any`. The engine's `drawing()` helper has the one
   case left the issue predicted: a value that is not a reference, which can now
   only be `none`, and which is a gap rather than a refusal.

Tests: `tests/unit/check-calls.test.ts` drives a setter with a kind it does not
take, with a number, with a handle and with `none`, and asserts the code and the
argument's span.
