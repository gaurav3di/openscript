"""The positions a leg holds, folded from settled fills and nothing else, 17.1 and 17.7.

**A fill settles the position its own order names, never whichever position the
leg holds now.** That is what the position reference is for: during a flip a leg
holds two positions at once, the outgoing one and its replacement, and a fill
that arrives late would otherwise be applied to the position that replaced the
one it belonged to.

**Reducing a position does not move its average price.** The units that leave
leave at the price the position was opened at, so what remains is still the
average of what was bought. An engine that took the closing fill's price into
the average would report an entry at a price nothing was entered at, and every
level a script measures from the entry would be measured from that.

Nothing here is money. Realised profit, equity and the trade list are the
planned entries of ``stdlib.md`` 17.4, and this holds the two facts the five
position calls of this release read: how much is held, and at what average.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional


def sign(value: float) -> int:
    """The sign of a quantity, as the three way answer the arithmetic below needs."""
    if value > 0:
        return 1
    if value < 0:
        return -1
    return 0


@dataclass
class Held:
    """One position: its signed size, and the signed cost of what is open."""

    size: float = 0.0
    cost: float = 0.0


class Positions:
    """The book a leg's fills settle into, one entry per position reference."""

    def __init__(self) -> None:
        self._held: Dict[int, Held] = {}
        self._minted: List[int] = []
        self._next = 1

    def size_of(self, ref: int) -> float:
        """The settled size of one reference, signed the way a position is.

        Per reference rather than per leg, because which position an order is
        sent against is a question about one position and the leg's net cannot
        answer it: two positions that net to zero are not the same thing as no
        position at all. Zero for a reference this book has never been given a
        fill for, which is both a reference minted for an order that has not
        settled and one that is not a reference at all.
        """
        one = self._held.get(ref)
        return 0.0 if one is None else one.size

    def mint(self) -> int:
        """A fresh position, for the replacement half of a flip."""
        ref = self._next
        self._next += 1
        self._held[ref] = Held()
        self._minted.append(ref)
        return ref

    def settle(self, ref: int, units: float, price: float) -> None:
        """Step 6 of the fold: ``units`` at ``price`` settle against one position."""
        position = self._held.get(ref)
        if position is None:
            position = Held()
            self._held[ref] = position
            self._minted.append(ref)
        before = position.size

        if before == 0 or sign(units) == sign(before):
            position.size = before + units
            position.cost += units * price
            return

        average = position.cost / before
        after = before + units
        position.size = after
        # A destination that filled more than the order asked takes the leg
        # through zero. The remainder is a position in the other direction and
        # it opened at this fill's price, which is the truthful reading of what
        # the account now holds. Dropping it would leave the strategy blind to a
        # position it is carrying.
        at = average if sign(after) == sign(before) else price
        position.cost = 0.0 if after == 0 else after * at

    def size(self) -> float:
        """The leg's net position in units, ``0`` while flat."""
        total = 0.0
        for position in self._held.values():
            total += position.size
        return total

    def avg_price(self) -> Optional[float]:
        """The average price of what the leg holds, absent while flat.

        Absent rather than zero, because zero is a price and a script comparing
        against it would take a branch that looks correct (``stdlib.md`` 17.4).

        Averaged over the positions on the side of the leg's net, and not over
        every position open at once. Summed across both sides the cost of a
        position on the way out is subtracted from the cost of the one on the
        way in, and the quotient is a price nothing was entered at.
        """
        net = self.size()
        if net == 0:
            return None
        side = sign(net)
        size = 0.0
        cost = 0.0
        for position in self._held.values():
            if sign(position.size) != side:
                continue
            size += position.size
            cost += position.cost
        return None if size == 0 else cost / size
