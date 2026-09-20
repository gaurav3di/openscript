# 0018 An order picks its position reference from settled fills alone

Status: closed 2026-09-20
Opened: 2026-09-20
Against: `src/core/engine/ledger/place.ts` (`entering`, `flattening` and the
reference each of them attaches), and `src/core/engine/ledger/positions.ts`
(`attaching`)
Also touches: `spec/stdlib.md` 17.1 and 17.7
Severity: a position reference holds both signs over its life, so a late fill
cannot say which position it settled, which is the one failure 17.1 names

## What is wrong

Three rounds have corrected **how much** a reducing order may send: against the
call, then against the bar, then against the run. None of them asked **which
position reference an order carries**, and that is the same defect one step
sideways.

`entering` decides whether an order crosses by comparing its side against
`ctx.size()`, which is folded from settled fills, and then attaches it with
`ctx.reference()`. When nothing has settled, an opposing entry is not seen as
crossing at all and goes on the reference the unanswered entry is already on.

Measured against the built engine, on confirmed bars, with the destination
silent:

```
if bar.index == 0
    buy(qty = 6)
if bar.index == 1
    sell(qty = 9)
```

Both intents are handed over on position reference 1. When both fill, reference
1 settles three short having opened six long. The same script with the entry
acknowledged first correctly sends a sell of six on reference 1 and a sell of
three on reference 2, which is what 17.1 describes.

Three more shapes reach it, all measured:

- The mis-classified entry records no reduction, so a later `close()` holds
  nothing back for it: the destination is handed buys of six and sells of
  fifteen where the script asked to be three short.
- A fresh reference minted for an opposing entry becomes the attaching one, so a
  later order that agrees with the leg's net is attached to a reference carrying
  the other sign, taking it from nine short to three long.
- `flattening` sizes against the whole leg and attaches to one reference, with
  nothing asking whether that reference can absorb the leg's closable quantity.
  Reachable through `order.reverse` and through a bare `close` on any leg
  holding more than one position.

None of these is a regression. The same branches are at `cc79ff9` and earlier;
they were never run, because every fixture acknowledges the entry before the
opposing order arrives.

## Why the tests did not see it

Every test of the opposing order uses `close()` for it, and a close is routed
through the reducing path. An opposing **entry** takes the adding path, which is
where all four shapes live. The repository's own `crossings()` helper in
`tests/engine/orders-support.ts` would have caught the first shape on the bars
it was given; it was never given them.

## What closing it looks like

An order's reference, and the decision that it adds or reduces, taken from what
the leg actually holds including what is working, rather than from the settled
net alone. That is the same correction issue 0017 made to quantity, applied to
attachment. A reducing order that spans two positions is two orders, for the
reason 17.1 already gives.

## How it would be tested

Assert on the destination, per position reference, over the life of a run: a
reference that opened on one sign never ends on the other. The fixtures must
include an opposing **entry**, not only a close, and a destination that answers
late, out of order, and not at all.

## How it was closed

**An order's position is decided from what the leg holds including what is
working.** `src/core/engine/ledger/holdings.ts` reads the ledger's rows beside the
position book and answers, per position reference, two numbers: what an opposing
order may take from it, settled and working together, and what has settled on it
that nothing is already working against. `src/core/engine/ledger/sizing.ts`
divides every order across those positions, oldest first, and opens whatever is
left on the open position of its own side or on one minted for it.

All four shapes measured in this issue are now fixtures.

1. `buy(qty = 6)` and then `sell(qty = 9)` against a silent destination sends a
   sell of six on reference 1 and a sell of three on reference 2, which is what
   the same script sent when the entry was acknowledged first. **The orders a bar
   sends no longer depend on how fast the destination answers**, which is the
   property the suite asserts across five destinations.
2. The reduction the split records is what the close after it is held back by, so
   the runaway sells are gone: six and three, and the close sends nothing.
3. An order that agrees with the leg's net is divided against the positions that
   oppose it before it adds to anything, so `buy(qty = 12)` is nine against the
   short position, which ends it, and three into the long one.
4. `flattening` divides across the positions holding the leg's own side rather
   than attaching the whole of it to one, so a close and an `order.reverse` each
   send one order per position they reduce.

Two things beyond the four were the same root and were corrected with it.
`closable.ts` counted only the orders that carried a reduction when they were
sent, so an entry the leg has since moved past was not held back: `close(qty =
12)` against a leg whose own unanswered buy was already bringing five was
accepted. And whether an order adds or reduces is now the mapping's answer rather
than the leg's net, which reads flat while an entry is unanswered and called every
order an entry; pyramiding counts the entries the leg holds in a direction, across
every position on that side.

## What is not kept, and what has to exist first

**A reference settles on the side it did not open on only when an order on it was
never answered in full**, which is an order still going or one that ended
rejected, cancelled or expired with part of its quantity unfilled. An entry
divided against an unanswered entry is placed against units that were promised
and may not arrive. Holding it back until the destination answers is an engine
that stops trading when a destination is slow, which is worse, and 17.1's own
reason is kept either way: every order names exactly one position, so every fill
says which position it settled. Measured over six thousand generated runs: where
every order of a reference was answered in full, no reference ended on the other
sign; every case that did had an order that was not.

**Outside `qtyType = "units"` an instruction that opposes what the leg holds is
still one order**, because dividing a stated quantity needs the instrument's lot
size and no leg is given one. What is now held without it, in every unit: the
order carries a position reference of its own whether or not anything has settled,
which is the shape of this issue wearing another unit and was not held before;
and the outgoing position is named again, because a close works its own quantity
out in units and is divided across the positions holding the leg's side, so it
returns to zero as soon as the leg's net comes back to that side. What is not
held is the instruction itself closing it, and on a leg whose net never returns
there the position is carried for the life of the run. `errors.md` OS7005, which
nothing raises yet, carries that sentence, `stdlib.md` 17.1 and 17.7 carry it,
and `tests/engine/ending.test.ts` asserts both halves rather than describing
them.

## Where it is tested

`tests/engine/attaching.test.ts` is which position an order is sent against, and
`tests/engine/ending.test.ts` is whether every position can get back to zero and
what the leg reports while more than one is open. Both use the repository's own
`crossings` helper, on the bars it was never given, and both are written twice:
once with an opposing close and once with an opposing entry, against a
destination that answers late, out of order, partially, with a rejection, and not
at all. `reversed` in `tests/engine/orders-support.ts` is the same property read
from the ledger after the frames have folded rather than from the destination's
inbox.
