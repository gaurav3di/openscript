"""One order call becomes one or more intents, ``stdlib.md`` 17.2 and 17.3.

**This file says what a call means; ``sizing`` says how much it sends and against
which position.**

**Every order states its own side and its own quantity outright.** Nothing here
computes a delta against an account position, for the reason 17.1 gives: an
account position is held per contract, so a second strategy, a manual trade or
this same script started twice all land in that one row, and an order sized
against it is sized against somebody else's trade. What a flattening order does
compute against is the strategy's own position, folded from its own settled
fills, which is a different number with a different owner.

**A bracket is an instruction, not an order.** ``exit`` and ``order.bracket`` set
the leg's own protective level, which is what 17.2 means when it says a leg
carries at most one stop and at most one target at a time. They send an intent so
that a host has something to act on, and they append no ledger row and move no
position, because nothing has been ordered until the level is reached. The tag
they take defaults to the empty string and rides along as a label, so a bracket
naming a tag nothing was ever placed with is an ordinary call.

**A tag on a call that flattens is the other kind.** ``close``'s tag defaults to
absence and names the part of the position that tag entered, which is a reference
to rows this ledger holds.

**Nothing here refuses anything.** ``refusals`` says what the language will not
do, and the ledger asks it first. The two were one file once in the engine this
one is written beside, and what that produced was a call whose quantity did not
make sense returning an empty list: no order, no refusal, and a script that had
been told nothing.
"""

from typing import Any, List, Optional, Tuple

from .calls import OrderCall
from .closable import closable_units, closing_for, closing_side
from .holdings import protecting
from .intents import NO_POSITION_REF, OrderIntent, Placement
from .sizing import Entry, MappedOrder, adding, entering, flattening
from .statuses import is_terminal


def type_of(limit: Optional[float], trigger: Optional[float]) -> str:
    """The type the prices imply, ``stdlib.md`` 17.2.

    Stated on the intent rather than left to the host, so a destination never has
    to infer it.
    """
    if limit is not None and trigger is not None:
        return "stopLimit"
    if limit is not None:
        return "limit"
    if trigger is not None:
        return "stop"
    return "market"


def _cancelling(tag: str) -> Placement:
    """A cancellation names the tag it cancels and nothing else.

    No side, no quantity and no price: it is not an order, and what becomes of
    the order it names arrives as a frame about that order.
    """
    return Placement(kind="cancel", tag=tag, position_ref=NO_POSITION_REF)


def _bracketing(
    ctx: Any,
    tag: str,
    qty: Optional[float],
    target: Optional[float],
    stop: Optional[float],
    profit: Optional[float],
    loss: Optional[float],
) -> Tuple[MappedOrder, ...]:
    """A protective level attached to a tag, ``stdlib.md`` 17.2 and 17.3."""
    # A call that names no level at all removes one, which is a standing level of
    # 17.9 and is planned. There is nothing to send.
    if target is None and stop is None and profit is None and loss is None:
        return ()
    held = protecting(ctx)
    return (
        adding(
            Placement(
                kind="bracket",
                qty=qty,
                # A quantity the script stated is in the declaration's own unit;
                # a bracket that names no part of the position states none.
                qty_type="units" if qty is None else ctx.qty_type,
                target=target,
                stop=stop,
                profit=profit,
                loss=loss,
                tag=tag,
                # The position the level protects, and zero where the leg holds
                # none, which is the value a cancellation already carries for the
                # same reason: neither is an order and neither has a position of
                # its own. Minting one here would hand a host a reference no
                # order ever carries.
                position_ref=NO_POSITION_REF if held is None else held,
            )
        ),
    )


def orders_for(call: OrderCall, ctx: Any) -> Tuple[MappedOrder, ...]:
    """The orders one call sends, in the order it sends them.

    A call that has nothing to send sends nothing: flattening a leg that holds
    nothing and reversing a position that does not exist are both instructions
    about a position the strategy does not hold, and inventing a side for either
    would be the engine deciding a direction the script never stated.
    """
    name = call.name

    if name in ("buy", "sell", "order.place"):
        side = call.side
        # A side that is not one of the two is not a direction, and a buy is not
        # the safe guess: a computed value outside the set sends nothing rather
        # than the opposite of what the script meant. A side the script stated as
        # absent never reaches here at all: that is OS7002.
        if side is None:
            return ()
        return entering(
            ctx,
            Entry(
                side=side,
                limit=call.limit,
                trigger=call.trigger,
                # A type outside the set falls back to the one the prices imply,
                # which is the correspondence 17.2 fixes between the two.
                order_type=call.order_type or type_of(call.limit, call.trigger),
                tag=call.tag or "",
            ),
            call.qty,
        )

    if name == "close":
        # The side comes from the part the call names, which is the leg only
        # where it names no tag.
        closing = closing_for(ctx, call.tag)
        if closing is None:
            return ()
        return flattening(
            ctx, closable_units(ctx, call.tag), closing, call.qty, call.tag or "", call.tag
        )

    if name == "order.reverse":
        size = ctx.size()
        closing = closing_side(size)
        if closing is None:
            return ()
        tag = call.tag or ""
        # What is left to close rather than the whole leg, so that a reverse
        # after a close on the same bar does not send the position twice.
        out: List[MappedOrder] = list(
            flattening(ctx, closable_units(ctx, None), closing, None, tag, None)
        )
        # The replacement is a position of its own, minted here, so that a fill
        # on the outgoing order settles the position it belonged to.
        ref = ctx.mint()
        out.append(
            adding(
                Placement(
                    kind="place",
                    side=closing,
                    qty=abs(size) if call.qty is None else call.qty,
                    qty_type="units" if call.qty is None else ctx.qty_type,
                    order_type="market",
                    tag=tag,
                    position_ref=ref,
                )
            )
        )
        return tuple(out)

    if name == "exit":
        return _bracketing(
            ctx, call.tag or "", call.qty, call.target, call.stop, call.profit, call.loss
        )

    if name == "order.bracket":
        return _bracketing(ctx, call.tag or "", None, None, None, call.profit, call.loss)

    if name == "cancel":
        return (adding(_cancelling(call.tag or "")),)

    if name == "cancelAll":
        tags: List[str] = []
        for row in ctx.rows():
            if not is_terminal(row.status) and row.tag not in tags:
                tags.append(row.tag)
        return tuple(adding(_cancelling(tag)) for tag in tags)

    return ()


def intent_for(placement: Placement, intent_id: int, ctx: Any) -> OrderIntent:
    """The intent one placement becomes, ``host-interface.md`` 7.1."""
    return OrderIntent(
        intent_id=intent_id,
        placement=placement,
        instrument=ctx.instrument,
        product=ctx.product,
        bar=ctx.bar,
    )
