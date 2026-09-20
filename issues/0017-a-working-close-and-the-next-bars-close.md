# 0017 A close still working when the next bar closes again

Status: open
Opened: 2026-09-20
Against: `src/core/engine/ledger/closable.ts` (`committed`, which reads the
bar's own orders and not the ledger's working rows)
Also touches: `spec/stdlib.md` 17.1 and 17.2, which state the rule the bar now
keeps and say nothing about the run, and `src/core/engine/ledger/row.ts`, whose
rows do not carry the unit their quantity is counted in
Severity: a leg that was long ends short with no quantity written anywhere, on
two ordinary bars, whenever a destination is slower than the chart

## What is wrong

Decision 42 made the orders of one bar unable to sum past the position they
reduce. The bar is the scope, and across two bars the same defect is still
reachable. Measured against the built engine, on a leg holding three long, with
the close of bar 2 left working and both closes filled afterwards:

```
if bar.index == 2 or bar.index == 3
    close()
```

```
orders: buy 3@1/b0, sell 3@1/b2, sell 3@1/b3
pos.size by bar: 0, 3, 3, 3, -3
```

Both closes carry position reference 1, and the position that opened long three
ends short three. `stdlib.md` 17.1 says no order crosses zero, and reference 1
crossed it.

## Why

A position moves when a fill settles (17.8), and the close of bar 2 has not
filled. Bar 3 asks what the leg holds, is told three, and sends three. The
record decision 42 added is the bar's own, and it is emptied when the bar index
changes, which is correct for what that decision settled and is the whole of
what it settled.

## Why it was not settled with issue 0016

It is a different question. Counting the unfilled remainder of a working
reducing order against a later bar would change what a close means when a
destination has not answered: a strategy that closes again because the first
close was never acknowledged would find the second one silently sending nothing,
with the position still open and `cancel` the only way out. That is a rule about
what a working order means to a later bar, and it needs the same treatment issue
0013 and issue 0016 were given rather than being decided inside a fix for
something else.

There is a second obstacle, and it is concrete. A ledger row carries a quantity
and not the unit that quantity is counted in, so a row placed under a
declaration counting in lots cannot be compared with a position folded in units.
Whatever is decided here is therefore either held in units only, which is the
narrowing OS7017 already carries, or preceded by the row carrying its own
`qtyType`.

## The other shape, which is the same missing fact

Inside one bar, one shape of 17.1 is still not held, and it is written into
OS7017's catalogue entry and `stdlib.md` 17.2 rather than left to be found: a
quantity stated against a position that is still there, in a declaration whose
`qtyType` is `"lots"`, `"cash"` or `"equityPercent"`. `close(qty = 5)` against a
leg holding one unit under lots sends one sell of five and is not refused,
because the two numbers count different things.

What would have to exist first, in order:

1. **The lot size reaching the ledger.** The host's instrument record already
   carries `lotSize` (`host-interface.md` 4.1's record, beside `tickSize`, which
   the ledger is given and refuses against in OS7006). A ledger given it could
   compare a quantity stated in lots with a position folded in units. It would
   also settle OS7005, which is deferred on the same fact, so the two belong in
   one decision rather than in two.
2. **The money figures of `stdlib.md` 17.4**, for `"cash"` and
   `"equityPercent"`. Those are planned, and no lot size helps either of them.

## Where the documentation already mixes the two

`docs/strategies/orders.md`'s scale-out example declares `qtyType = "lots"` and
then writes `half = order.roundToLot(abs(pos.size) / 2)` followed by
`close(qty = half)`. `pos.size` is in units and a stated `qty` is in the
declaration's own unit, so on any instrument whose lot is more than one unit
that call asks to close many times what it means to. It is the same two kinds of
number, in the place a reader copies from, and it cannot be corrected by editing
the example alone: either the page changes its declaration to units, or the lot
size reaches the ledger and the language can say which unit `pos.size` answers
in beside a declaration that counts in lots. `order.roundToLot` is itself marked
planned, so nothing runs it today.

## How it would be tested

The reproduction above, driven with a host that acknowledges nothing on the
first close: assert that the orders carrying one position reference never sum
past what that position opened with, which is what
`tests/engine/crossing.test.ts` already measures within a bar.
