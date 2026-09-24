"""A read of another instrument, served from the case's own file.

`conformance.md` section 3: every byte of input lives in the case directory, so a
read the host would answer (`host-interface.md` 5.3) is answered from a file the
case holds, named after the instrument the read asks for: ``bars.OTHER.csv`` for
a read of ``OTHER``, with the columns ``bars.csv`` has, at the timeframe the read
requests. A read of the chart's own instrument is not a file: the run folds
``bars.csv``, as an engine folds the bars it holds.

**A read whose file is missing is a case failure, not an absent series.** A
silently empty series is exactly the bug the suite is meant to catch, so a read
that names an instrument the directory holds no file for is a malformed case
and the caller reports it ``error`` naming the file, rather than a refusal the
study would draw around. The one exception is a read with no instrument at all,
a setting that held none: there is no file to name, and `host-interface.md` 5.2
says what a host answers then, which is OS6007.

The file is read when the read asks for it, and only then, which is the one
moment its name is known.
"""

from typing import Any, List, Optional

from ..contracts import Bar as EngineBar
from ..request_plan import Answer, Answered, Provider, Refusal, RequestQuery
from ..values import ABSENT
from .page import SECONDARY_PREFIX, SECONDARY_SUFFIX
from .reading import Bar, Case, read_bars
from .spellings import Malformed


def engine_bar(bar: Bar) -> EngineBar:
    """One row of a bars file as the engine's own bar. An absent field stays absent."""
    return EngineBar(
        time=float(bar.time),
        open=bar.open,
        high=bar.high,
        low=bar.low,
        close=bar.close,
        volume=bar.volume,
        oi=ABSENT,
    )


def file_for(instrument: str) -> str:
    """The name section 3 gives the file that answers a read of this instrument."""
    return f"{SECONDARY_PREFIX}{instrument}{SECONDARY_SUFFIX}"


def provider_for(case: Case) -> Provider:
    """The host a case is, for reads: its own files, and nothing it does not hold."""

    def provider(query: RequestQuery) -> Optional[Answer]:
        if query.read != "symbol":
            return None
        if query.instrument is None:
            return Refusal("OS6007")
        name = file_for(query.instrument)
        if name not in case.secondary:
            raise Malformed(
                f"{name} is missing: the script reads {query.instrument} at {query.timeframe}, and "
                "conformance.md section 3 serves a read of another instrument from that file. A read "
                "whose file is missing is a case failure, not an absent series"
            )
        try:
            text = (case.directory / name).read_text(encoding="utf-8")
        except OSError as reason:
            raise Malformed(f"{name} could not be read: {reason}") from None
        rows: List[Any] = read_bars(text, name)
        return Answered([engine_bar(one) for one in rows])

    return provider
