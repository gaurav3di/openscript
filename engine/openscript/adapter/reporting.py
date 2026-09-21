"""What a strategy case's report was folded under, out of the case's own files.

``conformance.md`` section 3 splits the facts across three files and says why:
``instrument.json`` is what the engine read about the instrument,
``settings.json`` is what the script's inputs were set to, and ``backtest.json``
is "the rest of what the host decided, the part the money and the report depend
on". The declaration is the script's own and arrives in the compiled program's
meta. Nothing here is a default: a digit count nobody stated is a figure two
engines round differently, and this module would rather refuse than choose one.

**The window is compared against the bars' own times and never against a
calendar.** Both bounds are inclusive, and a bar outside them executes and is not
reported: its orders are real and a position opened on it is carried into the
window. That is section 3's paragraph, and a mark carries the answer per bar so
that the fold reads it rather than recomputing it.
"""

from typing import Any, Dict, Optional, Sequence

from ..accounting import BarMark, ChargeSchedule, Contract, schedule_from_declaration
from .reading import Bar, Case
from .spellings import Malformed

#: Section 3: the file a strategy case is required to carry, and what it holds.
BACKTEST = "backtest.json"


def backtest_of(case: Case) -> Dict[str, Any]:
    """``backtest.json``, or the refusal section 3 promises a case without one.

    Read rather than assumed, and refused rather than defaulted: this engine once
    could not run a strategy case at all, and the first one that ran under a
    digit count nobody stated would have agreed with the engine next door by
    coincidence.
    """
    if case.backtest is None:
        raise Malformed(
            f"{BACKTEST} is missing, and section 3 requires it of a strategy case: a digit count "
            "nobody stated is a figure two engines round differently, so the case is not run "
            "under a default"
        )
    return case.backtest


def contract_for(case: Case) -> Contract:
    """The instrument facts a run was carried out under, plus the run's own digits.

    Two files and no default, which is why section 3 puts the record in one and
    the digit count in the other: ``host-interface.md`` 4.1 defines the record as
    twelve facts and a rounding count is not among them.
    """
    instrument = case.instrument
    return Contract(
        currency=instrument.get("currency", ""),
        symbol=instrument.get("symbol"),
        exchange=instrument.get("exchange"),
        tick_size=instrument.get("tickSize"),
        lot_size=instrument.get("lotSize"),
        point_value=instrument.get("pointValue", 1.0),
        digits=backtest_of(case)["digits"],
    )


def schedule_for(case: Case, declared: Dict[str, Any]) -> Optional[ChargeSchedule]:
    """The charge schedule the run was carried out under.

    The host's where it supplied one, and otherwise the declaration's own
    commission and slippage, which an engine derives from the script the same
    way. A supplied schedule's currency and digit count are the contract's,
    because a run under a schedule that disagrees with its contract is refused
    before its first bar, so the two cannot differ inside one case.
    """
    supplied = backtest_of(case)["costs"]
    contract = contract_for(case)
    if supplied is not None:
        return ChargeSchedule(
            currency=supplied["currency"],
            digits=supplied["digits"],
            slippage_ticks=supplied.get("slippageTicks", 0.0),
            lines=(),
            source="supplied",
        )
    return schedule_from_declaration(
        declared["commission"],
        declared["commissionType"],
        declared["slippage"],
        contract.currency,
        contract.digits,
    )


def marks_for(case: Case, bars: Sequence[Bar]) -> tuple:
    """One mark per bar supplied, warmup included, with the window's own answer."""
    window = backtest_of(case)["range"]
    lower = window["from"]
    upper = window["to"]

    def inside(bar: Bar) -> bool:
        if lower is not None and bar.time < lower:
            return False
        if upper is not None and bar.time > upper:
            return False
        return True

    return tuple(
        BarMark(bar_index=at, time=float(bar.time), close=bar.close, in_report=inside(bar))
        for at, bar in enumerate(bars)
    )
