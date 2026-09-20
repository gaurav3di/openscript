# 0017 A close still working when the next bar closes again

Status: closed 2026-09-20
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

## How it was settled

Decision 44. **What is available to reduce is the settled position less
everything already working against it, and the scope is the run and the position
rather than the bar.** A bar-scoped rule is the special case of that one in which
nothing has been answered yet, so it subsumed `closable.ts`'s reading rather than
sitting beside it, and the bar keeps no record of its own any more: the only
question left that really is a bar's is OS7013, two opposite orders on one bar,
and `SentOnBar` moved to `refuse.ts` with that question alone.

The second obstacle this issue raised turned out not to be one. A row does not
need to carry its `qtyType`, because what the reduction has to be compared with
is not the row's quantity but the units the engine measured when the order was
sent, which it already worked out: the `Reduction` the bar's record carried now
rides on the row, in units, beside the row's filled quantity, which is in units
too. `workingUnits` is the difference, and it is zero on a row that has ended.
The narrowing to units that this issue expected is therefore not needed for the
count at all; it is needed only for the one shape below.

The rule a working order means to a later bar, which this issue said needed
deciding rather than assuming:

- A **partial fill** releases what settled. Three sold with one filled leaves two
  working, so the next close sends two.
- A **rejection**, a **cancellation** and an **expiry** release the rest, because
  nothing more is coming from an order that has ended, and the script may close
  again.
- A destination that **never answers** leaves the close working, and the strategy
  cannot close again, which is right: it already has a close going. `cancel()` is
  the way out this issue was worried about, and it works, because the
  cancellation comes back as a frame that ends the row. That is asserted end to
  end in `tests/engine/working.test.ts` rather than assumed.
- An **entry** working against the same leg adds nothing. Nothing has settled, so
  there is nothing extra to close.

The reproduction in this issue is `tests/engine/working.test.ts`, driven over
twelve bars rather than two, because the defect grows with the run and a test
over two bars would pass an engine that held only the bar after.

## The other shape, and where it now stands

Two shapes wait on the same missing fact. OS7005 is not raised yet, and its
deferral now names both of them rather than one:

1. A quantity stated on a close in a declaration counting in lots, cash or an
   equity percent may still take the position it is closing past zero. Unchanged,
   and `stdlib.md` 17.1 and 17.2 and OS7017 all say so at the point a reader
   meets it.
2. An entry that opposes what the leg holds in such a declaration cannot be
   divided into the half that closes and the half that opens. **The half of that
   which needed no lot size is held now**: minting a position reference needs no
   arithmetic, so the order carries one of its own in all four units rather than
   the outgoing position's. Before, at a lot size of twenty five, `buy(qty = 3)`
   then `sell(qty = 9)` had the destination take reference 1 from seventy five
   units to minus one hundred and fifty. What still waits is that the outgoing
   position is not closed by an order of its own, so its reference does not
   return to zero.

## The documentation this issue pointed at

`docs/strategies/orders.md`'s scale-out example is unchanged and its problem is
unchanged: it declares `qtyType = "lots"` and sizes from `pos.size`, which is in
units. It is the same missing fact, it cannot be corrected by editing the example
alone, and it is recorded here rather than in a third place.

