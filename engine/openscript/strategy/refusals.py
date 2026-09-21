"""What the order layer will not do, ``errors.md`` OS7002 to OS7013 and OS7017.

**An order is the one place in the language where doing nothing quietly is worse
than stopping loudly.** Everywhere else an absent value propagates and the study
draws a gap; here it would be a position the script believes it holds and does
not, or one it holds and does not know about.

**A refusal happens before anything is sent.** The ledger asks this file about
every order a call produces before any of them takes an id, so a refused call
appends no row and returns no intent: there is nothing for a host to send and
nothing to take back afterwards.

**What is not refused here.** A rule this file cannot evaluate truthfully is not
evaluated at all. A quantity that is not a whole number of lots, OS7005, and an
order outside the instrument's session, OS7012, are facts about a leg no file can
declare yet. The capital a strategy has left, OS7011, is money and the money
layer does not join the execution path in this release. OS7014 and OS7015 are the
host's, under ``host-interface.md`` 7.6. And a stated close quantity held against
a position that is still there is checked in full only in a declaration counting
in units, which is the narrowing OS7017 itself carries.

Nothing here holds a message. ``spec/errors.json`` is the catalogue and the
authority, and a second engine that typed the sentences out again would be a
second place for them to be wrong: what travels is the code, the position and the
values the message names.
"""

from typing import Any, Optional, Sequence, Tuple

from ..diagnostics import Diagnostic, failure
from .calls import OrderCall
from .closable import closable
from .intents import Placement
from .positions import sign
from .sizing import MappedOrder
from .statuses import is_terminal

#: How a message names an instrument the host gave no symbol for. The same words
#: the engine uses for the same gap elsewhere, because a reader meeting both
#: should not have to work out that they mean one thing.
UNNAMED_INSTRUMENT = "the chart's instrument"

#: The calls that take the declaration's size when they are given none.
SIZED_BY_DECLARATION: Tuple[str, ...] = ("buy", "sell", "order.place")

#: How far off a tick a price may be and still be on it. A price computed from a
#: tick size rarely divides by it exactly in binary, and a tolerance relative to
#: the count keeps that true at every magnitude while staying far tighter than
#: the half tick that would let a price between two ticks through.
TICK_TOLERANCE = 1e-9


class SentOnBar:
    """An order this bar has already sent, which is what OS7013 is asked about.

    The bar's own record, and the only rule left that is scoped to a bar. What a
    close is measured against is a different question with a different scope, and
    it is answered from the ledger's rows. The record is the bar's rather than
    the execution's, so a bar declared ``onUnconfirmed`` and executed again is
    still one bar for it: the orders of its earlier executions really were handed
    over.
    """

    __slots__ = ("name", "line", "side")

    def __init__(self, name: str, line: int, side: str) -> None:
        self.name = name
        self.line = line
        self.side = side


def _name_of(instrument: Any) -> str:
    symbol = getattr(instrument, "symbol", None)
    return UNNAMED_INSTRUMENT if symbol is None else symbol


def _spell(name: str, line: int) -> str:
    """An order call as a message names one: what was called, and where."""
    return f"{name}() on line {line}"


def _part_of(tag: Optional[str]) -> str:
    """What a close is closing, as a message names it: the leg, or one tag of it."""
    return "the leg" if tag is None else f'the tag "{tag}"'


def _price_missing(call: OrderCall) -> Optional[str]:
    """The price argument a named type needs and was not given, 17.2.

    Only a call that names a type can disagree with its own prices. ``buy`` and
    ``sell`` take no type and their prices imply one, so the two always agree.
    """
    named = call.order_type
    if named in ("limit", "stopLimit") and call.limit is None:
        return "price"
    if named in ("stop", "stopLimit") and call.trigger is None:
        return "trigger"
    return None


def _on_tick(price: float, tick: float) -> bool:
    steps = price / tick
    nearest = round(steps)
    return abs(steps - nearest) <= TICK_TOLERANCE * max(1.0, abs(steps))


def _entries_open(ctx: Any, side: str) -> int:
    """The entries already open in one direction, which is what pyramiding counts.

    Over every position the leg still holds on that side rather than over one of
    them: an entry placed while the whole of a position is on its way out opens a
    position of its own, so a count keyed to a single reference would report none
    and let a declaration of one entry hold two.

    An order that has not filled is not an open entry, because OS7008's own fix
    tells a reader to test ``pos.size`` and that is folded from settled fills. A
    count including an order still waiting at the venue would refuse a script that
    had done exactly what the fix asked, which is the one thing a fix may never do.
    """
    holding = 1 if side == "buy" else -1
    found = 0
    for row in ctx.rows():
        if row.side != side or row.filled_qty == 0:
            continue
        if sign(ctx.size_of(row.position_ref)) != holding:
            continue
        found += 1
    return found


def _beyond_the_close(call: OrderCall, ctx: Any) -> Optional[Diagnostic]:
    """A close asked to send more than it is closing, OS7017.

    Refused rather than clamped, because the quantity is an argument the script
    wrote and is therefore a claim about the strategy's own position. Sending
    what is there would leave the script believing it closed the number it asked
    for, and reading the call as a reversal would make ``close`` open a position.

    In full only where the two numbers count the same thing, and in part
    everywhere: nothing left to close is zero in every unit, so a close of any
    quantity against nothing is a false claim whatever the declaration counts in.
    An assumed zero is not a measurement, so it is not named in a message either.
    """
    if call.name != "close":
        return None
    stated = call.qty
    if stated is None:
        return None
    left = closable(ctx, call.tag)
    held = left.units
    if stated <= held:
        return None
    if ctx.qty_type != "units" and not (held == 0 and left.counted):
        return None
    return failure(
        "OS7017", call.position, qty=stated, part=_part_of(call.tag), held=held
    )


def refusal_in_call(call: OrderCall, ctx: Any) -> Optional[Diagnostic]:
    """What the call itself is wrong about, before anything is computed from it.

    Four refusals. Three are about what the script wrote and nothing else, so they
    are the same on every bar and on every host. The fourth, OS7017, is the one
    quantity a script writes that is a claim about the leg rather than about
    itself, so it is answered here, against the leg, before the call is mapped.
    """
    # OS7002. Every argument the script wrote that came out absent, named in
    # signature order, so a call with two is reported on the first one a reader
    # would fix. An argument the script did not write is not one of them.
    if call.absent:
        return failure("OS7002", call.position, name=call.name, argument=call.absent[0])

    # OS7004. Direction is chosen by the function and not by the sign, so a
    # negative quantity is a calculation that went the wrong way.
    stated = call.qty
    if stated is not None and not stated > 0:
        return failure("OS7004", call.position, name=call.name, qty=stated)
    if stated is None and call.name in SIZED_BY_DECLARATION and not ctx.declared_qty > 0:
        return failure("OS7004", call.position, name=call.name, qty=ctx.declared_qty)

    # OS7017. After OS7004, so a negative quantity is still answered by the code
    # that is about the sign rather than by the one that is about the size.
    crossing = _beyond_the_close(call, ctx)
    if crossing is not None:
        return crossing

    # OS7007. Filling the price in from the bar's close would make the order a
    # market order wearing another name.
    missing = _price_missing(call)
    if missing is not None and call.order_type is not None:
        return failure("OS7007", call.position, type=call.order_type, argument=missing)

    return None


def _unknown_tag(call: OrderCall, placement: Placement, ctx: Any) -> Optional[Diagnostic]:
    """A cancellation naming an order that is not there to cancel, OS7009."""
    for row in ctx.rows():
        if row.tag == placement.tag and not is_terminal(row.status):
            return None
    return failure("OS7009", call.position, tag=placement.tag)


def _wrong_side(call: OrderCall, placement: Placement, ctx: Any) -> Optional[Diagnostic]:
    """A protective level on the wrong side of the entry, OS7010.

    Only against a position that is open, because the level is measured from the
    position's average entry price and a leg that holds nothing has none. An entry
    and its bracket on one bar is the common shape and is not this case: the entry
    has not filled, so there is nothing yet for the level to be on the wrong side
    of, which is why a bracket may also state its levels as distances.

    A level exactly at the entry is not refused. Moving every stop to its own
    entry is a rule the language names (17.11), so the price that rule produces
    cannot be one the language will not take.
    """
    entry = ctx.avg_price()
    size = ctx.size()
    if entry is None or size == 0:
        return None
    long = size > 0
    side = "long" if long else "short"

    stop = placement.stop
    if stop is not None and (stop > entry if long else stop < entry):
        return failure("OS7010", call.position, side=side, entry=entry, leg="stop", price=stop)
    target = placement.target
    if target is not None and (target < entry if long else target > entry):
        return failure("OS7010", call.position, side=side, entry=entry, leg="limit", price=target)
    return None


def _ordering(
    call: OrderCall, order: MappedOrder, ctx: Any, sent: Sequence[SentOnBar]
) -> Optional[Diagnostic]:
    """What one order is wrong about, given the instrument and the leg."""
    placement = order.placement
    side = placement.side
    if side is None:
        return None

    # OS7006. A price between two ticks cannot exist at the exchange, and
    # rounding it here would move the order off the level the script computed.
    tick = ctx.tick_size
    if tick is not None and tick > 0:
        for price in (placement.limit, placement.trigger):
            if price is None or _on_tick(price, tick):
                continue
            return failure(
                "OS7006", call.position, symbol=_name_of(ctx.instrument), tick=tick, price=price
            )

    # OS7008. Refusing rather than silently adding keeps a backtest from building
    # a position the declaration forbade. Whether this order is an entry is the
    # mapping's answer and not the leg's net: the net reads flat while an entry is
    # still going, and an order that comes off a position is not an entry whatever
    # it says.
    if order.reduces is None:
        found = _entries_open(ctx, side)
        if found >= ctx.pyramiding:
            return failure("OS7008", call.position, max=ctx.pyramiding, found=found)

    # OS7013. Which of the two to honour has no defensible answer, so neither is
    # placed: this call sends nothing, and the bar stops before anything the bar
    # decided reaches the destination.
    for one in sent:
        if one.side != side:
            return failure(
                "OS7013",
                call.position,
                first=_spell(one.name, one.line),
                second=_spell(call.name, call.position.line),
                bar=ctx.bar.index,
            )

    return None


def refusal_in_order(
    call: OrderCall, order: MappedOrder, ctx: Any, sent: Sequence[SentOnBar]
) -> Optional[Diagnostic]:
    """What one order this call produced is wrong about.

    Asked of every order a call sends, before any of them is given an id, so a
    call that sends two sends both or neither.
    """
    placement = order.placement
    if placement.kind == "cancel":
        return _unknown_tag(call, placement, ctx)
    if placement.kind == "bracket":
        return _wrong_side(call, placement, ctx)
    return _ordering(call, order, ctx, sent)
