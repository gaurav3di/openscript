"""One case, run on this engine, and the channels that come out of it.

This is the half of the adapter that is about the engine rather than about the
command line. It takes a case directory already read and the compiled program
the invocation was handed, loads the program, executes every bar of ``bars.csv``
and projects what it computed into the channels the case asserts, in the
encoding ``conformance.md`` section 4 gives each of them. It compares nothing.

**What this engine cannot do is named rather than guessed at, and the engine is
what names it.** ``compiled-program.md`` section 9.4 has a load refuse a program
whose capability tag the engine does not serve (OS6006), whose library entry its
manifest does not hold (OS6004), and whose format or language version it does not
implement (OS6016, OS6017). Each of those refusals carries the thing it refused,
by name, so the ``unsupported`` outcome section 9 asks for is read out of the
engine's own answer instead of being decided by a list kept here. A list kept
here would say what somebody believed this engine cannot do; the refusal says
what it actually refused.

**Every other refusal is a diagnostic and not an absence of support.** A
malformed program, a stored setting the engine will not run with, a budget
overrun, a division the script wrote: those are things this engine did, they
carry a code and a position, and they go into the ``diagnostics`` channel where a
case can assert them.

**The bars are confirmed and are not live.** A case is a run over a dataset, so
every execution is a new, confirmed, non-realtime bar with one update, and the
count supplied is the whole file: that is what makes ``bar.isLast`` true on the
last row and false everywhere else. An engine that only backtests is handed
``isRealtime`` false throughout, which is why no alert is raised here, and
``run.py`` reaches the same answer from the other side.
"""

from typing import Any, Dict, List, Optional, Sequence, Tuple

from ..contracts import Bar as EngineBar, BarState
from ..inputs import utc_time
from ..run import load_text
from ..values import ABSENT
from ..verify import capabilities
from .reading import Bar, Case
from .serving import Serving, is_reference
from .spellings import Malformed, as_reported

#: The codes a load raises when the program needs something this engine does not
#: have, each with the field naming what it was.
_UNSUPPORTED_CODES = {
    "OS6006": ("tag", "the capability {value}"),
    "OS6004": ("name", "the library function {value}"),
    "OS6016": ("found", "the compiled format {value}"),
    "OS6017": ("found", "language version {value}"),
}

#: Section 4: the channels this engine answers today. Everything else a case may
#: assert is named ``unsupported`` on the case rather than answered emptily,
#: because an empty channel compares equal to an empty expectation and would be a
#: pass nobody earned.
ANSWERED = ("diagnostics", "values")

#: The timezone the engine's own time reader is right for. Every other zone is a
#: reader the host supplies, and this engine has not been given one.
_READABLE_ZONE = "UTC"


class Answer:
    """What one case run produced: channels, and what could not be answered.

    ``column_types`` is the declared type of the channel behind each column of
    ``expected.csv`` that this program resolved, which is what lets a cell of
    that file be read as the value it is rather than as the shape of its text.
    """

    def __init__(self) -> None:
        self.channels: Dict[str, Any] = {}
        self.unsupported: List[str] = []
        self.column_types: Dict[str, str] = {}

    def cannot(self, feature: str) -> None:
        if feature not in self.unsupported:
            self.unsupported.append(feature)


def _diagnostic_row(code: str, line: int, column: int, bar: Optional[int]) -> Dict[str, Any]:
    """A diagnostic in the columns section 4 compares one on, and the bar it was on."""
    return {"code": code, "line": line, "column": column, "severity": "error", "barIndex": bar}


def _unsupported_from(diagnostic: Any) -> Optional[str]:
    """The feature a load refusal names, or nothing when it is a real diagnostic."""
    held = _UNSUPPORTED_CODES.get(diagnostic.code)
    if held is None:
        return None
    field, sentence = held
    value = diagnostic.values.get(field)
    return sentence.format(value=value)


def _engine_bar(bar: Bar) -> EngineBar:
    """One row of the file as the engine's own bar. An absent field stays absent."""
    return EngineBar(
        time=float(bar.time),
        open=bar.open,
        high=bar.high,
        low=bar.low,
        close=bar.close,
        volume=bar.volume,
        oi=ABSENT,
    )


def _plot_channels(program: Dict[str, Any]) -> Dict[str, int]:
    """Every plot's legend title and its stable key, against its channel.

    ``compiled-program.md`` section 11 maps ``outputs.plots[]`` and their
    channels to one column per plot, which is what a column of ``expected.csv``
    is. The title is what a legend shows and what an expected file names; the key
    is accepted beside it because it is the plot's stable identity and a case may
    reasonably have been written against either.
    """
    found: Dict[str, int] = {}
    for plot in program["outputs"]["plots"]:
        for name in (plot["title"], plot["key"]):
            if isinstance(name, str) and name not in found:
                found[name] = plot["channel"]
    return found


def _values_channel(
    columns: Sequence[str], program: Dict[str, Any], rows: Sequence[List[Any]], answer: Answer
) -> List[Dict[str, Any]]:
    """One object per bar, holding the asserted columns and nothing else.

    A column names a plot, and a plot names a channel. A column this program has
    no plot for is not answered as absence, because absence is a value a case can
    assert and a column nobody can resolve is a case this engine cannot run.
    """
    channels = _plot_channels(program)
    resolved: List[Tuple[str, int]] = []
    for name in columns:
        if name not in channels:
            answer.cannot(
                f"the column {name}: this program declares no plot with that title or key, so "
                "there is no channel for it to be read from"
            )
            continue
        resolved.append((name, channels[name]))
        answer.column_types[name] = program["channels"][channels[name]]["type"]
    out: List[Dict[str, Any]] = []
    for row in rows:
        held: Dict[str, Any] = {}
        for name, channel in resolved:
            value = row[channel] if channel < len(row) else ABSENT
            held[name] = None if is_reference(value) else as_reported(value)
        out.append(held)
    return out


def _time_input_unreadable(program: Dict[str, Any], instrument: Dict[str, Any]) -> bool:
    """Whether the program declares a time this engine cannot read in this zone.

    ``stdlib.md`` section 12.1 reads a calendar field in the chart's timezone,
    which the host states; this engine carries a reader for one zone and a host
    with any other supplies its own. A case in another zone whose script takes a
    time is therefore a case this engine would answer under the wrong calendar,
    and it says so instead.
    """
    if instrument.get("timezone") == _READABLE_ZONE:
        return False
    return any(one["kind"] == "time" for one in program["inputs"])


def run_case(case: Case, program_text: str) -> Answer:
    """Load the program, run every bar, and project the asserted channels."""
    answer = Answer()
    unanswered = [channel for channel in case.asserts if channel not in ANSWERED]
    if unanswered:
        answer.cannot(
            f"the {', '.join(unanswered)} channel{'' if len(unanswered) == 1 else 's'} "
            "of section 2: this engine answers "
            f"{' and '.join(ANSWERED)}, and every other channel belongs to a stage that is not "
            "wired into it yet"
        )
    if case.ticks:
        answer.cannot(
            "ticks.csv (section 3): the machine re-executes a bar and rolls its state back, and "
            "how a tick row becomes the newest bar's four prices is not written down anywhere, so "
            "a replay here would be this adapter's invention"
        )
    for name in case.secondary:
        answer.cannot(f"{name} (section 3): this engine is handed one series and reads no other")
    if case.frames is not None:
        answer.cannot(
            "frames.csv (section 3): an order frame is folded by a ledger, and this engine has none"
        )
    if "expectedExitCode" in case.declared:
        answer.cannot(
            "case.json's expectedExitCode: section 2 names the field and fixes no shape for it, so "
            "a reading here would be one no other engine has to share"
        )

    if answer.unsupported:
        return answer

    serving = Serving()
    loaded = load_text(
        program_text,
        dict(case.settings),
        serving,
        capabilities=capabilities(),
        read_time=utc_time,
    )
    if loaded.diagnostic is not None:
        feature = _unsupported_from(loaded.diagnostic)
        if feature is not None:
            answer.cannot(feature)
            return answer
        answer.channels = _empty_but(
            case, {"diagnostics": [_diagnostic_row(loaded.diagnostic.code, loaded.diagnostic.line, loaded.diagnostic.column, None)]}
        )
        return answer

    run = loaded.run
    raw = run.program.raw
    if _time_input_unreadable(raw, case.instrument):
        answer.cannot(
            f"a time input under the timezone {case.instrument.get('timezone')}: this engine reads "
            f"a written time as {_READABLE_ZONE} and a host with another zone supplies its own reader"
        )
    if answer.unsupported:
        return answer

    if case.bars is None:
        needed = [one for one in case.asserts if one != "diagnostics"]
        if needed:
            raise Malformed(
                f"the case asserts {', '.join(needed)} and holds no bars.csv, which section 2 "
                "requires of an engine case"
            )
        answer.channels = {"diagnostics": []}
        return answer

    rows, diagnostics = _every_bar(run, serving, case)
    answered: Dict[str, Any] = {"diagnostics": diagnostics}
    if "values" in case.asserts:
        if not case.expected_columns:
            raise Malformed(
                "the case asserts values and holds no expected.csv, which section 4 says is where "
                "one column per asserted channel and one row per bar are written"
            )
        answered["values"] = _values_channel(case.expected_columns, raw, rows, answer)
    answer.channels = _empty_but(case, answered)
    return answer


def _empty_but(case: Case, answered: Dict[str, Any]) -> Dict[str, Any]:
    """The asserted channels this engine answers, and nothing it does not."""
    return {channel: answered[channel] for channel in case.asserts if channel in answered}


def _every_bar(
    run: Any, serving: Serving, case: Case
) -> Tuple[List[List[Any]], List[Dict[str, Any]]]:
    """Every bar of the file, in order, stopping at the first that fails.

    A study stops at the bar that failed and reports the diagnostic: the columns
    of the bars before it stand, and there are no columns after it. That is the
    engine's own behaviour and not a decision here, and it is what makes a length
    difference in the values channel the first thing a reader of a failed case
    sees.
    """
    bars = case.bars or []
    supplied = len(bars)
    when = case.declared.get("now", ABSENT)
    rows: List[List[Any]] = []
    for index, bar in enumerate(bars):
        previous = bars[index - 1].close if index > 0 else ABSENT
        serving.at_bar(bar.high, bar.low, previous, index == 0)
        result = run.execute_bar(
            index,
            _engine_bar(bar),
            BarState(is_new=True, is_confirmed=True, is_realtime=False, updates=1.0),
            supplied=supplied,
            instrument=case.instrument,
            now=when,
        )
        if result.diagnostic is not None:
            found = result.diagnostic
            return rows, [_diagnostic_row(found.code, found.line, found.column, index)]
        rows.append(list(result.columns))
    return rows, []
