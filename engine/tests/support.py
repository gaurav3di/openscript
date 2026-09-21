"""What the interpreter's tests build their programs and their library out of.

A compiled program is twenty one tables and a test about one instruction needs
twenty of them empty, so the builder below writes the empty ones and the test
writes the one it is about. Nothing here decides anything: a default that changed
a rule would be a test passing for a reason its own file does not show, so every
default is an empty table, a zero or the value section 2 fixes.

The library here is a manifest and a body, both given by the test. The engine
reaches the library through one seam and this is the smallest thing on the other
side of it, which is the point: a machine that could only be tested with the real
library would be a machine welded to it.
"""

import json
import pathlib
import struct
import sys
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence

ENGINE = pathlib.Path(__file__).resolve().parent.parent
REPOSITORY = ENGINE.parent
SPEC = REPOSITORY / "spec"

if str(ENGINE) not in sys.path:
    sys.path.insert(0, str(ENGINE))

from openscript.contracts import Bar, BarState, LibraryEntry  # noqa: E402
from openscript.opcodes import INSTRUCTION_TAGS  # noqa: E402
from openscript.run import load  # noqa: E402
from openscript.verify import capabilities  # noqa: E402

#: The three pool entries section 2.9 fixes, which every program carries.
RESERVED = [["z", None], ["b", False], ["b", True]]


def program(
    code: Sequence[Any],
    consts: Optional[Sequence[Any]] = None,
    channels: Optional[Sequence[Any]] = None,
    **changed: Any,
) -> Dict[str, Any]:
    """A valid program with the tables a test does not care about left empty."""
    built: Dict[str, Any] = {
        "openscript": {"format": "1.1", "language": 1},
        "requires": ["core.1"],
        "compiler": {"name": "a test", "version": "0"},
        "source": {"hash": "sha256:" + "0" * 64, "lines": 1, "file": None},
        "meta": {
            "kind": "study",
            "title": "A test",
            "short": "A test",
            "overlay": False,
            "precision": 4,
            "format": "price",
            "range": None,
            "scale": "right",
            "group": "",
            "onUnconfirmed": False,
        },
        "limits": {"loops": 2000000, "history": None},
        "lib": {"manifest": 1, "functions": []},
        "inputs": [],
        "channels": list(channels) if channels is not None else [],
        "outputs": {
            "plots": [],
            "fills": [],
            "levels": [],
            "markers": [],
            "tables": [],
            "alerts": [],
            "barColor": None,
            "background": None,
        },
        "consts": list(consts) if consts is not None else list(RESERVED),
        "series": [],
        "frame": {"slots": 0},
        "cells": [],
        "states": [],
        "functions": [],
        "callSites": [],
        "loops": [],
        "code": [list(one) for one in code],
        "debug": {
            "pos": [[0, 1, 1]],
            "fnPos": [],
            "names": {"slots": [], "cells": [], "series": [], "channels": []},
            "retain": False,
        },
        "requests": [],
    }
    built.update(changed)
    return built


def channel(at: int, kind: str = "number", defer: bool = False, once: bool = False) -> Dict[str, Any]:
    return {"id": at, "type": kind, "defer": defer, "once": once}


def register(at: int, field: str) -> Dict[str, Any]:
    return {"id": at, "kind": "bar", "field": field, "name": field}


class Library:
    """A manifest and a body, both the test's.

    ``bodies`` maps a name to what the call answers; a name with no body answers
    absence, which is what a machine test about the loop rather than about the
    library wants.
    """

    def __init__(
        self,
        manifest: Optional[Mapping[str, LibraryEntry]] = None,
        bodies: Optional[Mapping[str, Callable[..., Any]]] = None,
    ) -> None:
        self.manifest = dict(manifest or {})
        self.bodies = dict(bodies or {})
        self.calls: List[Any] = []

    def entry(self, name: str, arity: int) -> Optional[LibraryEntry]:
        held = self.manifest.get(name)
        if held is None or held.arity != arity:
            return None
        return held

    def describe(self, name: str) -> str:
        held = self.manifest.get(name)
        if held is None:
            return f"no function called {name}"
        return f"{name} with {held.arity} arguments"

    def length_of(self, name: str, arguments: Sequence[Any]) -> Optional[int]:
        """Nothing is measured in advance here: a test's body builds what it builds."""
        return None

    def call(self, name: str, arguments: Sequence[Any], state: Any, context: Any) -> Any:
        self.calls.append((name, list(arguments)))
        body = self.bodies.get(name)
        return None if body is None else body(arguments, state, context)


def mirroring(raw: Mapping[str, Any]) -> Library:
    """A manifest that agrees with whatever the program says it calls.

    For a test about the instruction loop over a program somebody else compiled,
    where the question is whether the machine walks it and not what the functions
    answer. A test about the manifest check builds its disagreement by hand.
    """
    manifest = {
        one["name"]: LibraryEntry(one["name"], one["arity"], one["state"], one["effect"])
        for one in raw["lib"]["functions"]
    }
    return Library(manifest)


def flat(close: float, at: int = 0) -> Bar:
    """A bar with one price in all four fields, for a test about something else."""
    return Bar(time=float(at) * 60000.0, open=close, high=close, low=close, close=close)


def confirmed() -> BarState:
    return BarState(is_new=True, is_confirmed=True, is_realtime=False, updates=1.0)


def moving(updates: float = 1.0) -> BarState:
    return BarState(is_new=False, is_confirmed=False, is_realtime=True, updates=updates)


def pattern(value: float) -> str:
    """A binary64 value as the sixteen hexadecimal digits every vector file holds."""
    return struct.pack(">d", value).hex()


def catalogue() -> Dict[str, Any]:
    """``spec/errors.json``, which is the authority on every code raised here."""
    return json.loads((SPEC / "errors.json").read_text(encoding="utf-8"))


def worked_example() -> Dict[str, Any]:
    """The program section 12.2 prints, read out of the page itself.

    Read rather than copied, so the example this engine is measured against is
    the one a reader of the specification is measured against, and a change to it
    is a change to this test.
    """
    page = (SPEC / "compiled-program.md").read_text(encoding="utf-8")
    start = page.index("### 12.2 The compiled program")
    block = page[start : page.index("### 12.3 The bars")]
    return json.loads(block.split("```json")[1].split("```")[0])


#: Pool entries a case reaches for, after the three section 2.9 reserves.
POOL = RESERVED + [
    ["n", 0],     # 3
    ["n", 1],     # 4
    ["n", 2],     # 5
    ["n", 3],     # 6
    ["n", 10],    # 7
    ["s", "a"],   # 8
    ["s", "b"],   # 9
    ["n", 1e308],  # 10
    ["n", -1],    # 11
    ["n", 9],     # 12
]


def tags_for(code):
    found = {"core.1"}
    for one in code:
        tag = INSTRUCTION_TAGS.get(one[0])
        if tag is not None:
            found.add(tag)
    return sorted(found)


def run_one(code, bar=None, library=None, **changed):
    """One bar of a program whose answer is emitted to channel 0."""
    listing = [list(one) for one in code] + [["EMIT", 0], ["HALT"]]
    changed.setdefault("consts", list(POOL))
    changed.setdefault("channels", [channel(0)])
    changed.setdefault("requires", tags_for(listing))
    built = program(listing, **changed)
    result = load(built, {}, library, capabilities=capabilities())
    if not result.ok:
        raise AssertionError(f"the program was refused: {result.diagnostic}")
    at = bar if bar is not None else flat(100.0)
    return result.run.execute_bar(0, at, confirmed())


def answer(code, **changed):
    out = run_one(code, **changed)
    if not out.ok:
        raise AssertionError(f"the bar failed: {out.diagnostic.code} {out.diagnostic.values}")
    return out.columns[0]


def refusal(code, **changed):
    out = run_one(code, **changed)
    if out.ok:
        raise AssertionError("the bar was expected to fail and did not")
    return out.diagnostic
