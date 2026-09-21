"""Step 4 of the bar cycle: the host's bar written into every ``"bar"`` register.

The derived price fields are written out as expressions rather than as formulas
because **their order of operations is part of the contract** (section 2.10):
``hlc3`` adds high to low, adds close to that, then divides. A different
association gives a different last bit, and a study that matches a reference
implementation on one engine and not on another is exactly the failure this
project exists to prevent.

**An absent volume rather than a zero is deliberate.** A script that sizes
something by volume has to be able to tell "no trades" from "nobody told me",
which is ``host-interface.md`` section 3.3 and three levels of the same
distinction.

Four of the eight bar facts are the host's and four are the engine's, and a fact
the engine can derive is never also stated by the host, because two sources for
one number can disagree and no rule would say which of them wins.
"""

from dataclasses import dataclass
from typing import Any, Tuple

from .contracts import Bar, BarState
from .values import ABSENT, finite, is_number

#: The bar fields section 2.10 names.
#:
#: ``oi`` is here and is the one field the section's own table does not list. It
#: is a field of a bar everywhere else: ``host-interface.md`` section 3.1 states
#: it, and section 2.16.2 folds it into a bucket bar by taking the last rather
#: than the sum. A register kind the compiler can emit and this engine could not
#: fill would be absent on every bar with nothing saying why, so it is filled and
#: the omission is reported rather than resolved here.
BAR_FIELDS: Tuple[str, ...] = (
    "open",
    "high",
    "low",
    "close",
    "volume",
    "time",
    "hl2",
    "hlc3",
    "ohlc4",
    "hlcc4",
    "oi",
    "bar.index",
    "bar.count",
    "bar.isFirst",
    "bar.isLast",
    "bar.isConfirmed",
    "bar.isRealtime",
    "bar.isNew",
    "bar.updates",
)


def is_bar_field(name: str) -> bool:
    return name in BAR_FIELDS


@dataclass(frozen=True)
class BarFacts:
    """The eight facts of ``language.md`` section 7.2, for the bar being executed.

    ``index`` is a position in the supplied data and not a universal address:
    loading more history shifts every index, which is why a script that has to
    remember a bar stores ``time`` instead.
    """

    index: int
    count: int
    is_first: bool
    is_last: bool
    is_confirmed: bool
    is_realtime: bool
    is_new: bool
    updates: float


def facts_for(index: int, supplied: int, state: BarState) -> BarFacts:
    return BarFacts(
        index=index,
        count=index + 1,
        is_first=index == 0,
        # True when this is the greatest index the host has supplied. A live
        # chart supplies bars one at a time, so its newest bar is always the
        # last; a run over a whole dataset supplies them together, so only its
        # final bar is.
        is_last=index == supplied - 1,
        is_confirmed=state.is_confirmed,
        is_realtime=state.is_realtime,
        is_new=state.is_new,
        updates=float(state.updates),
    )


def _held(value: Any) -> Any:
    return float(value) if is_number(value) else ABSENT


def bar_field(field: str, bar: Bar, facts: BarFacts) -> Any:
    """One bar field's value, by the definitions of section 2.10."""
    if field == "open":
        return _held(bar.open)
    if field == "high":
        return _held(bar.high)
    if field == "low":
        return _held(bar.low)
    if field == "close":
        return _held(bar.close)
    if field == "volume":
        return _held(bar.volume)
    if field == "oi":
        return _held(bar.oi)
    if field == "time":
        return _held(bar.time)

    high, low, close, opened = (
        _held(bar.high),
        _held(bar.low),
        _held(bar.close),
        _held(bar.open),
    )
    if field == "hl2":
        if high is ABSENT or low is ABSENT:
            return ABSENT
        return finite((high + low) / 2)
    if field == "hlc3":
        if high is ABSENT or low is ABSENT or close is ABSENT:
            return ABSENT
        return finite((high + low + close) / 3)
    if field == "ohlc4":
        if opened is ABSENT or high is ABSENT or low is ABSENT or close is ABSENT:
            return ABSENT
        return finite((opened + high + low + close) / 4)
    if field == "hlcc4":
        if high is ABSENT or low is ABSENT or close is ABSENT:
            return ABSENT
        return finite((high + low + close + close) / 4)

    if field == "bar.index":
        return float(facts.index)
    if field == "bar.count":
        return float(facts.count)
    if field == "bar.isFirst":
        return facts.is_first
    if field == "bar.isLast":
        return facts.is_last
    if field == "bar.isConfirmed":
        return facts.is_confirmed
    if field == "bar.isRealtime":
        return facts.is_realtime
    if field == "bar.isNew":
        return facts.is_new
    if field == "bar.updates":
        return float(facts.updates)
    return ABSENT
