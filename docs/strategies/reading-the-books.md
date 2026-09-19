# Reading a strategy's own books

By the end of this page you will be able to read a strategy's own books from
inside a script: the order rows it keeps, the fills folded into them, and the
positions those fills add up to. You will also know why one fill can be reported
twice, what stops the second report from counting, and why no call anywhere in the
language hands you the account's own position.

## Every strategy keeps its own books

**Each strategy owns its own order and fill ledger.** It is the strategy's record
of what it has actually done, it is what every position and profit figure in the
language is folded from, and it is per strategy rather than per account.

The reason is the one [orders.md](./orders.md) opens with, and it is worth having
in one sentence here too: an account position is held per contract, not per
strategy, so a second strategy on the same contract, a trade placed by hand, or
this same script started twice all land in that one row, and a strategy that read
the row would be computing against somebody else's trade. Two such strategies undo
each other all day and neither is wrong from where it is standing.

So the books are the strategy's own, and three things follow.

- **A strategy's position is folded from the strategy's own settled fills and from
  nothing else.**
- **Every profit figure comes from those same fills.** `pos.netProfit`,
  `pos.openProfit`, `pos.equity` and `book.profit` are all sums over this
  strategy's fills. None of them is read from an account position row.
- **Where the account holds a position in a contract this strategy also holds, the
  run's record says so and carries the account's quantity beside the strategy's.**
  The language never divides a shared position between its owners.

## The order row

The ledger holds one row per order placed. A row is appended when the order is
sent and is never rewritten in place: each frame from the destination appends a
revision, and the row's current fact is the fold of its revisions, so the sequence
that produced a position can be replayed and audited rather than inferred.

| Field | Holds |
|---|---|
| `id` | The destination's own opaque order id, exactly as given, as a string the engine never parses |
| `tag` | The tag the script placed the order with, `""` when it named none |
| `leg` | The leg the order belongs to |
| `positionRef` | The position this order settles against |
| `symbol`, `exchange` | The contract actually sent, after the leg resolved |
| `product` | The product actually sent |
| `side`, `qty`, `type`, `price`, `trigger` | The order as it left the engine |
| `status` | The folded status |
| `filledQty` | Cumulative filled quantity, never a delta |
| `avgFillPrice` | The destination's average price over `filledQty`, absent while `filledQty` is `0` |
| `rejection` | The destination's own rejection text, `""` when there is none |
| `placedAt`, `updatedAt` | When the order was sent, and when a frame last changed the row |

Three of those fields exist because the short version loses money.

**The product is recorded as sent, not as declared.** A product is translated per
destination, so the word a strategy carries and the word that reached the
destination are not always the same, and a position reconciled against the declared
word is reconciled against something nobody traded. `leg.product(name)` returns the
word that was sent.

**The symbol and exchange are recorded as sent.** A leg that resolved a relative
contract carries a name the source never wrote, and that name is the only one a
statement can be matched against. `leg.symbol(name)` returns it.

**Every order carries a position reference.** A position reference is minted when a
leg goes from flat to holding, and it ends when that position's quantity returns to
zero through settled fills. During a flip a leg holds two at once, the outgoing one
and its replacement, which is why a flip is two orders and not one. A fill settles
the position its own order names, never whichever position is current, because a
fill that arrives late would otherwise be applied to the position that replaced the
one it belonged to.

## Statuses, and what terminal means

The ledger's `status` is one of six words:

| Status | Means | Terminal |
|---|---|---|
| `"placed"` | Sent, and the destination has not answered yet | No |
| `"open"` | Live at the destination | No |
| `"triggerPending"` | Waiting for its trigger | No |
| `"complete"` | Done | Yes |
| `"rejected"` | Refused | Yes |
| `"cancelled"` | Withdrawn | Yes |

A destination with words of its own maps each of them onto one of the six in its
adapter and carries its own word through to `rejection` and the log. The mapping is
the adapter's because a status vocabulary is exactly the kind of thing that differs
per destination and must not reach the language. Six words mean the same thing
everywhere a script runs, which is what lets one script be read by somebody who
has never seen your destination.

A status is terminal when it is one of the last three. No further frame of a
terminal order reaches the fold, and a terminal order's row never changes again.
That is the property a script leans on when it stops watching an order.

## Frames are cumulative, and that is why a fill can be reported twice

**A frame from a destination is cumulative, not a delta.** It states the order's
total filled quantity so far and the average price over that total, not what
happened since the last frame.

Frames repeat, arrive out of order and arrive twice. A session that reconnects
resends its last frames. A destination that is unsure whether you heard it says it
again. Two frames cross in flight and the older one lands second. None of that is a
fault, and all of it is ordinary.

This is the fact a reader writing a strategy has to hold on to, because it is why
the same fill can appear twice in what the destination tells you, and why an engine
that added each frame's quantity to a running total would double a fill and report a
position the strategy never held. The protection is not a habit anybody has to
remember. It is in the fold.

The fold of a frame into a row is exactly this:

1. **Locate.** The frame names a row by the destination's order id. A frame that
   names no row in this strategy's ledger is refused and recorded, and nothing is
   folded. It is not an order this strategy placed.
2. **Filled quantity.** The row's cumulative quantity becomes the greater of what
   it held and what the frame reports, and the difference is the delta. The
   cumulative quantity never decreases, so a frame reporting less than the row
   already holds contributes a delta of zero.
3. **Average price.** When the delta is positive the row takes the frame's average
   price, which the destination computed over the cumulative quantity. When the
   delta is zero the row keeps the price it had. The engine never averages two
   averages of its own: the destination's average over the total is already the
   answer. A frame reporting a greater cumulative quantity with no average price is
   refused and recorded, because a fill with no price cannot be marked against
   anything.
4. **Status.** Status moves forward along `"placed"`, then `"open"` or
   `"triggerPending"`, then a terminal word, and never backwards. A frame whose
   status sits behind the row's leaves the status alone, and a terminal status is
   never left.
5. **Changed.** The frame changed the row when the status moved, or the delta was
   positive, or the rejection text is new. Otherwise it changed nothing.
6. **Settle.** When the delta is positive, one fill of that size at the frame's
   average price settles against the order's own position reference, and not
   against whichever position the leg holds now.
7. **Stop.** When the frame changed nothing, nothing else happens: no fill, no
   event, no report row, no recalculation. A repeated frame and a frame overtaken
   by a later one both end here.

Because frames are cumulative, a terminal frame that overtakes a partial one loses
nothing: it carries the whole filled quantity, so step 2 produces the remaining
delta in one piece. That is the property which makes the fold safe under
out-of-order delivery, and it is the reason the language reads cumulative frames
rather than asking a destination for deltas it may not be able to give.

### What that means for a script you are writing

Three practical consequences, in the order they will reach you.

**`order.filled(tag)` is a total, not a change.** It counts up from `0` and never
falls. To find out what filled on this bar, take the change yourself. These two
lines are a fragment rather than a whole file:

```
// The change in a cumulative total, which is the only honest way to get a delta
// out of one. The total is held in a name so it can be indexed, and bar.isFirst
// guards that index on bar 0.
filledSoFar = order.filled("entry")
filledNow   = bar.isFirst ? 0 : filledSoFar - filledSoFar[1]
```

**A partial fill is a state, not an event.** An order can sit at `"open"` with
`order.filled(tag)` greater than zero for as long as the destination takes. Guard
on quantities and on the position rather than on the assumption that an order is
either untouched or done.

**Do not count anything by counting notifications.** If you ever find yourself
adding up how many times something was reported, you have rebuilt the bug the fold
exists to prevent. Read the total instead, from the ledger, which has already
folded every repeat.

## Reading the books from a script

### The orders

| Call | Returns | Reads |
|---|---|---|
| `order.working(tag)` | `series bool` | Whether that order is live and unfilled |
| `order.pending` | `series number` | How many orders are live and unfilled |
| `order.id(tag)` | `series string` | The destination's own order id, `""` before it answers |
| `order.status(tag)` | `series string` | The folded status, one of the six words above |
| `order.filled(tag)` | `series number` | Cumulative filled quantity, `0` before the first fill |
| `order.avgFill(tag)` | `series number` | Average fill price, absent before the first fill |
| `order.rejection(tag)` | `series string` | The destination's own rejection text, `""` when there is none |

All seven read the strategy's own ledger and never the destination. They are what a
script prints into a table when a trader asks why an entry did not happen, and
`order.rejection` carries the destination's own words rather than a paraphrase,
because the destination is the only party that knows why it refused.

An unknown tag in any of them is OS7009: a tag that names nothing is a script that
has lost track of its own orders.

### The positions

In a file with one leg, the `pos` namespace is the position:

| Call | When flat | Means |
|---|---|---|
| `pos.size` | `0` | Net position in units, positive long and negative short |
| `pos.isLong`, `pos.isShort`, `pos.isFlat` | | The sign of `pos.size`, spelled out |
| `pos.avgPrice` | absent | Average price of the open position |
| `pos.entryTime` | absent | When the current position was opened |
| `pos.barsHeld` | absent | Bars since it was opened, `0` on the entry bar |
| `pos.entries` | `0` | How many entries make up the current position |
| `pos.openProfit` | absent | Unrealised profit in money, marked to this bar's close |
| `pos.maxProfit`, `pos.maxLoss` | absent | The best and worst this position has seen |

In a file that declares more than one leg, those twelve are refused at compile time
and each leg is read by name instead:

| Call | Reads |
|---|---|
| `leg.size(name)` | Signed units this strategy holds in the leg, `0` when flat |
| `leg.avgPrice(name)` | Average price of the leg's open position, absent while flat |
| `leg.entryTime(name)` | When the leg's current position was opened |
| `leg.profit(name)` | The leg's open profit in money, marked to this bar's close |
| `leg.isOpen(name)` | Whether the leg holds a position |
| `leg.stopPrice(name)`, `leg.targetPrice(name)` | The levels actually in force |

The refusal is not pedantry. Adding a quantity of one contract to a quantity of
another produces a number that is not a position in anything, and averaging two
average prices produces a price at which nothing traded. There is no sensible
single answer for `pos.avgPrice` across two contracts, so the language declines to
invent one.

### The money

These add across legs, so they read the whole strategy in every file:

| Call | Reads |
|---|---|
| `pos.equity` | Starting capital plus realised and unrealised profit |
| `pos.netProfit` | Realised profit since the run began |
| `pos.tradeCount` | Closed trades so far |
| `book.profit` | The book's profit, open and realised since the book was last flat |
| `book.dayProfit` | The same, measured from this session's open |
| `book.isOpen` | Whether any leg holds a position |

Every one of them is a sum over this strategy's own fills. `pos.equity` in
particular is not your account balance: it starts at the `capital` the declaration
named and moves with this strategy alone. Sizing from it live is sizing from a
number that agrees with your account only if this strategy is the only thing in it.

### The shared position

`pos.isShared` is `true` when the account holds a position in a contract this
strategy also holds and the account's quantity is larger than the strategy's own.

It is a boolean and it stays one. There is no call that turns it into a number,
because a script that could read the account's quantity would compute against it,
which is the rule the whole ledger exists to keep. What the boolean is for is
telling a human: put it on a panel, print it when it first turns true, and treat it
as the prompt to go and find out who else is trading that contract.

## A books panel

While a strategy is running, the useful question is never what the equity curve
looked like. It is what the strategy believes about its own orders and position
right now.

```
version 1

strategy("Books panel", overlay = true, precision = 2,
         capital = 500000, qty = 1, qtyType = "lots",
         product = "intraday", closeOnSessionEnd = true)

fast = ema(close, 9)
slow = ema(close, 21)

if crossUp(fast, slow) and pos.isFlat and session.isOpen
    buy(qty = 1, tag = "entry")

if pos.isLong and crossDown(fast, slow)
    close(tag = "entry")

// One place that decides what an absent reading looks like. A blank cell and a
// zero are both wrong: the first hides that there is nothing, the second
// invents a number.
fn show(value, decimals) => isNone(value) ? "none" : text(value, decimals)

panel = table("Books", 7, 2, position = "topRight", textColor = silver)

// Only on the newest bar. A panel shows one state, and the rollback rule makes
// that safe on a live feed: the bar re-executes on every update and rewrites
// the same cells.
if bar.isLast
    cell(panel, 0, 0, "Order status")
    cell(panel, 0, 1, order.status("entry"))
    cell(panel, 1, 0, "Filled so far")
    cell(panel, 1, 1, text(order.filled("entry")))
    cell(panel, 2, 0, "Average fill")
    cell(panel, 2, 1, show(order.avgFill("entry"), 2))
    cell(panel, 3, 0, "Rejection")
    cell(panel, 3, 1, order.rejection("entry") == "" ? "none" : order.rejection("entry"),
         textColor = order.rejection("entry") == "" ? silver : red)
    cell(panel, 4, 0, "Position")
    cell(panel, 4, 1, text(pos.size))
    cell(panel, 5, 0, "Open profit")
    cell(panel, 5, 1, show(pos.openProfit, 0))
    cell(panel, 6, 0, "Shared with the account")
    cell(panel, 6, 1, pos.isShared ? "yes" : "no",
         textColor = pos.isShared ? red : silver)

plot(fast, "Fast", aqua)
plot(slow, "Slow", orange)
```

Four of those seven rows are the ledger, two are the position folded from it, and
the last is the one fact about the account the language will tell you. Compare the
position row against the account's own screen once a day. They should differ only
by what the "shared" row admits to, and the day they differ for any other reason is
the day you want to find out from a panel rather than from a statement.

## Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| A fill counted twice | Adding up reports instead of reading the total | `order.filled(tag)` is cumulative; take a difference if you need a delta |
| `order.filled(tag)` never falls back to zero after an exit | It is that order's life total, not the position | Read `pos.size` for what is held |
| OS7009 from a reading call | The tag names no order in this strategy's ledger | Tag every order, and read back the same tag |
| A late fill applied to the wrong trade | Expecting fills to settle the current position | They settle their own position reference; a flip is two orders |
| The strategy's position disagrees with the account's | Something else is trading that contract | `pos.isShared`, then find out who |
| A reconciliation against the declared product fails | The destination translated the product | Reconcile against `leg.product(name)`, which is what was sent |
| Two engines report different fills from the same frames | One of them is not folding as above | The fold is specified step by step, and it is a conformance area |

## See also

- [orders.md](./orders.md) for the calls that put rows in this ledger
- [exits-and-brackets.md](./exits-and-brackets.md) for the levels whose exit orders land in it too
- [position-and-sizing.md](./position-and-sizing.md) for sizing from what the books say
- [overview.md](./overview.md) for where the fold sits in the per-bar loop
- [../running/paper-and-live.md](../running/paper-and-live.md) for reconciling these books against a real account
- [../running/reading-a-report.md](../running/reading-a-report.md) for the finished run's version of the same record
- [../../spec/stdlib.md](../../spec/stdlib.md) sections 17.7 and 17.8 for the ledger's fields and the exact fold
