# 0016 Two closes on one bar cross zero, and one of them needs no quantity

Status: open
Opened: 2026-09-20
Against: `src/core/engine/ledger/place.ts` (`closableUnits`, and the `close`
case of the mapping) and `src/core/engine/ledger/ledger.ts` (`size`)
Also touches: `spec/stdlib.md` 17.2, `spec/errors.json` OS7017's cause and
`spec/decisions.md` decision 40, each of which now carries a sentence this
defect makes false
Severity: a leg that was long ends the bar short, under one position reference,
with no quantity written anywhere and nothing said

## What is wrong

Section 17.1 states it without qualification: **no order crosses zero.** Issue
0013 closed the half of this that a script reaches by writing a quantity. The
half it did not reach needs no quantity at all.

Measured against the built engine, on a leg holding three long:

```
if bar.index == 2
    close()
    close()
```

sends two sells of three under the same position reference. The destination
nets three short, the ledger folds to three short, and `pos.size` reads minus
three on the next bar. Five bare closes in a loop end the leg twelve short.

It is also reached with quantities that each pass the OS7017 ceiling on their
own: `close(qty = 2)` twice on a leg of three ends one short, and
`close(tag = "a", qty = 2)` followed by `close(qty = 4)` on a leg of four ends
two short.

## Why

`ctx.size()` is folded from settled fills and from nothing else, which is
correct and is what `stdlib.md` 17.8 says a position is. A row appended earlier
on the same bar carries a filled quantity of zero, so the second close measures
against the same position the first one did, and `closableUnits` subtracts
nothing for a close already mapped on this bar.

So the ceiling OS7017 applies is the right ceiling applied to the wrong number:
what the leg held when the bar began, rather than what is left to close after
the orders this bar has already committed to.

## The sentence this makes false

`stdlib.md` 17.2 gained a sentence this round reading, of a close with no
quantity, that "no order crosses zero (17.1), and this is the one call that
otherwise could, because every other quantity a close sends is one the engine
worked out from the leg's own settled fills". Two bare closes on one bar cross
zero using only quantities the engine worked out from settled fills, which is
the exact case that clause exempts. The same claim is in OS7017's `cause` and in
decision 40.

The specification is written first and the implementation follows it, so the
normative sentence is the thing that is wrong until the engine holds it.

## What closing it looks like

A close measured against what is left to close on this bar rather than against
what settled before it, so that the orders one bar sends can never sum past the
position they are reducing. Then the three documents say something true, and
17.1 holds on every path rather than on the paths that were tested.

Worth deciding at the same time, because they are the same sentence: OS7017 is
narrowed to a declaration whose `qtyType` is `"units"`, so a strategy declaring
lots, cash or an equity percent gets no protection at all, and
`docs/strategies/orders.md` teaches `sell(qty = abs(pos.size) + newQty)` as one
instruction the engine splits into two orders, which it does not.

## How it would be tested

Two closes on one bar, bare and with quantities, asserting the net quantity the
destination received never passes what the leg held, and that the leg is never
short after a call named close. The assertion is on the destination rather than
on the diagnostic, because a fix that refused the second close and a fix that
sized it correctly are both acceptable answers and the test should hold either.
