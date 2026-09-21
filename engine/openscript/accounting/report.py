"""The report: what a run came to, folded from its fills and its bar closes.

**The evaluation order is fixed here and nowhere else**, because a report that is
right to eleven digits and different in the twelfth fails a conformance
comparison months later on somebody else's engine, and the cause is always a line
nobody thought was arithmetic. Fills in ``seq`` order, charge lines in declaration
order, one rounding per fill total, no collection re-summed in another order, no
dependence on a mapping's iteration order, no clock and no random number anywhere
in this module.

**What the report is not is read by a script.** The money entries of the ``pos``
namespace stay planned and go on refusing at the call. The moment a script can
read its own equity mid-run, the money layer joins the execution path and
therefore joins the conformance surface, and every formula in this module has to
be agreed by a second engine before a script may branch on it. This module
computes the money after the fact from a record; whether a script may read it is a
later decision, and that this module imports no interpreter is the structural half
of keeping that decision open.

**A charge belongs to the fill that incurred it.** One fill's total is rounded
once, and nothing here rounds it again or re-sums the collection in another order,
so the trades' charges and the summary's charges are the same money and a test
asserts it rather than a page claiming it.

A run carried out under no schedule at all is charged nothing, which is a study of
the strategy before costs and is a thing worth being able to ask for. It is not a
default: the caller states which it wants.
"""

from dataclasses import dataclass
from typing import Optional, Sequence, Tuple

from .charges import ChargeSchedule, charge_for
from .equity import EquityPoint, equity_over
from .shapes import BarMark, Contract, RecordedFill
from .statistics import Summary, summary_of
from .trades import Trade, trades_of


@dataclass(frozen=True)
class Report:
    """Everything a run is reported as, and nothing a chart has to compute."""

    summary: Summary
    trades: Tuple[Trade, ...]
    equity: Tuple[EquityPoint, ...]


def report_of(
    fills: Sequence[RecordedFill],
    marks: Sequence[BarMark],
    schedule: Optional[ChargeSchedule],
    contract: Contract,
    capital: float,
) -> Report:
    """The whole report, folded from the fills, the bar closes and the schedule.

    **One pass, in one order, and the order is the result.** The fills are put in
    ``seq`` order once, here, and every fold below reads that same list: the
    charges are computed in it, the trades are built from it and the curve is
    marked along it. A second ordering anywhere would be a report that is right to
    eleven digits and different in the twelfth on somebody else's engine.
    """
    ordered = sorted(fills, key=lambda fill: fill.seq)
    charges = [
        0.0 if schedule is None else charge_for(schedule, fill, contract).total
        for fill in ordered
    ]

    trades = trades_of(ordered, charges, marks, contract)
    equity = equity_over(trades, marks, contract, capital)
    summary = summary_of(trades, equity, contract, capital)

    return Report(summary=summary, trades=trades, equity=equity)
