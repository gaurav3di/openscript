# Reading a strategy's own books

By the end of this page you will be able to read a strategy's own books from
inside a script: the order rows it keeps, the fills folded into them, and the
positions those fills add up to. You will also know why one fill can be reported
twice, what stops the second report from counting, and why no call anywhere in the
language hands you the account's own position.

> **Much of this page is marked planned.** A strategy's ledger, its legs and its
> book are what the marked calls are folded from, and no engine holds one in this
> release. A marked call is refused where you wrote it, with a message that says
> it is planned, rather than compiling and then failing to load. The six order
> functions, the three `order` calls that place an order and the five position
> facts read from the account's own row are not marked, because those run.

## Every strategy keeps its own books

**Each strategy owns its own order and fill ledger.** It is the strategy's record
of what it has actually done, it is what every position and profit figure in the
language is folded from, and it is per strategy rather than per account.

The engine does not read the account's position, under `stdlib.md` section 17.1.
[orders.md](./orders.md) opens with the failure that rule prevents, worked
through; this page is about what the strategy's own books hold and how to read
them.

## The order row

The ledger holds one row per order placed. A row is appended when the order is
sent and is never rewritten in place: each frame from the destination appends a
revision, and the row's current fact is the fold of its revisions, so the sequence
that produced a position can be replayed and audited rather than inferred.

The run keeps the ledger of `stdlib.md` section 17.7. Two things about its fields
are worth knowing before you reconcile anything against a statement.

**The product, the symbol and the exchange are recorded as sent, not as
declared.** A product is translated per destination, and a leg that resolved a
relative contract carries a name the source never wrote, so a position reconciled
against the declared word is reconciled against something nobody traded.
`leg.product(name)`, `leg.symbol(name)` and `leg.exchange(name)` return what was
sent, and they are what a statement can be matched against.

**Every order carries a position reference**, which is the `positionRef` of
`stdlib.md` section 17.7. It is the field that makes a flip readable long after
the fact, so read that section before writing anything that reasons about one.

Two things about it are worth knowing before you reconcile against it. **A
reference that opened on one sign never ends on the other**, so the rows sharing
one reference are one position's own book and you can add them up. And **a leg
can hold more than one at a time**, on one side as well as on each: an entry
placed while the whole of a position is already in an order the destination still
has opens a position of its own, because the one it would join is about to reach
zero and end. So group by `positionRef` rather than assuming there is one.

**An instruction that orders nothing carries no position of its own.** A bracket
and a cancellation both reach a destination as intents, and neither appends a
row or moves a position: a bracket names the position the leg is holding or
opening when you set it, and `0` where the leg holds none, which is what your
first `exit()` of a run carries. A cancellation names an order and carries `0`
always. Look a reference up only when it is not `0`, and `host-interface.md`
section 7.1 is where that is written for whoever builds the other side.

Because a leg can hold more than one position at a time, "the position the leg is
holding" needs a choice made, and the choice is the newest reference the leg's
own fills have settled anything on. Only where nothing has settled at all is the
answer the position being opened, which is what an `exit()` written beside the
entry it protects carries. So when a bracket's reference is not `0`, your books
hold something on it.

## Statuses, and what terminal means

The status words, and which of them are terminal, are the vocabulary of
`stdlib.md` section 17.7. One spelling on both sides of the boundary means the
same word everywhere a script runs, which is what lets a script be read by
somebody who has never seen your destination; where a destination has words of
its own, that section says whose job the mapping is.

## Frames are cumulative, and that is why a fill can be reported twice

A frame is cumulative, under `host-interface.md` section 7.2.

Frames repeat, arrive out of order and arrive twice. A session that reconnects
resends its last frames. A destination that is unsure whether you heard it says it
again. Two frames cross in flight and the older one lands second. None of that is a
fault, and all of it is ordinary.

This is the fact a reader writing a strategy has to hold on to, because it is why
the same fill can appear twice in what the destination tells you, and why an engine
that added each frame's quantity to a running total would double a fill and report a
position the strategy never held. The protection is not a habit anybody has to
remember. It is in the fold, and an engine folds a frame exactly as
`stdlib.md` section 17.8 folds one. Read that section before writing anything
that reasons about repeated, crossed or late frames: it is numbered step by step,
it is a conformance area with vectors of its own, and every engine that passes
those vectors produces the same row from the same frames.

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

**A partial fill is a state, not an event.** An order can sit at a non-terminal
status with `order.filled(tag)` greater than zero for as long as the destination
takes. Guard on quantities and on the position rather than on the assumption that
an order is either untouched or done.

**Do not count anything by counting notifications.** If you ever find yourself
adding up how many times something was reported, you have rebuilt the bug the fold
exists to prevent. Read the total instead, from the ledger, which has already
folded every repeat.

## Reading the books from a script

### The orders

| Call | Returns | Reads |
|---|---|---|
| `order.working(tag)` (planned) | `series bool` | Whether that order is live and unfilled |
| `order.pending` (planned) | `series number` | How many orders are live and unfilled |
| `order.id(tag)` (planned) | `series string` | The destination's own order id, `""` before it answers |
| `order.status(tag)` (planned) | `series string` | The folded status, from the vocabulary of `stdlib.md` section 17.7 |
| `order.filled(tag)` (planned) | `series number` | Cumulative filled quantity, `0` before the first fill |
| `order.avgFill(tag)` (planned) | `series number` | Average fill price, absent before the first fill |
| `order.rejection(tag)` (planned) | `series string` | The destination's own rejection text, `""` when there is none |

All seven read the strategy's own ledger and never the destination. They are what a
script prints into a table when a trader asks why an entry did not happen, and
`order.rejection` carries the destination's own words rather than a paraphrase,
because the destination is the only party that knows why it refused.

What these seven do with a tag that names no row, and what they read once an
order has finished, is `stdlib.md` section 17.3. OS7009 is a call that acts on an
order rather than one that reads one, and its scope is the one `errors.md` gives
it.

A tag that has to name something is a **reference**, and a tag a call merely
carries is a **label**; which one a tag argument is, is written in its default,
and `stdlib.md` section 17.2 states the rule. The two references on the surface
are answered in different places, because they are different questions. Whether
an order is still working is something only a run knows, so `cancel` is refused
by the engine with OS7009. Whether any order in the file could carry the tag at
all is something the file settles, so a `close` naming a tag nothing places is
OS7016 at the call, before any bar runs. A close on a tag that is placed
somewhere in the file and holds nothing right now is neither: it sends nothing
and says nothing, which is what makes closing the same tag twice safe to write.

Write a `qty` on that same close and it stops being safe, and the reason is the
same rule read from the other end. A quantity is something the script wrote, so
it is a claim about the position, and a claim larger than what is left to close
is OS7017: no order crosses zero, and a close that sent more than the part holds
would open the opposite position under a call named `close`. So
`close(tag = "runner")` on a flattened tag is silent and
`close(tag = "runner", qty = 1)` on it is refused. If a scale-out can fire twice
on one position, guard it on `pos.size`.

What is left to close is the settled position less everything already working
against it, which is why the ledger is the thing to read. A position moves when
a fill settles, so an order the destination has not answered has not moved it,
whether it was sent a line ago or ten bars ago, and the engine counts what is
still going rather than letting each close send the whole position. An order is
still going while it has not ended and has not fully filled, so a partial fill
releases what settled and a rejection, a cancellation or an expiry releases the
rest. `cancel(tag)` is what releases one the destination has simply gone quiet
about.

### The positions

In a file with one leg, the `pos` namespace is the position:

| Call | When flat | Means |
|---|---|---|
| `pos.size` | `0` | Net position in units, positive long and negative short |
| `pos.isLong`, `pos.isShort`, `pos.isFlat` | | The sign of `pos.size`, spelled out |
| `pos.avgPrice` | absent | Average price of the open position |
| `pos.entryTime` (planned) | absent | When the current position was opened |
| `pos.barsHeld` (planned) | absent | Bars since it was opened, `0` on the entry bar |
| `pos.entries` (planned) | `0` | How many entries make up the current position |
| `pos.openProfit` (planned) | absent | Unrealised profit in money, marked to this bar's close |
| `pos.maxProfit`, `pos.maxLoss` (planned) | absent | The best and worst this position has seen |

In a file that declares more than one leg, those twelve are refused at compile time
and each leg is read by name instead:

| Call | Reads |
|---|---|
| `leg.size(name)` (planned) | Signed units this strategy holds in the leg, `0` when flat |
| `leg.avgPrice(name)` (planned) | Average price of the leg's open position, absent while flat |
| `leg.entryTime(name)` (planned) | When the leg's current position was opened |
| `leg.profit(name)` (planned) | The leg's open profit in money, marked to this bar's close |
| `leg.isOpen(name)` (planned) | Whether the leg holds a position |
| `leg.stopPrice(name)`, `leg.targetPrice(name)` (planned) | The levels actually in force |

The refusal is not pedantry. Adding a quantity of one contract to a quantity of
another produces a number that is not a position in anything, and averaging two
average prices produces a price at which nothing traded. There is no sensible
single answer for `pos.avgPrice` across two contracts, so the language declines to
invent one.

### The money

These add across legs, so they read the whole strategy in every file:

| Call | Reads |
|---|---|
| `pos.equity` (planned) | Starting capital plus realised and unrealised profit |
| `pos.netProfit` (planned) | Realised profit since the run began |
| `pos.tradeCount` (planned) | Closed trades so far |
| `book.profit` (planned) | The book's profit, open and realised since the book was last flat |
| `book.dayProfit` (planned) | The same, measured from this session's open |
| `book.isOpen` (planned) | Whether any leg holds a position |

Every one of them is a sum over this strategy's own fills. `pos.equity` in
particular is not your account balance: it starts at the `capital` the declaration
named and moves with this strategy alone. Sizing from it live is sizing from a
number that agrees with your account only if this strategy is the only thing in it.

### The shared position

`pos.isShared` is `true` when the account holds a position in a contract this
strategy also holds and the account's quantity is larger than the strategy's own.

It is a boolean and it stays one. There is no call that turns it into a number,
because the engine does not read the account's position, under `stdlib.md`
section 17.1. What the boolean is for is
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
| `order.filled(tag)` never falls back to zero after an exit (planned) | It is that order's life total, not the position | Read `pos.size` for what is held |
| OS7009 from `cancel` | The tag names no order that is still working | Use the tag the order was placed with; `order.working(tag)` is the guard and is planned, so until it lands cancel on the condition the order was placed on, or call `cancelAll()` |
| OS7016 on a `close` | The tag is one no order in the file is placed with, usually a typo | Use the tag the entry was placed with, or leave the tag out to flatten the whole leg |
| OS7017 on a `close` | The quantity written on it is larger than what that close is closing, usually a scale-out fired twice | Guard on `pos.size`, or leave the quantity out and let the close send what is there |
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
