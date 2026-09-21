"""The two namespaces whose answer is the host's or the ledger's, not an argument's.

``stdlib.md`` 3.4 is the ``chart`` namespace, 17.4 is the ``pos`` namespace and
12.4 is the session's one derived entry. None of the three is in ``library/``,
and that is the library's decision rather than an omission: every function there
computes its answer from its arguments and its own region, and these read the
instrument record the host stated, the fills this strategy settled and the
boundary ``sessions.py`` derives. All of those arrive at this seam and nowhere
else, so the manifest rows for them are here, beside the join that can answer
them.

**A fact nobody stated is absent**, which is ``host-interface.md`` 4.1's column
for every entry but one: ``chart.symbol`` is the empty string, because 3.4 says
so. A default anywhere else would make "the smallest increment is five paise"
and "nobody said" the same reading.

**The two derived facts are not here.** ``chart.intervalMinutes`` and
``chart.isIntraday`` are computed from the interval string by section 15.2's
canonical form, which this engine does not read yet, so a program calling one is
refused at load by name (OS6004) rather than answered from a guess at what the
string meant. The planned entries of both tables are absent for the same reason:
a name the language does not serve yet is a refusal naming it.
"""

from typing import Any, Dict, Optional, Protocol, Tuple

from ..values import ABSENT
from .sessions import SESSION_FACTS

#: Section 3.4 against ``host-interface.md`` 4.1: the call, and the fact of the
#: instrument record it reads. Every one is arity 0, holds no state and has no
#: effect, which is what the manifest check holds a program's own table to.
CHART_FACTS: Dict[str, str] = {
    "chart.symbol": "symbol",
    "chart.exchange": "exchange",
    "chart.interval": "interval",
    "chart.timezone": "timezone",
    "chart.tickSize": "tickSize",
    "chart.lotSize": "lotSize",
    "chart.pointValue": "pointValue",
    "chart.currency": "currency",
    "chart.instrumentType": "instrumentType",
    "chart.hasVolume": "hasVolume",
    "chart.hasOpenInterest": "hasOpenInterest",
}

#: The one entry of that table whose absent case is a value rather than absence.
EMPTY_WHEN_UNSTATED: Tuple[str, ...] = ("chart.symbol",)

#: Section 3.4: the clock, whose value a case fixes so that a script using it is
#: still reproducible. It is the one entry of the namespace that is not a fact of
#: the instrument.
CHART_CLOCK = "chart.now"

#: Section 17.4: the entries of the ``pos`` namespace that are not planned. Each
#: is folded from this strategy's own fills and reflects fills rather than
#: intentions, which is the position book's whole job.
POSITION_FACTS: Tuple[str, ...] = (
    "pos.size",
    "pos.isLong",
    "pos.isShort",
    "pos.isFlat",
    "pos.avgPrice",
)


class Book(Protocol):
    """What a position fact is read from, and the whole of what it is asked.

    The ledger answers it. Two methods rather than the ledger itself, so that
    this module states what a reading of the ``pos`` namespace reaches: the
    settled position and nothing about the orders that made it.
    """

    def size(self) -> float:
        ...

    def avg_price(self) -> Optional[float]:
        ...


def chart_value(name: str, instrument: Any, now: Any) -> Any:
    """One ``chart`` entry, from the record the host stated and the fixed clock."""
    if name == CHART_CLOCK:
        return now
    held = instrument.get(CHART_FACTS[name], ABSENT)
    if held is ABSENT and name in EMPTY_WHEN_UNSTATED:
        return ""
    return held


def position_value(name: str, book: Book) -> Any:
    """One ``pos`` entry, from the ledger's own position book.

    ``pos.size`` is ``0`` while flat rather than absent, because zero is the true
    size and a script adding it to something should get the right answer.
    ``pos.avgPrice`` is absent while flat rather than zero, because zero is a
    price and a script comparing against it would take a branch that looks
    correct. Section 17.4 states both, and the difference is the reason the two
    are not one reading with a default.
    """
    if name == "pos.avgPrice":
        return book.avg_price()
    size = book.size()
    if name == "pos.size":
        return size
    if name == "pos.isLong":
        return size > 0
    if name == "pos.isShort":
        return size < 0
    return size == 0


#: Every name this module answers. The manifest rows built from it are all arity
#: 0, hold no state and have no effect, which is what section 2.5's check holds a
#: program's own library table to. The session's own entry is beside them because
#: it is read the same way and answered from the bar rather than from a record.
FACT_NAMES: Tuple[str, ...] = (*CHART_FACTS, CHART_CLOCK, *POSITION_FACTS, *SESSION_FACTS)


def fact_value(name: str, instrument: Any, now: Any, book: Book, bar: Any) -> Any:
    """Whichever of the three namespaces this name belongs to, read once."""
    if name in POSITION_FACTS:
        return position_value(name, book)
    if name in SESSION_FACTS:
        return bar
    return chart_value(name, instrument, now)
