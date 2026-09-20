# 0019 Direction and attachment still read the leg's net, in two places

Status: open
Opened: 2026-09-20
Against: `src/core/engine/ledger/place.ts` (the closing side of a tagged close)
and `src/core/engine/ledger/holdings.ts` (a reference's side when a reduction
cannot be counted in units)
Also touches: `spec/stdlib.md` 17.1 and 17.2
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

## What closing it looks like

The direction of a tagged close taken from the signed holding of the tag it
names. A reference's side taken from a number that falls when a fill reduces it,
so that the two halves of the sum cannot drift apart.

Both are the same correction issue 0018 made, applied to the two places it did
not reach: one call, and three of the four quantity types.

## How it would be tested

The two scripts above, asserting on the destination: an order sent to flatten a
tagged part is on the side that reduces **that part**, and a position reference
that opened on one sign never ends on the other, in every quantity type rather
than in units. Neither behaviour is pinned by any test today: a mutation that
fixes each one leaves all 1414 tests passing.
