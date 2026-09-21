"""The two shapes that cross the order boundary, ``host-interface.md`` 7.1 and 7.2.

**An intent is not an order.** The engine states what the strategy decided and
the destination makes the order, which is why the duty is two messages rather
than one call. An engine that named a destination's own order id at the moment a
script called ``buy()`` would be handing the script an identifier for something
that may never exist, which is also why an order function returns absence
(``compiled-program.md`` section 5.4).

**A frame is cumulative.** Every frame restates the whole life of one order
rather than what changed since the frame before it, which is what makes a
repeat, a pair that crossed in flight and a reconnecting session that resends
its last frames all harmless. The fold that depends on it is ``rows``.

Nothing here parses an identity. A resolved identity may be a string, a number,
a pair or a row in the host's own table (``host-interface.md`` section 9.1), so
the engine carries the one it was given and hands it back unchanged. That is the
whole of what this engine knows about where an order goes: the destination is
the host's, and ``spec/decisions.md`` says the engine learns nothing about it.

A field a destination has not spoken about yet is ``None`` rather than a
substituted zero or an empty string, because absence and zero are different
answers everywhere else in this language and an order is the last place to stop
telling them apart.
"""

from dataclasses import dataclass, replace
from typing import Any, Optional, Tuple

#: The two sides, ``stdlib.md`` 17.2.
SIDES: Tuple[str, ...] = ("buy", "sell")

#: The four types, ``stdlib.md`` 17.2.
TYPES: Tuple[str, ...] = ("market", "limit", "stop", "stopLimit")

#: What an intent asks the destination to do, ``host-interface.md`` 7.1.
KINDS: Tuple[str, ...] = ("place", "cancel", "bracket")

#: The reference an intent about no position of its own carries. No reference an
#: engine mints is this, so a host looks one up only when it is not this.
NO_POSITION_REF = 0


@dataclass(frozen=True)
class Identity:
    """The instrument an order names, as the chart's record states it.

    A pair, which is one of the spellings section 9.1 allows an identity to
    take. It is carried and compared and never split, formatted or inferred
    from.
    """

    symbol: Optional[str] = None
    exchange: Optional[str] = None


@dataclass(frozen=True)
class IntentBar:
    """The bar whose close decided an order, ``host-interface.md`` 7.1."""

    index: int = 0
    time: Optional[float] = None


@dataclass(frozen=True)
class Placement:
    """An order this run is about to send, before it is given an id.

    The intent's own shape less the four fields that are the same for every
    order this run sends, so that the mapping cannot state one of them
    differently from one call to the next.
    """

    kind: str = "place"
    side: Optional[str] = None
    qty: Optional[float] = None
    #: The unit ``qty`` is counted in, ``language.md`` 13.3, passed untranslated.
    qty_type: str = "units"
    order_type: Optional[str] = None
    limit: Optional[float] = None
    trigger: Optional[float] = None
    #: A bracket's target and stop, as prices.
    target: Optional[float] = None
    stop: Optional[float] = None
    #: A bracket's target and stop as distances from the entry, carried as
    #: distances because the entry they are measured from is a fill, and on the
    #: bar a script writes an entry and its bracket together nothing has filled.
    profit: Optional[float] = None
    loss: Optional[float] = None
    tag: str = ""
    position_ref: int = NO_POSITION_REF


@dataclass(frozen=True)
class OrderIntent:
    """What the engine hands over, ``host-interface.md`` 7.1.

    ``qty`` carries the unit its ``qty_type`` names rather than a count of units
    the engine worked out for itself. A lot is the venue's own fact and the host
    owns symbology, so an engine that multiplied by a lot size the host never
    stated would send a quantity nobody asked for. A quantity the engine folded
    from filled quantities, as a flattening order's is, states units.
    """

    intent_id: int
    placement: Placement
    instrument: Identity
    product: str
    bar: IntentBar

    @property
    def kind(self) -> str:
        return self.placement.kind

    @property
    def side(self) -> Optional[str]:
        return self.placement.side

    @property
    def qty(self) -> Optional[float]:
        return self.placement.qty

    @property
    def qty_type(self) -> str:
        return self.placement.qty_type

    @property
    def order_type(self) -> Optional[str]:
        return self.placement.order_type

    @property
    def tag(self) -> str:
        return self.placement.tag

    @property
    def position_ref(self) -> int:
        return self.placement.position_ref


@dataclass(frozen=True)
class OrderFrame:
    """What a host reports back about one order, ``host-interface.md`` 7.2.

    ``filled_qty`` is cumulative, from the beginning of this order's life, and
    ``avg_fill_price`` is the destination's average over the whole of it.
    """

    intent_id: Any
    status: str
    filled_qty: float
    avg_fill_price: Optional[float] = None
    order_ref: Optional[str] = None
    sent_instrument: Optional[Identity] = None
    sent_product: Optional[str] = None
    time: Optional[float] = None
    text: Optional[str] = None
    seq: Optional[float] = None


def at_position(placement: Placement, ref: int) -> Placement:
    """The same placement sent against another position, which is what a split makes."""
    return replace(placement, position_ref=ref)
