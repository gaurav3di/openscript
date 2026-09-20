# 0018 An order picks its position reference from settled fills alone

Status: open
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
