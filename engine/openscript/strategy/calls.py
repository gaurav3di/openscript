"""One order call, read once into the fields ``stdlib.md`` 17.2 and 17.3 name.

**The positions the arguments arrive in are read here and nowhere else.** Which
slot holds a quantity and which holds a trigger is a fact about the library
surface, and a fact read in two places is one that has to be corrected in two
places. The mapping to orders and the refusals both read this record, so neither
of them counts arguments.

**An argument the script left out and an argument it wrote as absent are not the
same thing, and an order is where the difference matters most.** ``buy()`` means
"use the size I declared" and takes the declaration's own quantity.
``buy(qty = none)`` means "I computed a size and it came out absent", which is a
sizing calculation that has not warmed up or a divisor that was zero, and it is
OS7002: an order is the one place in the language where doing nothing quietly is
worse than stopping loudly (``language.md`` 6.8).

``compiled-program.md`` 4.10 is what makes the two readable apart. An order call
carries one argument more than the language surface shows, and it is the last
one: the names of the arguments the script wrote, in parameter order, separated
by single spaces. Everything the script did not write takes the default the page
documents, which the mapping applies.

The parameter names below are those two sections' signatures, which is the one
fact this file copies out of the page, and ``tests/test_calls_surface.py`` reads
them back out of it. The engine reads no page, so the alternative to a copy held
by a test is a copy held by nobody.
"""

from dataclasses import dataclass
from typing import Any, Dict, Optional, Sequence, Tuple

from .intents import SIDES, TYPES

#: The parameters of each order call, in signature order, without the extra
#: argument 4.10 adds. A call's arity is one more than the length of its row.
PARAMETERS: Dict[str, Tuple[str, ...]] = {
    "buy": ("qty", "limit", "stop", "tag", "leg"),
    "sell": ("qty", "limit", "stop", "tag", "leg"),
    "close": ("tag", "qty", "leg"),
    "exit": ("tag", "qty", "limit", "stop", "profit", "loss", "leg"),
    "cancel": ("tag",),
    "cancelAll": (),
    "order.place": ("side", "qty", "type", "price", "trigger", "tag", "leg"),
    "order.reverse": ("qty", "tag", "leg"),
    "order.bracket": ("tag", "profit", "loss", "leg"),
}

#: The nine calls that place, cancel or protect, which is what a ledger reads.
ORDER_CALLS: Tuple[str, ...] = tuple(PARAMETERS)


@dataclass(frozen=True)
class OrderCall:
    """An order call, with every argument under the name its signature gives it.

    ``trigger`` is an order's stop price, which ``buy`` and ``sell`` spell
    ``stop`` and ``order.place`` spells ``trigger``. ``stop`` and ``target`` are
    a bracket's two levels, which ``exit`` spells ``stop`` and ``limit``. The two
    are separate fields because they are separate things: one rests at a venue
    and one is a level the strategy holds.
    """

    name: str
    position: Any
    #: Arguments the script wrote that came out absent, in signature order.
    absent: Tuple[str, ...] = ()
    side: Optional[str] = None
    qty: Optional[float] = None
    order_type: Optional[str] = None
    limit: Optional[float] = None
    trigger: Optional[float] = None
    target: Optional[float] = None
    stop: Optional[float] = None
    profit: Optional[float] = None
    loss: Optional[float] = None
    tag: Optional[str] = None


def _number(args: Sequence[Any], index: int) -> Optional[float]:
    """A number the script stated, or nothing where it stated none.

    A boolean is not a number here, as it is not anywhere else in this engine:
    this interpreter's own ``True`` equals ``1``, and an order sized from one
    would be an order nobody wrote.
    """
    if index >= len(args):
        return None
    value = args[index]
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if value == value and abs(value) != float("inf") else None


def _text(args: Sequence[Any], index: int) -> Optional[str]:
    if index >= len(args):
        return None
    value = args[index]
    return value if isinstance(value, str) else None


def _one_of(words: Sequence[str], word: Optional[str]) -> Optional[str]:
    return word if word in words else None


def _absent_of(name: str, args: Sequence[Any]) -> Tuple[str, ...]:
    """The arguments the script wrote that came out absent, in signature order.

    Read from the names 4.10 puts in the last argument rather than from a list of
    this file's own, because the signature is the library's and a second copy
    here is one more thing to correct when a signature changes.
    """
    params = PARAMETERS.get(name, ())
    written = _text(args, len(params))
    named = set(written.split(" ")) if written else set()
    found = []
    for at, one in enumerate(params):
        if one in named and at < len(args) and args[at] is None:
            found.append(one)
    return tuple(found)


def _placing(side: str, args: Sequence[Any], position: Any) -> OrderCall:
    """``buy`` and ``sell``, whose name is their side."""
    return OrderCall(
        name=side,
        position=position,
        side=side,
        qty=_number(args, 0),
        limit=_number(args, 1),
        trigger=_number(args, 2),
        tag=_text(args, 3),
    )


def _read(name: str, args: Sequence[Any], position: Any) -> OrderCall:
    if name in ("buy", "sell"):
        return _placing(name, args, position)
    if name == "close":
        # The tag defaults to absence rather than to the empty string, because a
        # call that names none flattens the whole leg and the empty string is a
        # tag an order can carry.
        return OrderCall(name=name, position=position, qty=_number(args, 1), tag=_text(args, 0))
    if name == "exit":
        return OrderCall(
            name=name,
            position=position,
            qty=_number(args, 1),
            target=_number(args, 2),
            stop=_number(args, 3),
            profit=_number(args, 4),
            loss=_number(args, 5),
            tag=_text(args, 0),
        )
    if name == "cancel":
        return OrderCall(name=name, position=position, tag=_text(args, 0))
    if name == "order.place":
        return OrderCall(
            name=name,
            position=position,
            side=_one_of(SIDES, _text(args, 0)),
            qty=_number(args, 1),
            order_type=_one_of(TYPES, _text(args, 2)),
            limit=_number(args, 3),
            trigger=_number(args, 4),
            tag=_text(args, 5),
        )
    if name == "order.reverse":
        return OrderCall(name=name, position=position, qty=_number(args, 0), tag=_text(args, 1))
    if name == "order.bracket":
        # Distances only, which is the whole of this spelling.
        return OrderCall(
            name=name,
            position=position,
            profit=_number(args, 1),
            loss=_number(args, 2),
            tag=_text(args, 0),
        )
    return OrderCall(name=name, position=position)


def call_of(name: str, args: Sequence[Any], position: Any) -> OrderCall:
    """Reads one call, whichever of the nine it is."""
    read = _read(name, args, position)
    absent = _absent_of(name, args)
    if not absent:
        return read
    return OrderCall(
        name=read.name,
        position=read.position,
        absent=absent,
        side=read.side,
        qty=read.qty,
        order_type=read.order_type,
        limit=read.limit,
        trigger=read.trigger,
        target=read.target,
        stop=read.stop,
        profit=read.profit,
        loss=read.loss,
        tag=read.tag,
    )
