"""The atoms the money is folded from: a fill, a contract and a bar's close.

**Everything in this module is portable data.** A shape here is what a JSON
reader gives back, so a report can be computed here, stored by a platform, sent
to another process and recomputed there without this implementation being
present. That is not a convenience. A run record is the conformance case a second
engine is handed, and a case that can only be read by the engine that wrote it
proves nothing about either.

**A fill is the only thing money is folded from.** Not a position, not a ledger
row, not a running total the engine happened to be holding: the fills the engine
settled, in the order it settled them, each naming the position reference it
moved and the size of that reference either side of the settlement. Every figure
in a report is a function of that list and of the bars it is marked against,
which is what makes a report reproducible from a record with no engine in the
room.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Contract:
    """The instrument facts a run was carried out under, as the host stated them.

    A snapshot rather than a reference. An instrument's lot size and tick size
    change, and a report recomputed months later under today's facts would be a
    different study wearing the same name, so the facts travel with the run.
    """

    currency: str = "CUR"
    symbol: Optional[str] = None
    exchange: Optional[str] = None
    tick_size: Optional[float] = None
    lot_size: Optional[float] = None
    #: Money per 1.0 of price per unit; 1 when the host states none.
    point_value: float = 1.0
    #: Money rounding digits, half to even, once per fill total.
    digits: int = 2


@dataclass(frozen=True)
class RecordedFill:
    """One settled fill. Every money figure is folded from these and nothing else."""

    seq: int
    intent_id: int
    order_ref: str
    tag: str
    position_ref: int
    side: str
    #: Positive, this fill's own quantity.
    units: float
    price: float
    bar_index: int
    bar_time: Optional[float]
    ref_size_before: float
    ref_size_after: float


@dataclass(frozen=True)
class BarMark:
    """One bar as the report marks against it.

    Close only: ``stdlib.md`` 17.4 marks an open position to this bar's close, and
    an intrabar extreme is a price the strategy could not have acted on.
    """

    bar_index: int
    time: Optional[float]
    close: Optional[float]
    #: False for a warmup bar, which executes and is not reported.
    in_report: bool = True
