"""What is settled about a read before bar 0, `compiled-program.md` 2.16.

**A request's identity is fixed before bar 0.** That is what lets the whole set be
known at load, what lets a host fetch in parallel and cache by instrument and
timeframe, and what makes a request that changed afterwards OS6013. So the three
identity fields are resolved here, once, from the value the script wrote, the
setting it named or the chart fact it named, and nothing below bar 0 asks again.

**Three refusals belong at load and the rest belong to the host.** A timeframe
the language does not know (OS6001), one finer than the chart's (OS6002) and one
that does not fold into the chart's (OS6015) are facts about the program and the
chart, both known before a bar runs, so they stop the load. An unknown
instrument (OS6007), a range with no bars (OS6008), a source that refused
(OS6009) and an interval the feed does not carry (OS6014) are the host's
answers: they leave the read absent, put the reason in ``req.error(read)`` and
let the study keep drawing everything else, which is `stdlib.md` 15.5.

**A provider is a function from a query to an answer**, `host-interface.md` 5.2
and 5.3: the bars at the requested timeframe, a refusal, a host still fetching,
or nothing at all. Nothing on a read of the chart's own instrument is the
ordinary case and the run folds its own bars; nothing on a read of another
instrument is OS6007, because the run holds none of that instrument's bars.
"""

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple, Union

from .buckets import Timeframe, fold_refusal, is_intraday, parse_timeframe
from .contracts import Bar
from .diagnostics import Diagnostic, failure
from .inputs import ResolvedInput
from .reasons import reason


@dataclass(frozen=True)
class RequestQuery:
    """One read as a host is asked about it, `host-interface.md` 5.2, every field resolved."""

    id: int
    read: str
    #: The instrument asked for, or nothing where a setting behind a ``"symbol"``
    #: read held no identity: the chart's own is never substituted there.
    instrument: Optional[str]
    #: Where it trades: the one the script named, or the chart's.
    exchange: Optional[str]
    timeframe: str
    mode: str
    warmup: Optional[int]


@dataclass(frozen=True)
class Answered:
    """The host's own bars at the requested timeframe, oldest first."""

    bars: Sequence[Bar]


@dataclass(frozen=True)
class Pending:
    """A host still fetching: the read is absent and not ready, and says no reason."""


@dataclass(frozen=True)
class Refusal:
    """Why a host cannot answer, `host-interface.md` 5.4, with its own words."""

    code: str
    reason: Optional[str] = None
    #: The intervals it does serve, for OS6014.
    available: Optional[str] = None


Answer = Union[Answered, Pending, Refusal]

#: What a run asks for another instrument's or another interval's bars.
Provider = Callable[[RequestQuery], Optional[Answer]]


@dataclass(frozen=True)
class Plan:
    """A read once its identity, its timeframe and its zone are fixed."""

    request: Dict[str, Any]
    query: RequestQuery
    timeframe: Timeframe
    #: The zone a calendar bucket is dated in, or nothing when none was stated.
    zone: Any


def identity_of(field: Any, inputs: Sequence[ResolvedInput], instrument: Mapping[str, Any]) -> Optional[str]:
    """One of the three identity fields, resolved: a value, a setting, or a chart fact."""
    if isinstance(field, str):
        return field
    if not isinstance(field, dict):
        return None
    named = field.get("input")
    if isinstance(named, str):
        found = next((one for one in inputs if one.key == named), None)
        return found.value if found is not None and isinstance(found.value, str) else None
    if field.get("chart") in ("symbol", "exchange", "interval"):
        held = instrument.get(field["chart"])
        return held if isinstance(held, str) else None
    return None


def plan_requests(
    requests: Sequence[Any], inputs: Sequence[ResolvedInput], instrument: Mapping[str, Any]
) -> Tuple[List[Plan], Optional[Diagnostic]]:
    """Every read the program makes, nested ones included, or the load refusal.

    A read written inside another is compared against the timeframe of the one
    it is written in, because those are the bars it folds.
    """
    chart = parse_timeframe(instrument.get("interval"))
    plans: List[Plan] = []
    return plans, _collect(requests, inputs, instrument, chart, plans)


def _collect(
    requests: Sequence[Any],
    inputs: Sequence[ResolvedInput],
    instrument: Mapping[str, Any],
    chart: Optional[Timeframe],
    into: List[Plan],
) -> Optional[Diagnostic]:
    for request in requests:
        written = identity_of(request["timeframe"], inputs, instrument)
        timeframe = None if written is None else parse_timeframe(written)
        if timeframe is None:
            return failure("OS6001", value="nothing" if written is None else written)
        # The chart's interval is a host fact and a host may state none; then
        # there is nothing to compare a request against, and nothing is.
        refused = None if chart is None else fold_refusal(timeframe, chart)
        if refused is not None and chart is not None:
            if refused[0] == "OS6002":
                return failure("OS6002", chart=chart.text, requested=timeframe.text)
            return failure(
                "OS6015", requested=timeframe.text, chart=chart.text, suggestion=refused[1]
            )
        query = RequestQuery(
            id=request["id"],
            read=request["read"],
            instrument=_instrument_of(request, inputs, instrument),
            exchange=_exchange_of(request, inputs, instrument),
            timeframe=timeframe.text,
            mode=request["mode"],
            warmup=request["warmup"],
        )
        into.append(Plan(request, query, timeframe, instrument.get("timezone")))
        nested = _collect(request["body"]["requests"], inputs, instrument, timeframe, into)
        if nested is not None:
            return nested
    return None


def _instrument_of(request: Any, inputs: Sequence[ResolvedInput], instrument: Mapping[str, Any]) -> Optional[str]:
    """The instrument a read asks about, with the format's default applied to a timeframe read only.

    A ``"symbol"`` read whose setting held no instrument stays without one:
    falling back there would turn a read of another instrument into a second
    read of this one, and nothing would say so.
    """
    named = identity_of(request["symbol"], inputs, instrument)
    if named is not None:
        return named
    held = instrument.get("symbol")
    return held if request["read"] == "timeframe" and isinstance(held, str) else None


def _exchange_of(request: Any, inputs: Sequence[ResolvedInput], instrument: Mapping[str, Any]) -> Optional[str]:
    """Where a read's instrument trades, with `stdlib.md` 15.1's default of the chart's."""
    named = identity_of(request["exchange"], inputs, instrument)
    if named is not None:
        return named
    held = instrument.get("exchange")
    return held if isinstance(held, str) else None


def ask_host(plan: Plan, provider: Optional[Provider]) -> Optional[Answer]:
    """What the host says about one read, or nothing where the run folds its own bars."""
    answer = None if provider is None else provider(plan.query)
    if answer is not None:
        return answer
    if plan.query.read == "timeframe":
        return None
    return Refusal("OS6007")


def undatable(plan: Plan) -> bool:
    """A day, week or month read with no zone to date a bucket in: absent on every bar.

    Nothing arriving later supplies a fact the instrument record does not hold,
    so the read is not waiting for anything, and it says why rather than
    leaving a blank pane nobody can explain.
    """
    return not is_intraday(plan.timeframe) and plan.zone is None


def _named(query: RequestQuery) -> str:
    """The instrument a reason names: the one the read asked for, or the chart's."""
    return "the chart's instrument" if query.instrument is None else query.instrument


def undatable_reason(query: RequestQuery) -> str:
    """OS6012's sentence for a read with no zone, which ``req.error`` reports."""
    return reason("OS6012", fact="a timezone", symbol=_named(query))


def reason_for(refusal: Refusal, query: RequestQuery) -> str:
    """The sentence a refusal reads as through ``req.error``, with the host's own words carried."""
    symbol = _named(query)
    if refusal.code == "OS6007":
        exchange = "the chart's exchange" if query.exchange is None else query.exchange
        return reason("OS6007", symbol=symbol, exchange=exchange)
    if refusal.code == "OS6008":
        return reason("OS6008", symbol=symbol, timeframe=query.timeframe)
    if refusal.code == "OS6014":
        available = "nothing it named" if refusal.available is None else refusal.available
        return reason("OS6014", timeframe=query.timeframe, symbol=symbol, available=available)
    if refusal.code == "OS6015":
        suggestion = "a whole multiple of it" if refusal.available is None else refusal.available
        return reason(
            "OS6015", requested=query.timeframe, chart="the chart's interval", suggestion=suggestion
        )
    said = "the host gave no reason" if refusal.reason is None else refusal.reason
    return reason("OS6009", symbol=symbol, timeframe=query.timeframe, reason=said)
