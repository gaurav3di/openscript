"""What the order tests build a ledger, a call and a destination's answer out of.

An order call arrives at the ledger as a name and a list of positional arguments,
because that is what step 9 hands it (``compiled-program.md`` 5.4), so a test
needs no program and no library to place one. What it does need is the last
argument of an order call, the names of the arguments the script wrote (4.10),
and getting that wrong silently turns ``buy(qty = none)`` into ``buy()``. So the
builders below take the arguments by name and write that string themselves.

Nothing here decides anything. Every default is the one ``stdlib.md`` 17.2 and
17.3 document for the call, and a test that wants another states it.
"""

from typing import Any, Dict, List, Optional, Sequence, Tuple

from openscript.diagnostics import Position
from openscript.strategy import Identity, IntentBar, Ledger, LedgerOptions, OrderFrame
from openscript.strategy.calls import PARAMETERS

#: Where a test's call is written, so a refusal has a position to carry.
AT = Position(1, 1)


def ledger_with(**options: Any) -> Ledger:
    """A ledger under the declaration a test states, and the defaults otherwise."""
    stated: Dict[str, Any] = {
        "instrument": Identity("AAA", "XX"),
        "product": "intraday",
        "qty_type": "units",
        "declared_qty": 1.0,
        "tick_size": None,
        "pyramiding": 1.0,
    }
    stated.update(options)
    return Ledger(LedgerOptions(**stated))


def call(name: str, **written: Any) -> Tuple[str, List[Any]]:
    """One order call, as an engine hands it over: the name and the arguments.

    Every argument named here is one the script wrote, absence included, and every
    one left out is one it did not: that is the whole distinction 4.10 exists for
    and the one a test must not blur.
    """
    params = PARAMETERS[name]
    args: List[Any] = [written.get(one) for one in params]
    args.append(" ".join(one for one in params if one in written))
    return name, args


def place(led: Ledger, name: str, bar: int = 0, time: Optional[float] = None, **written: Any):
    """Place one call on one bar, and answer with what the ledger said."""
    spelt, args = call(name, **written)
    where = IntentBar(index=bar, time=float(bar) if time is None else time)
    return led.place(spelt, args, where, AT)


def answer(
    led: Ledger,
    intent_id: int,
    status: str,
    filled: float = 0.0,
    price: Optional[float] = None,
    text: Optional[str] = None,
    order_ref: Optional[str] = None,
    time: Optional[float] = None,
) -> Tuple[Any, ...]:
    """One frame from the destination, delivered and folded at a bar boundary."""
    led.deliver(
        OrderFrame(
            intent_id=intent_id,
            status=status,
            filled_qty=filled,
            avg_fill_price=price,
            order_ref=order_ref,
            text=text,
            time=time,
        )
    )
    return led.settle()


def sides(intents: Sequence[Any]) -> Tuple[Tuple[str, float, int], ...]:
    """Each intent as the three facts a split is read by: side, quantity, position."""
    return tuple(
        (intent.side, intent.qty, intent.position_ref)
        for intent in intents
        if intent.kind == "place"
    )
