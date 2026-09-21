"""The money: what a run made, what it cost, and what that is worth knowing.

**This package imports no interpreter and no ledger, and it never will.** It is
arithmetic over portable data: a list of settled fills, a list of bar closes, a
charge schedule and the contract the run was carried out under. Two things follow
from that and both of them are the reason for it.

A stored record can be reported again with no engine present, which is what makes
a run record a conformance case rather than a souvenir. And the engine can call
this, when the day comes that a script may read its own equity, without a cycle
and without a second implementation of any of these formulas sitting inside the
execution path disagreeing with this one.

What is here:

- ``shapes``      the atoms: a fill, a contract and a bar's close
- ``charges``     what one fill cost, in the order the lines are declared
- ``trades``      the round trips, one per position reference
- ``equity``      one point per report bar, marked to the close
- ``statistics``  the summary, and which half of the trade list each figure counts
- ``report``      the one pass, in the one order, that is the result

**What none of these is, is specified.** ``conformance.md`` section 4 makes
``performance`` a channel a case asserts and ``stdlib.md`` 17.4 leaves every
figure in it planned, so the formulas below are read from the first engine rather
than from a page. That is a defect of the specification and not of either engine,
and it is recorded where a reader of this package will meet it rather than only in
a report nobody keeps.
"""

from .analysis import SideAnalysis, TradeAnalysis, analysis_of
from .charges import (
    ChargeBreakdown,
    ChargeLine,
    ChargeSchedule,
    charge_for,
    round_money,
    schedule_from_declaration,
    schedule_problem,
)
from .equity import EquityPoint, bars_in_market_over, equity_over, open_on_bar, ratio_of
from .report import Report, report_of
from .shapes import BarMark, Contract, RecordedFill
from .statistics import Summary, summary_of
from .trades import Trade, closed_by, opened_by, trades_of

__all__ = [
    "BarMark",
    "ChargeBreakdown",
    "ChargeLine",
    "ChargeSchedule",
    "Contract",
    "EquityPoint",
    "RecordedFill",
    "Report",
    "SideAnalysis",
    "Summary",
    "Trade",
    "TradeAnalysis",
    "analysis_of",
    "bars_in_market_over",
    "charge_for",
    "closed_by",
    "equity_over",
    "open_on_bar",
    "opened_by",
    "ratio_of",
    "report_of",
    "round_money",
    "schedule_from_declaration",
    "schedule_problem",
    "summary_of",
    "trades_of",
]
