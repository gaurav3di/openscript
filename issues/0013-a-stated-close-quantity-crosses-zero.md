# 0013 A quantity stated on a close crosses zero, and nothing says so

Status: closed 2026-09-20
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

## How it was settled

**Answer two, refuse it.** A `qty` written on a close may not be larger than
what that close is closing, which is the whole leg where no tag is named and the
part one tag entered where one is. Larger is OS7017, raised at the call before
the call is mapped, with a message naming what was asked for and what is held.
`spec/decisions.md` decision 40 carries the reasoning and the edits; the short
version is the rule this repository keeps arriving at. An argument the script
wrote is a claim, and a false claim is refused; an argument it did not write is
the engine's to work out. Clamping would be a fourth instance of the wrong
belief that OS7002, OS7004 and OS7016 each refuse, and reading the call as a
reversal would let `close` open a position.

The refusal is a refusal in the full sense: the call reaches no destination, and
a bar that places a good order and then meets it sends nothing at all, the good
order included. `close()` with no quantity is untouched, and closing a tag that
holds nothing with no quantity is still silent and idempotent.
`tests/engine/closing.test.ts` holds both halves, and holds them beside each
other on purpose, because the pair is what a future fix to this area would
break.

**The consequence, recorded rather than discovered.**
`close(tag = "entry", qty = 1)` on a tag that has already flattened now refuses
while `close(tag = "entry")` on the same tag stays silent. `stdlib.md` 17.2 says
why in the close paragraph, and so do the two documentation pages that teach the
call.

**Where the comparison is not made.** Only where the stated quantity and the
folded position count the same thing, which is a declaration whose `qtyType` is
`"units"`. A position is folded from filled quantities and a stated quantity is
in the declaration's own unit (`host-interface.md` 7.1), so in lots, cash or
equity percent the two are different kinds of number and the lot size that would
join them is the fact OS7005 has been deferred on from the beginning.
`refuse.ts`'s header lists it beside the other rules that file will not evaluate
truthfully, because a refusal with a wrong number in it is worse than the
silence it replaced.

## What this opened, and did not settle

**`sell(qty = abs(pos.size) + newQty)` is taught as a reversal and is not one.**
`docs/strategies/orders.md` says of it: "One instruction the engine splits into
two orders, because no order crosses zero." The engine splits nothing. `entering`
in `place.ts` maps a `buy` or a `sell` to one order at the quantity written, with
one position reference, so the page's second way of reversing sends a single
order across zero and the page's own table says it does not. Either the page is
wrong or the mapping is, and which of the two is a question about what an entry
means rather than about what a close means: refusing it here would refuse a
script the page taught, and splitting it here would make an entry able to close
a position. It needs an issue and a decision of its own, and it is not settled by
this one.
