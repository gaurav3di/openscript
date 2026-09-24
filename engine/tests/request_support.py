"""The chart every test of a read runs on, and a builder for programs that read.

Shared by ``test_requests.py`` and ``test_request_host.py`` rather than written
twice, because the numbers each asserts are numbers about these bars: five
minute bars from 10:00 on 6 January 2025, priced by their index so a value in a
column says which bar produced it, twelve to the hour. That is the first
engine's own fixture for the same questions, so the two engines' tests of the
fold read the same boundaries.

The programs are built by hand, with the ``requests`` table section 2.16 prints,
because this package has no compiler and a test that needed one would be a test
of something else. Each read's value lands in a ``"request"`` register and each
register is emitted to a channel of its own, so a column is one read.
"""

from typing import Any, Dict, List, Optional, Sequence

from tests.support import RESERVED, channel, program

from openscript.contracts import Bar, BarState
from openscript.run import load
from openscript.verify import capabilities

#: 10:00 UTC on Monday 6 January 2025.
OPEN = 1736157600000
FIVE_MINUTES = 300_000

#: The chart's own record: five minute bars, dated in UTC.
CHART: Dict[str, Any] = {"symbol": "AAA", "exchange": "XX", "interval": "5", "timezone": "UTC"}


def five_minutes(count: int, start: int = 0) -> List[Bar]:
    """Bars priced by index: open and close ``100 + i``, a half either side, volume 10."""
    return [
        Bar(
            time=float(OPEN + i * FIVE_MINUTES),
            open=100.0 + i,
            high=100.0 + i + 0.5,
            low=100.0 + i - 0.5,
            close=100.0 + i,
            volume=10.0,
        )
        for i in range(start, start + count)
    ]


def body(field: str, code: Optional[Sequence[Any]] = None, requests: Sequence[Any] = (), extra: int = 0) -> Dict[str, Any]:
    """A read's body over one bar field, register 0, answering it unless told otherwise."""
    series = [{"id": 0, "kind": "bar", "field": field, "name": field}]
    series += [{"id": 1 + at, "kind": "request", "field": None, "name": f"r{at}"} for at in range(extra)]
    return {
        "inputs": [],
        "series": series,
        "frame": {"slots": 0},
        "cells": [],
        "states": [],
        "functions": [],
        "callSites": [],
        "loops": [],
        "requests": list(requests),
        "code": [list(one) for one in (code or [["SLOAD", 0], ["RET"]])],
        "pos": [[0, 3, 5]],
        "fnPos": [],
    }


def read(ident: int, timeframe: str, mode: str, series: int, inner: Dict[str, Any], kind: str = "timeframe", symbol: Any = None) -> Dict[str, Any]:
    """One entry of ``requests``, section 2.16's shape."""
    return {
        "id": ident,
        "read": kind,
        "symbol": symbol,
        "exchange": None,
        "timeframe": timeframe,
        "mode": mode,
        "series": series,
        "warmup": None,
        "body": inner,
    }


def reading(requests: Sequence[Dict[str, Any]], lib: Optional[List[Any]] = None, tail: Sequence[Any] = (), consts: Optional[List[Any]] = None) -> Dict[str, Any]:
    """A program that emits each read's register to a channel of its own, then ``tail``."""
    count = len(requests)
    code: List[Any] = []
    for at in range(count):
        code += [["SLOAD", at], ["EMIT", at]]
    code += [list(one) for one in tail]
    extra = sum(1 for one in tail if one[0] == "EMIT")
    tags = {"core.1"} | {"req." + one["read"] for one in _all(requests)}
    return program(
        code + [["HALT"]],
        consts=consts if consts is not None else list(RESERVED),
        channels=[channel(at) for at in range(count + extra)],
        series=[{"id": at, "kind": "request", "field": None, "name": f"r{at}"} for at in range(count)],
        requests=list(requests),
        requires=sorted(tags),
        lib={"manifest": 1, "functions": list(lib or [])},
    )


def _all(requests: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    found = []
    for one in requests:
        found.append(one)
        found.extend(_all(one["body"]["requests"]))
    return found


def loaded(built: Dict[str, Any], record: Optional[Dict[str, Any]] = None, provider: Any = None, library: Any = None):
    """The program loaded on the chart above, or the load's refusal."""
    return load(
        built,
        {},
        library,
        capabilities=capabilities(),
        instrument=CHART if record is None else record,
        provider=provider,
    )


def columns(built: Dict[str, Any], bars: Sequence[Bar], again: int = 0, history: bool = True, **given: Any) -> List[List[Any]]:
    """Every channel over every bar, each bar executed ``again`` more times on top.

    ``history`` hands the whole dataset to the fold before bar 0, as a run over a
    history does; without it the bars arrive one at a time, as a live feed does.
    """
    result = loaded(built, **given)
    if not result.ok:
        raise AssertionError(f"the program was refused: {result.diagnostic}")
    run = result.run
    if history:
        run.history(bars)
    record = given.get("record") or CHART
    rows = []
    for index, bar in enumerate(bars):
        for _ in range(again + 1):
            out = run.execute_bar(index, bar, BarState(), supplied=len(bars), instrument=record)
            if not out.ok:
                raise AssertionError(f"bar {index} failed: {out.diagnostic}")
        rows.append(out.columns)
    return [list(column) for column in zip(*rows)]
