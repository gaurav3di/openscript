# 0013 A quantity stated on a close crosses zero, and nothing says so

Status: open
Opened: 2026-09-20
Against: `spec/stdlib.md` sections 17.1 and 17.2, and
`src/core/engine/ledger/place.ts`
Also touches: `src/core/engine/ledger/refuse.ts`, which is where a refusal would
go if the answer is that one belongs there
Severity: an order larger than the position it is closing is sent, so a leg that
was long ends the bar short, and the script is told nothing

## What is wrong

Section 17.1 states it outright: **no order crosses zero.** An instruction that
would take a leg from long to short is two orders, one closing the outgoing
position and one opening the replacement, each carrying its own position
reference, because a single order that crossed zero would leave a late fill with
no way to say which of the two positions it settled.

`close(qty)` does cross it. Measured against the built engine, on a leg holding
one unit long:

- `close(qty = 5)` sends one sell of five. The leg ends four short, under one
  position reference, with no diagnostic anywhere.
- `close(tag = "entry", qty = 1)` called on two bars, where the tag holds one
  unit and the first call flattens it, sends two sells of one. The second is an
  opening short wearing the tag of an entry that has already gone.

The quantity the script states is passed through as written, which is right on an
entry and is the whole of the defect here: the call that flattens is the one call
whose size has a ceiling, and the mapping applies none. The ceiling it does apply
is on the quantity the engine works out for itself, which is bounded by what the
leg holds and by what the tag holds, so the bug is only reachable through a
quantity the script wrote.

## Why it was not settled here

Three answers are available and they are different languages, not different
implementations of one:

1. **Clamp to what is held.** The script asked to flatten, the leg holds less
   than it asked for, and sending what is there is the nearest honest reading. It
   is also a quantity the engine decided, which is the thing section 17.1 spends
   its longest paragraph refusing to do anywhere else.
2. **Refuse it.** A quantity larger than the position is a sizing calculation
   that has gone wrong, in the same family as OS7004, and the order range has no
   code for it today.
3. **Read it as a reversal.** Send the two orders of section 17.1 with two
   position references. That makes `close` able to open a position, which is the
   naming mistake the order page already calls the most expensive one available.

Each needs a decision of its own and an entry in `spec/decisions.md`, and none of
them is a fix that can be made quietly inside one file.

## What closing it looks like

A decision that names one of the three, the edit to `stdlib.md` 17.2 that states
it in the `close` row, and, if it is the second, a code in the order range with a
message that says what was held and what was asked for.

## How it would be tested

A leg long one unit, `close(qty = 5)`, asserting the code and the span if the
answer is a refusal, or the quantity actually handed to the destination if it is
a clamp. Either way the assertion is that the leg is never short after a call
named close, which is the sentence in 17.1 the test exists to hold.
