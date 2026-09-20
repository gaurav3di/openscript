# 0019 Direction and attachment still read the leg's net, in two places

Status: closed 2026-09-20
Opened: 2026-09-20
Against: `src/core/engine/ledger/place.ts` (the closing side of a tagged close)
and `src/core/engine/ledger/holdings.ts` (a reference's side when a reduction
cannot be counted in units)
Also touches: `spec/stdlib.md` 17.1, 17.2 and 17.7, and `spec/host-interface.md`
7.1
Severity: a call named close adds to the part it was told to flatten, and a
position reference opens long and settles short with every order answered

Issue 0018 corrected which position an order is sent against. Two shapes were
scoped out of that correction, one by unit and one by direction, and each is
reachable from an ordinary script.

## One: a tagged close takes its direction from the leg

`place.ts` takes the direction of a tagged close from the leg's net rather than
from the part the tag names, so `close(tag)` can send an order that **adds** to
that part.

Measured against the built engine, in units, with the destination answering:

```
if bar.index == 0
    buy(qty = 10, tag = "A")     -> fills
if bar.index == 1
    sell(qty = 14, tag = "B")    -> sell 10 on reference 1, sell 4 on reference 2
                                    the reference 1 half is rejected, the other fills
if bar.index == 4
    close(tag = "B")
```

The leg holds reference 1 at ten long under tag A and reference 2 at four short
under tag B, a net of six long. The close of tag B sends a **sell of four, on
reference one**. Tag B goes from four short to eight short, tag A's long is cut
from ten to six, and the leg's net moves from six to two.
`close(tag = "B", qty = 4)` does the same.

Section 17.2 says the call flattens "the part of it carrying one tag", and says
of the alternative reading that it "would let close open a position". Here a
close opens position. `closable.ts` already computes the tag's own signed
holding, so the number is present and only the direction is not taken from it.

## Two: a reference's side, outside units

`holdings.ts` reads a reference's side from settled plus working, where the
working part of a reduction the engine cannot count in units is what was left to
close when that order was **sent**, rather than the order's own quantity. A
second stated close on the same reference carries zero there, because the first
already spoke for the whole leg, yet it still fills and still reduces what has
settled. The settled part falls with no matching fall in the working part, the
sum goes negative, the reference reads as the side it is not on, no opposing
reference is found, and an opposing entry is handed the outgoing reference as an
adding order.

Measured in lots, cash and equity percent, with every order answered in full and
in order, nothing rejected, nothing over-filled and nothing left working:

```
strategy(qty = 3, qtyType = "lots")
bar 0   buy(qty = 10)
bar 1   close(qty = 1)
bar 2   close(qty = 1)
bar 4   sell(qty = 9)
```

All four orders go on reference 1, which opens long and settles short. In units
the same script is correct, which is how the ingredient list is known to be
exact: it does not reproduce with one stated close, nor with a bare second
close, nor in units.

## What was decided

**The side of a close comes from the part it is flattening**, which is the tag's
own signed holding where a tag names one and the leg where none does. A part
whose rows have netted to nothing has no side and the call sends nothing, which
is the idempotence 17.2 already described. The same correction runs through
everything that measures a part: what is already working against it is counted
on the part's own side, so a second `close(tag)` holds back the close already on
its way, and the leg bounds a part only where the two are on one side, because
closing a part the leg is not on moves the leg away from zero rather than
through it. `spec/stdlib.md` 17.2 carries all three.

**A reference's side is read from what has settled on it and the orders' own
sizes**, which fall together as a fill arrives. What a reduction claimed of the
leg when it was sent is a different number answering a different question, how
much of a part is already spoken for, and `closable.ts` is now its only reader.
The field is called `claimed` rather than `units`, beside the row's own `units`,
so that the two cannot be confused again by a reader in a hurry.

Two more were found while fixing these, both by the property fuzz this issue
asked for, and both are the same sentence again: **a close is sent against the
position it is closing.**

**A close the engine cannot size goes on the oldest position holding the side it
reduces**, whether or not what has settled there is already inside an order the
destination still has. That exclusion belongs to a close that works its own
quantity out; one that states a quantity in lots is not choosing a number.
Taking the book's answer alone handed such a close the reference an entry was
opening on the other side, which is a call named close adding to a position.
Where the leg holds no position on that side, the call sends nothing.

**A bracket names the position it protects, and no position where there is
none.** `bracketing` minted a reference when the leg was flat, so a script whose
first order call is `exit()` or `order.bracket()` burned reference 1 on an
instruction that appends no row and moves nothing: the entry after it opened on
reference 2, and the bracket carried a reference no order ever shared.
`spec/host-interface.md` 7.1 says what reaches a host now, because a host is the
party that has to read it.

## The lead this issue left, answered

`order.reverse`'s opening half mints a reference unconditionally and never goes
through `entering`, so it is the one entry that never passes the division issue
0018 installed. **It is correct by construction**, and the alternative is a
defect. A reference minted there has nothing on it, so the order cannot cross it
and cannot settle it on a side it did not open on. Routed through `entering`
instead, and run: the orders of a call are all mapped before any of them appends
a row, so the closing half is not in the ledger yet and the opening half is
divided against the very position the closing half is flattening.
`buy(qty = 10)` then `order.reverse()` became two sells of ten on reference 1,
nothing at all opened the replacement, and reference 1 opened ten long and
settled ten short. Three tests already in the suite fail on that, and
`tests/engine/parts.test.ts` now pins the reference beside the quantities.

What it does depart from is 17.7's "joins the position on its own side": it
mints even where the leg holds a position on that side already. That costs an
extra reference and no correctness, every reference it makes can still be
closed, and it is recorded in decision 52 as decided rather than left to be
discovered.

## What is not pinned

`workingUnits` no longer subtracts a fill from a claim the engine could not
count in units. Putting that back fails no test, because `holdings.ts` blocks a
reference carrying an unreadable reduction and the difference is invisible at
the destination in every shape that could be built for it. It is written down
here and in decision 52 rather than left for the next reader to find.

## Where it is tested

`tests/engine/parts.test.ts` is the part a call names and the position each of a
call's orders carries: nine fixtures on the destination's own inbox, one of
them folding the tag's holding from the fills the destination answered rather
than from anything the engine kept.

`tests/engine/fuzz.test.ts` and `tests/engine/fuzz-support.ts` are the
properties, over two thousand generated scripts of ten bars each, against a
destination that answers late, partially, out of order, with rejections, with
more than was asked, with a frame repeated, with a stale cumulative quantity
restated after a later one, and not at all. The oracle is folded from what the
host sent and what it answered, and reads nothing the engine kept.

Every fix here was mutated back one at a time and the suite run against each.
The examples and the fuzz between them catch all of them, and the fuzz alone
catches the two this issue was opened for.
