"""Check 1 over the tables a machine indexes, and over ``requests`` and its bodies.

A read's body (section 2.16.1) holds the tables a program holds for the machine
of section 3, counted from zero, so it needs the same walk the program's own
tables get and for the same reason: every later step indexes into them, and an
index out of range that is not caught here is a read past the end of an array
during a bar.

**A body that was not walked is the hole verification exists to close.** It is
reached by the same interpreter, with the same instruction list, over another
instrument's history. Verifying the program and not the expression it carries
would leave exactly the failure section 3.5 is written to prevent, one level
down where nobody would look for it.

The walk is shared rather than written twice, because two copies would be two
places for a table to gain a field and only one of them to learn about it.
"""

from dataclasses import dataclass
from typing import Any, List, Sequence, Set

from .verify_shape import ShapeCheck

READS = ("timeframe", "symbol")
MODES = ("confirmed", "developing", "lookahead")
CHART_FACTS = ("symbol", "exchange", "interval")

#: The five kinds section 2.10 declares, not the ones an engine happens to run.
#:
#: A verifier that listed only the kinds it executes would refuse a well formed
#: program with a message blaming the compiler that wrote it, and would pre-empt
#: the capability refusal that exists to say which feature is missing.
#: Verification answers whether this is a valid program; the capability check
#: answers whether this engine can run it.
REGISTER_KINDS = ("bar", "computed", "argument", "request", "input")
CELL_KINDS = ("var", "live")
LOOP_KINDS = ("for", "forIn", "while")


@dataclass(frozen=True)
class MachineTables:
    """The tables one machine indexes, wherever in the program they sit."""

    series: List[Any]
    cells: List[Any]
    states: List[Any]
    functions: List[Any]
    call_sites: List[Any]
    loops: List[Any]
    slots: int
    lib_functions: int


def check_machine_tables(shape: ShapeCheck, prefix: str, tables: MachineTables) -> bool:
    for at, register in enumerate(tables.series):
        path = f"{prefix}series[{at}]"
        if not shape.object(register, path):
            return False
        if register.get("id") != at:
            return shape.fail(f"{path}.id", "a register id is its position")
        if not shape.one(register.get("kind"), f"{path}.kind", REGISTER_KINDS):
            return False
        if register["kind"] == "bar" and not shape.string(register.get("field"), f"{path}.field"):
            return False

    for at, cell in enumerate(tables.cells):
        path = f"{prefix}cells[{at}]"
        if not shape.object(cell, path):
            return False
        if not shape.one(cell.get("kind"), f"{path}.kind", CELL_KINDS):
            return False

    for at, state in enumerate(tables.states):
        path = f"{prefix}states[{at}]"
        if not shape.object(state, path):
            return False
        if not shape.index(state.get("fn"), f"{path}.fn", tables.lib_functions, "lib.functions"):
            return False

    for at, one in enumerate(tables.functions):
        path = f"{prefix}functions[{at}]"
        if not shape.object(one, path):
            return False
        if not shape.string(one.get("name"), f"{path}.name"):
            return False
        if not shape.whole(one.get("params"), f"{path}.params"):
            return False
        if not shape.whole(one.get("slots"), f"{path}.slots"):
            return False
        if not shape.array(one.get("code"), f"{path}.code"):
            return False
        if one["params"] > one["slots"]:
            return shape.fail(f"{path}.slots", "a frame cannot be smaller than its parameter list")

    for at, site in enumerate(tables.call_sites):
        path = f"{prefix}callSites[{at}]"
        if not shape.object(site, path):
            return False
        if not shape.index(site.get("fn"), f"{path}.fn", len(tables.functions), "functions"):
            return False
        for name in ("argc", "cellBase", "stateBase"):
            if not shape.whole(site.get(name), f"{path}.{name}"):
                return False
        if not shape.array(site.get("series"), f"{path}.series"):
            return False
        if site["argc"] != tables.functions[site["fn"]]["params"]:
            return shape.fail(
                f"{path}.argc", "a site passes exactly the function's parameter count"
            )
        for which, bound in enumerate(site["series"]):
            if bound == -1:
                continue
            if not shape.index(bound, f"{path}.series[{which}]", len(tables.series), "series"):
                return False

    for at, loop in enumerate(tables.loops):
        path = f"{prefix}loops[{at}]"
        if not shape.object(loop, path):
            return False
        if not shape.one(loop.get("kind"), f"{path}.kind", LOOP_KINDS):
            return False
        for name in ("line", "col"):
            if not shape.whole(loop.get(name), f"{path}.{name}"):
                return False

    return True


def check_requests(
    shape: ShapeCheck,
    prefix: str,
    requests: Sequence[Any],
    registers: int,
    lib_functions: int,
    keys: Set[str],
) -> bool:
    """``requests`` and every body inside it, section 2.16.

    ``series`` is the register of the enclosing machine that the read's value
    lands in, so it is checked against the table the caller passes; everything
    inside ``body`` is the body's own and is checked against the body's.
    """
    return _walk(shape, prefix, requests, registers, lib_functions, keys, set())


def _walk(
    shape: ShapeCheck,
    prefix: str,
    requests: Sequence[Any],
    registers: int,
    lib_functions: int,
    keys: Set[str],
    seen: Set[int],
) -> bool:
    for at, request in enumerate(requests):
        path = f"{prefix}requests[{at}]"
        if not shape.object(request, path):
            return False
        if not shape.whole(request.get("id"), f"{path}.id"):
            return False
        # The id is this read's handle and is what req.isReady is handed, so two
        # reads sharing one would answer each other's question.
        if request["id"] in seen:
            handle = request["id"]
            return shape.fail(f"{path}.id", f"{handle} is already another read's handle")
        seen.add(request["id"])
        if not shape.one(request.get("read"), f"{path}.read", READS):
            return False
        if not shape.one(request.get("mode"), f"{path}.mode", MODES):
            return False
        if not shape.index(request.get("series"), f"{path}.series", registers, "series"):
            return False
        warmup = request.get("warmup")
        if warmup is not None and not shape.whole(warmup, f"{path}.warmup"):
            return False
        for name in ("symbol", "exchange", "timeframe"):
            if not _check_identity(shape, request.get(name), f"{path}.{name}", keys):
                return False
        if not _check_body(shape, f"{path}.body.", request.get("body"), lib_functions, keys, seen):
            return False
    return True


#: The tables a read's body carries, section 2.16.1. Not the program's tables:
#: a body holds neither the constant pool nor the library manifest, because
#: neither holds anything that depends on a bar.
BODY_TABLES = (
    "inputs",
    "series",
    "cells",
    "states",
    "functions",
    "callSites",
    "loops",
    "requests",
    "code",
    "pos",
    "fnPos",
)


def _check_body(
    shape: ShapeCheck,
    prefix: str,
    raw: Any,
    lib_functions: int,
    keys: Set[str],
    seen: Set[int],
) -> bool:
    at = prefix[:-1]
    if not shape.object(raw, at):
        return False
    for name in BODY_TABLES:
        if not shape.array(raw.get(name), f"{prefix}{name}"):
            return False
    if not shape.object(raw.get("frame"), f"{prefix}frame"):
        return False
    if not shape.whole(raw["frame"].get("slots"), f"{prefix}frame.slots"):
        return False

    series = raw["series"]
    tables = MachineTables(
        series=series,
        cells=raw["cells"],
        states=raw["states"],
        functions=raw["functions"],
        call_sites=raw["callSites"],
        loops=raw["loops"],
        slots=raw["frame"]["slots"],
        lib_functions=lib_functions,
    )
    if not check_machine_tables(shape, prefix, tables):
        return False

    for which, one in enumerate(raw["inputs"]):
        path = f"{prefix}inputs[{which}]"
        if not shape.object(one, path):
            return False
        if not shape.string(one.get("input"), f"{path}.input"):
            return False
        if one["input"] not in keys:
            named = one["input"]
            return shape.fail(path, f"it names the input {named}, which inputs[] does not declare")
        if not shape.index(one.get("series"), f"{path}.series", len(series), "the body's series"):
            return False

    return _walk(shape, prefix, raw["requests"], len(series), lib_functions, keys, seen)


def _check_identity(shape: ShapeCheck, value: Any, path: str, keys: Set[str]) -> bool:
    """One of the three forms a request's identity field takes, section 2.16.

    A value, the setting that supplies it, or one of the three chart facts that
    identify a chart rather than describe it. The rest of the chart namespace
    describes the chart, and a request built from one of those would name
    nothing.
    """
    if value is None or isinstance(value, str):
        return True
    if not shape.object(value, path):
        return False
    if "input" in value:
        if not shape.string(value["input"], f"{path}.input"):
            return False
        if value["input"] not in keys:
            named = value["input"]
            return shape.fail(path, f"it names the input {named}, which inputs[] does not declare")
        return True
    if "chart" not in value:
        return shape.fail(path, "an object here names an input or a chart fact")
    return shape.one(value["chart"], f"{path}.chart", CHART_FACTS)
