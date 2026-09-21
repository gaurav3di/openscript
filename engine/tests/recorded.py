"""One conformance case on disk, read as ``conformance.md`` sections 2 and 3 write it.

The tests of the order layer and of the money are held to a case rather than to
figures typed beside them, because a figure typed beside a test agrees with
whoever typed it and with nobody else. A harvested case is what the first engine
produced, reviewed and committed, so a fold or a summary that reproduces it bit
for bit has agreed with an engine that was written from the same pages and not
from this one.

Nothing here decides anything. Every default is the case's own file, every number
is read from the bytes, and the declaration's own settings are read out of
``script.os`` rather than repeated here: a test that stated the capital itself
would pass on the day the case changed it.

**A number is read with the interpreter's own reader.** Section 3 writes a price
in the shortest decimal form that reads back to the exact binary64 value intended,
which is what ``float`` gives back, so nothing is parsed by hand and nothing is
rounded on the way in.
"""

import json
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from tests.support import REPOSITORY

from openscript.adapter.page import ABSENT_TEXT, BARS_HEADER, FRAMES_HEADER

#: Where the suite's cases live, which is the root a case id is relative to.
CASES = REPOSITORY / "cases"


@dataclass(frozen=True)
class RecordedBar:
    """One row of ``bars.csv``: the open time and the five prices."""

    time: float
    open: Optional[float]
    high: Optional[float]
    low: Optional[float]
    close: Optional[float]
    volume: Optional[float]


@dataclass(frozen=True)
class DeliveredFrame:
    """One row of ``frames.csv``, with the boundary it is delivered at."""

    after_bar: int
    #: An ordinal and not an id: 1 is the first intent the run placed.
    intent: int
    status: str
    filled_qty: float
    avg_fill_price: Optional[float]
    order_ref: str
    text: str


@dataclass(frozen=True)
class Case:
    """Everything one case directory holds that a test of this stage reads."""

    identifier: str
    bars: Tuple[RecordedBar, ...]
    frames: Tuple[DeliveredFrame, ...]
    expected: Dict[str, Any]
    backtest: Dict[str, Any]
    instrument: Dict[str, Any]
    declaration: Dict[str, Any]


def _value(text: str) -> Optional[float]:
    """One field of a case file, with section 3's spelling of absence."""
    return None if text == ABSENT_TEXT else float(text)


def _rows(text: str, header: Tuple[str, ...]) -> List[List[str]]:
    """The rows of a case's comma separated file, its header checked.

    An extra column is an error rather than ignored, so a typo in a header cannot
    silently drop an input, and a test reading one would be a test of nothing.
    """
    lines = [line for line in text.split("\n") if line != ""]
    columns = tuple(lines[0].split(","))
    if columns != header[: len(columns)] or len(columns) > len(header):
        raise ValueError(f"the header is {columns} and this file's is {header}")
    return [line.split(",") for line in lines[1:]]


def _bars_of(text: str) -> Tuple[RecordedBar, ...]:
    return tuple(
        RecordedBar(
            time=float(row[0]),
            open=_value(row[1]),
            high=_value(row[2]),
            low=_value(row[3]),
            close=_value(row[4]),
            volume=_value(row[5]) if len(row) > 5 else None,
        )
        for row in _rows(text, BARS_HEADER)
    )


def _frames_of(text: str) -> Tuple[DeliveredFrame, ...]:
    return tuple(
        DeliveredFrame(
            after_bar=int(row[0]),
            intent=int(row[1]),
            status=row[2],
            filled_qty=float(row[3]),
            avg_fill_price=_value(row[4]),
            order_ref=row[5] if len(row) > 5 else "",
            text=row[6] if len(row) > 6 else "",
        )
        for row in _rows(text, FRAMES_HEADER)
    )


#: How a declaration writes one setting, which is a name, an equals sign and a
#: literal. Enough for a strategy declaration and no more: a case whose settings
#: are computed is a case this reader refuses rather than guesses at.
SETTING = re.compile(r'(\w+)\s*=\s*("(?:[^"]*)"|-?[0-9]+(?:\.[0-9]+)?|true|false)')


def _declaration_of(text: str) -> Dict[str, Any]:
    """The settings the ``strategy(...)`` declaration states, as written.

    Read from the script because that is where the page puts them: a declaration
    is the script's and ``backtest.json`` is the host's, and a test that mixed the
    two would be reporting a run nobody carried out.
    """
    at = text.find("strategy(")
    if at < 0:
        return {}
    depth = 0
    end = at
    for index in range(at, len(text)):
        if text[index] == "(":
            depth += 1
        elif text[index] == ")":
            depth -= 1
            if depth == 0:
                end = index
                break
    found: Dict[str, Any] = {}
    for name, literal in SETTING.findall(text[at:end]):
        if literal.startswith('"'):
            found[name] = literal[1:-1]
        elif literal in ("true", "false"):
            found[name] = literal == "true"
        else:
            found[name] = float(literal)
    return found


def read_case(identifier: str) -> Case:
    """One case directory, by the identifier that is also its path."""
    directory = CASES / identifier
    optional = {}
    for name in ("frames.csv", "backtest.json", "instrument.json"):
        path = directory / name
        optional[name] = path.read_text(encoding="utf-8") if path.exists() else None

    return Case(
        identifier=identifier,
        bars=_bars_of((directory / "bars.csv").read_text(encoding="utf-8")),
        frames=() if optional["frames.csv"] is None else _frames_of(optional["frames.csv"]),
        expected=json.loads((directory / "expected.json").read_text(encoding="utf-8")),
        backtest={} if optional["backtest.json"] is None else json.loads(optional["backtest.json"]),
        instrument=(
            {} if optional["instrument.json"] is None else json.loads(optional["instrument.json"])
        ),
        declaration=_declaration_of((directory / "script.os").read_text(encoding="utf-8")),
    )


def strategy_cases() -> Tuple[str, ...]:
    """Every case in the suite that asserts what this stage computes.

    Read from the directory rather than listed here, so a case added to the suite
    is a case these tests run: a list typed here would go on naming two cases
    after the day a third arrived.
    """
    found: List[str] = []
    for path in sorted(CASES.rglob("case.json")):
        described = json.loads(path.read_text(encoding="utf-8"))
        if "orders" in described.get("asserts", []):
            found.append(described["id"])
    return tuple(found)
