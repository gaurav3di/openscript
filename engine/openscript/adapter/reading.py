"""One case directory, read by the names ``conformance.md`` section 2 gives it.

Section 2's table "is the whole of a case directory. A runner reads no other
file from it, and a file the table does not name is not input", so a directory
holding a file the table does not name is refused rather than read past: a case
that needed something no row covers is a case the suite cannot run until the row
exists, and an adapter that quietly ignored the file would run it under
different input from the engine next door.

Every refusal here is one sentence naming the file and what was wrong with it,
and every one of them reaches the caller as ``error`` (section 9): a malformed
case is not a failure of the engine, and reporting it as one would put the blame
on whoever is running the suite rather than on whoever wrote the directory.

**Nothing here is computed.** Bars are the file's, settings are the file's,
instrument facts are the file's or, when the file is absent, section 3's default
set carried in ``page.py``. That is the reason a case is reproducible on a
machine that has never seen this repository.
"""

import csv
import io
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .page import (
    ABSENT_TEXT,
    BACKTEST_FIELDS,
    BARS_HEADER,
    CHANNELS,
    DEFAULT_INSTRUMENT,
    FRAMES_HEADER,
    PROFILES,
    is_case_file,
    is_secondary,
)
from .spellings import Malformed, read_number, read_whole


@dataclass(frozen=True)
class Bar:
    """One row of ``bars.csv``, with an absent field held as absence."""

    time: int
    open: Optional[float]
    high: Optional[float]
    low: Optional[float]
    close: Optional[float]
    volume: Optional[float]


@dataclass(frozen=True)
class Frame:
    """One row of ``frames.csv``, with the boundary it is delivered at.

    ``intent`` is an ordinal and not an id: 1 is the first intent the run placed.
    A case cannot know the id an engine minted and must not depend on its
    spelling, so the ordinal is what a case names an order by and the driver maps
    it to whatever this engine minted.
    """

    after_bar: int
    intent: int
    status: str
    filled_qty: float
    avg_fill_price: Optional[float]
    order_ref: str
    text: str
    #: The destination's own instant for this frame, absent where it stated
    #: none. ``stdlib.md`` 17.7 folds a row's ``updatedAt`` from it, so a reader
    #: that dropped this column would hand the ledger frames that leave that
    #: field where the placement put it, whatever the case says its destination
    #: did. Defaulted because a file written before the column existed is a file
    #: whose frames state no instant.
    time: Optional[float] = None


@dataclass
class Case:
    """A case directory, read. Every field is a file's, or the page's default."""

    directory: Path
    declared: Dict[str, Any]
    script: str
    bars: Optional[List[Bar]] = None
    expected_columns: Tuple[str, ...] = ()
    expected_rows: List[List[str]] = field(default_factory=list)
    expected_json: Optional[Dict[str, Any]] = None
    instrument: Dict[str, Any] = field(default_factory=dict)
    stated_instrument: bool = False
    settings: Dict[str, Any] = field(default_factory=dict)
    backtest: Optional[Dict[str, Any]] = None
    ticks: bool = False
    frames: Optional[Tuple[Frame, ...]] = None
    secondary: Tuple[str, ...] = ()

    @property
    def identity(self) -> str:
        return str(self.declared.get("id"))

    @property
    def asserts(self) -> Tuple[str, ...]:
        return tuple(self.declared["asserts"])


def _text_of(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError as reason:
        raise Malformed(f"{path.name} could not be read: {reason}") from None


def _json_of(path: Path) -> Any:
    try:
        return json.loads(_text_of(path))
    except ValueError as reason:
        raise Malformed(f"{path.name} is not JSON: {reason}") from None


def _rows_of(text: str, name: str) -> List[List[str]]:
    """A comma separated file as rows, with the blank lines refused not dropped.

    Section 3 says no blank lines, so one is a defect in the file rather than
    something to skip: a dropped row and an empty row look the same afterwards,
    and the whole reason the expected file carries a bar index is that a dropped
    row is caught where it was dropped.
    """
    rows = [row for row in csv.reader(io.StringIO(text))]
    while rows and rows[-1] == []:
        rows.pop()
    for at, row in enumerate(rows):
        if row == []:
            raise Malformed(f"{name} line {at + 1} is blank, and a case file holds no blank line")
    if not rows:
        raise Malformed(f"{name} is empty, and a case file that holds nothing is not input")
    return rows


def _header_held(row: Sequence[str], wanted: Sequence[str], name: str) -> None:
    if tuple(row) != tuple(wanted):
        raise Malformed(
            f"{name} has the header {','.join(row)} and section 3 gives it {','.join(wanted)}. "
            "An extra or missing column is an error rather than ignored, so a typo in a header "
            "cannot silently drop an input"
        )


def read_bars(text: str, name: str = "bars.csv") -> List[Bar]:
    """``bars.csv``: the header section 3 prints, then one row per bar."""
    rows = _rows_of(text, name)
    _header_held(rows[0], BARS_HEADER, name)
    bars: List[Bar] = []
    for at, row in enumerate(rows[1:]):
        where = f"{name} line {at + 2}"
        if len(row) != len(BARS_HEADER):
            raise Malformed(f"{where} holds {len(row)} fields and the header names {len(BARS_HEADER)}")
        time = read_whole(row[0], f"{where}, time")
        prices = [
            None if cell == ABSENT_TEXT else read_number(cell, f"{where}, {BARS_HEADER[which + 1]}")
            for which, cell in enumerate(row[1:])
        ]
        if bars and time <= bars[-1].time:
            raise Malformed(
                f"{where} is at {time} and the bar before it is at {bars[-1].time}. A bar's open "
                "time is strictly increasing, and a run over bars in another order is not the run "
                "the expected file came from"
            )
        bars.append(Bar(time, prices[0], prices[1], prices[2], prices[3], prices[4]))
    if not bars:
        raise Malformed(f"{name} holds a header and no bar")
    return bars


def read_frames(text: str, name: str = "frames.csv") -> Tuple[Frame, ...]:
    """``frames.csv``: one row per frame, in the order the destination sent them.

    Section 3 gives the header and makes the last three columns optional, dropped
    from the right, and "an omitted column is absent on every row". An extra
    column is an error, as in ``bars.csv``, and so is a column out of order: the
    fields are read by position, and a file that named them in another order
    would be folded into another ledger without anything saying so.

    Nothing is sorted. "Several rows may name one bar and are delivered in file
    order, which is how a case orders two frames that cross", so the file's order
    is the delivery order and this reader is the last place it could be lost.
    """
    rows = _rows_of(text, name)
    header = tuple(rows[0])
    if header != FRAMES_HEADER[: len(header)]:
        raise Malformed(
            f"{name} has the header {','.join(header)} and section 3 gives it "
            f"{','.join(FRAMES_HEADER)}, of which only the last three columns may be left out"
        )
    found: List[Frame] = []
    for at, row in enumerate(rows[1:]):
        where = f"{name} line {at + 2}"
        if len(row) != len(header):
            raise Malformed(f"{where} holds {len(row)} fields and the header names {len(header)}")
        cell = dict(zip(header, row))
        price = cell["avgFillPrice"]
        instant = cell.get("time", ABSENT_TEXT)
        found.append(
            Frame(
                after_bar=read_whole(cell["afterBar"], f"{where}, afterBar"),
                intent=read_whole(cell["intent"], f"{where}, intent"),
                status=cell["status"],
                filled_qty=read_number(cell["filledQty"], f"{where}, filledQty"),
                avg_fill_price=(
                    None if price == ABSENT_TEXT else read_number(price, f"{where}, avgFillPrice")
                ),
                order_ref=cell.get("orderRef", ""),
                text=cell.get("text", ""),
                time=(
                    None if instant == ABSENT_TEXT else read_number(instant, f"{where}, time")
                ),
            )
        )
    return tuple(found)


def _read_expected_csv(text: str) -> Tuple[Tuple[str, ...], List[List[str]]]:
    """``expected.csv``: the bar index, then one column per asserted channel.

    The ``bar`` column is redundant on purpose and is held to the row position
    here, which is section 4's own reason for it: a dropped row is caught at the
    row it was dropped at rather than at the end.
    """
    rows = _rows_of(text, "expected.csv")
    header = rows[0]
    if not header or header[0] != "bar":
        raise Malformed("expected.csv: the first column is the zero-based bar index, named bar")
    for at, row in enumerate(rows[1:]):
        where = f"expected.csv line {at + 2}"
        if len(row) != len(header):
            raise Malformed(f"{where} holds {len(row)} fields and the header names {len(header)}")
        if read_whole(row[0], f"{where}, bar") != at:
            raise Malformed(
                f"{where} says it is bar {row[0]} and it is at row {at}. The index is redundant so "
                "that a dropped row is caught where it was dropped"
            )
    return tuple(header[1:]), [row[1:] for row in rows[1:]]


def _instrument_from(held: Any) -> Dict[str, Any]:
    if not isinstance(held, dict):
        raise Malformed("instrument.json is not an object of instrument facts")
    if not isinstance(held.get("hasVolume"), bool):
        raise Malformed(
            "instrument.json states no hasVolume. host-interface.md 4.1 requires the volume flag "
            "of every host, and it is the one fact an engine does not refuse a run without, so a "
            "file that omits it would hand the engine a study the expected output did not come from"
        )
    return dict(held)


def _backtest_from(held: Any) -> Dict[str, Any]:
    """``backtest.json``, held to the three fields section 3 names and their shapes."""
    if not isinstance(held, dict):
        raise Malformed("backtest.json is not an object")
    for key in held:
        if key not in BACKTEST_FIELDS:
            raise Malformed(f"backtest.json states {key}, which section 3 does not name")
    for key in BACKTEST_FIELDS:
        if key not in held:
            raise Malformed(f"backtest.json states no {key}, which section 3 requires")
    digits = held["digits"]
    if not isinstance(digits, int) or isinstance(digits, bool) or digits < 0:
        raise Malformed("backtest.json: digits is a whole number of decimal places")
    costs = held["costs"]
    if costs is not None and not isinstance(costs, dict):
        raise Malformed("backtest.json: costs is a charge schedule or null")
    window = held["range"]
    if not isinstance(window, dict):
        raise Malformed("backtest.json: range is an object of two bounds")
    for bound in ("from", "to"):
        value = window.get(bound)
        if value is not None and (not isinstance(value, int) or isinstance(value, bool)):
            raise Malformed(f"backtest.json: range.{bound} is a whole number of milliseconds or null")
    return dict(held)


def _declared_from(held: Any, directory: Path) -> Dict[str, Any]:
    """``case.json``, held to the fields section 2's table requires of every case."""
    if not isinstance(held, dict):
        raise Malformed("case.json is not an object")
    identity = held.get("id")
    if not isinstance(identity, str) or identity == "":
        raise Malformed("case.json states no id, and section 2 says the id is the directory path")
    walked = directory.as_posix().rstrip("/")
    if not walked.endswith(identity):
        raise Malformed(
            f"case.json says its id is {identity!r} and it was read from {walked}. The id is "
            "duplicated on purpose so that a moved directory is caught"
        )
    if held.get("profile") not in PROFILES:
        raise Malformed(f"case.json names the profile {held.get('profile')!r}, which section 8 does not list")
    version = held.get("languageVersion")
    if not isinstance(version, int) or isinstance(version, bool):
        raise Malformed("case.json states no languageVersion, and a case always pins one")
    asserted = held.get("asserts")
    if not isinstance(asserted, list) or asserted == []:
        raise Malformed("case.json asserts nothing, and a case that asserts nothing cannot fail")
    for channel in asserted:
        if channel not in CHANNELS:
            raise Malformed(f"case.json asserts {channel!r}, which section 2 does not list")
    return dict(held)


def read_case(directory: str) -> Case:
    """Every file section 2's table names, from one directory, read once."""
    path = Path(directory)
    if not path.is_dir():
        raise Malformed(f"{directory} is not a directory, and one case is one directory")
    names = sorted(one.name for one in path.iterdir() if one.is_file())
    for name in names:
        if not is_case_file(name):
            raise Malformed(
                f"{name} is not a file section 2's table names, so it is not input. A case that "
                "needs something no row covers is a case the suite cannot run until the row exists"
            )
    held = {name: path / name for name in names}
    if "case.json" not in held:
        raise Malformed("the directory holds no case.json, which section 2 requires of every case")
    if "script.os" not in held:
        raise Malformed("the directory holds no script.os, which section 2 requires of every case")

    declared = _declared_from(_json_of(held["case.json"]), path)
    case = Case(directory=path, declared=declared, script=_text_of(held["script.os"]))

    if "bars.csv" in held:
        case.bars = read_bars(_text_of(held["bars.csv"]))
    if "expected.csv" in held:
        case.expected_columns, case.expected_rows = _read_expected_csv(_text_of(held["expected.csv"]))
    if "expected.json" in held:
        expected = _json_of(held["expected.json"])
        if not isinstance(expected, dict):
            raise Malformed("expected.json is not an object of channels")
        case.expected_json = expected
    if "instrument.json" in held:
        case.instrument = _instrument_from(_json_of(held["instrument.json"]))
        case.stated_instrument = True
    else:
        case.instrument = dict(DEFAULT_INSTRUMENT)
    if "settings.json" in held:
        settings = _json_of(held["settings.json"])
        if not isinstance(settings, dict):
            raise Malformed("settings.json is not an object of input values by name")
        case.settings = settings
    if "backtest.json" in held:
        case.backtest = _backtest_from(_json_of(held["backtest.json"]))
    case.ticks = "ticks.csv" in held
    if "frames.csv" in held:
        case.frames = read_frames(_text_of(held["frames.csv"]))
    case.secondary = tuple(name for name in names if is_secondary(name))
    return case
