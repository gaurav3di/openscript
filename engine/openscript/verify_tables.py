"""Check 1 of section 3.5 over the program's own tables, and check 10's key half.

``verify_shape.py`` answers whether a field is a number; this walks the whole
program asking it, table by table, and checks that every index into a table is
in range: the constant pool, slots, cells, states, registers, channels, library
functions, call sites, loops and functions. It is separate from ``verify.py``
because it is one long traversal with no decisions in it, and the decisions
there, which version, which capability, which budget, are what a reader comes
looking for.
"""

from typing import Any, Dict, List, Sequence, Set

from .verify_requests import MachineTables, check_machine_tables, check_requests
from .verify_shape import ShapeCheck, check_constant, check_field

META_KINDS = ("study", "strategy")
CHANNEL_TYPES = ("number", "string", "color", "bool")
EFFECTS = ("none", "signal", "order", "draw", "log")

#: Every declaration option of ``meta``, section 2.3.
META_FIELDS = (
    "title",
    "short",
    "overlay",
    "precision",
    "format",
    "range",
    "scale",
    "group",
    "onUnconfirmed",
)

#: The tables a later minor of this format major added, with the minor that added each.
#:
#: Section 9.2's rule read from the other side, which 9.4 step 3 states and
#: ``spec/decisions.md`` minute 56 settled: a table a later minor added and an
#: earlier program lacks reads as empty, never as a refusal, because 9.5's first
#: line is a promise about that program. A program stamped at this minor or a
#: later one has no such excuse. Section 2 says an empty table is written as an
#: empty array and never omitted, so its absence there is the defect check 1
#: exists for, and the version is what tells the two apart.
#:
#: ``spec/format-history.json`` records the same additions, one entry per format
#: version, and this engine's tests read that file rather than a list of their
#: own, so a version the history gains is a case the tests gain.
ADDED_AT_MINOR = (("requests", 1),)


def minor_of(raw: Dict[str, Any]) -> int:
    """The minor of a ``major.minor`` the version step has already proved is one."""
    parts = str(raw["openscript"]["format"]).split(".")
    return int(parts[1]) if len(parts) > 1 else 0


def supply_added_tables(raw: Dict[str, Any]) -> None:
    """Writes the empty table an earlier minor is owed into the program itself.

    Into the object rather than into a local, because every later step reads the
    program as its own shape and would find the table missing again: the
    verifier hands the same object on, and the engine holds it.
    """
    minor = minor_of(raw)
    for table, added in ADDED_AT_MINOR:
        if table in raw or minor >= added:
            continue
        raw[table] = []


ARRAY_TABLES = (
    "requires",
    "inputs",
    "channels",
    "consts",
    "series",
    "cells",
    "states",
    "functions",
    "callSites",
    "loops",
    "code",
    "requests",
)

OBJECT_TABLES = ("compiler", "source", "meta", "limits", "lib", "outputs", "frame", "debug")


def check_tables(shape: ShapeCheck, raw: Any) -> bool:
    """Check 1 over every table the machine indexes, and every declaration field."""
    if not shape.object(raw, "the program"):
        return False
    supply_added_tables(raw)
    for name in ARRAY_TABLES:
        if not shape.array(raw.get(name), name):
            return False
    for name in OBJECT_TABLES:
        if not shape.object(raw.get(name), name):
            return False

    limits = raw["limits"]
    if not shape.whole(limits.get("loops"), "limits.loops"):
        return False
    if limits.get("history") is not None and not shape.whole(limits["history"], "limits.history"):
        return False

    frame = raw["frame"]
    if not shape.whole(frame.get("slots"), "frame.slots"):
        return False

    lib = raw["lib"]
    if not shape.whole(lib.get("manifest"), "lib.manifest"):
        return False
    if not shape.array(lib.get("functions"), "lib.functions"):
        return False
    for at, entry in enumerate(lib["functions"]):
        path = f"lib.functions[{at}]"
        if not shape.object(entry, path):
            return False
        if not shape.string(entry.get("name"), f"{path}.name"):
            return False
        if not shape.whole(entry.get("arity"), f"{path}.arity"):
            return False
        if not shape.boolean(entry.get("state"), f"{path}.state"):
            return False
        if not shape.one(entry.get("effect"), f"{path}.effect", EFFECTS):
            return False

    for at, entry in enumerate(raw["consts"]):
        if not check_constant(shape, entry, f"consts[{at}]"):
            return False

    keys: Set[str] = set()
    for at, one in enumerate(raw["inputs"]):
        path = f"inputs[{at}]"
        if not shape.object(one, path):
            return False
        if not shape.string(one.get("key"), f"{path}.key"):
            return False
        if not shape.string(one.get("kind"), f"{path}.kind"):
            return False
        if not shape.index(one.get("slot"), f"{path}.slot", frame["slots"], "the frame"):
            return False
        if not check_constant(shape, one.get("default"), f"{path}.default"):
            return False
        keys.add(one["key"])

    for at, channel in enumerate(raw["channels"]):
        path = f"channels[{at}]"
        if not shape.object(channel, path):
            return False
        if channel.get("id") != at:
            return shape.fail(f"{path}.id", "a channel id is its position")
        if not shape.one(channel.get("type"), f"{path}.type", CHANNEL_TYPES):
            return False
        for name in ("defer", "once"):
            if not shape.boolean(channel.get(name), f"{path}.{name}"):
                return False

    tables = MachineTables(
        series=raw["series"],
        cells=raw["cells"],
        states=raw["states"],
        functions=raw["functions"],
        call_sites=raw["callSites"],
        loops=raw["loops"],
        slots=frame["slots"],
        lib_functions=len(lib["functions"]),
    )
    if not check_machine_tables(shape, "", tables):
        return False

    # 2.16: a read's body is walked on the same terms, because the same machine
    # executes it over another instrument's bars.
    if not check_requests(shape, "", raw["requests"], len(raw["series"]), len(lib["functions"]), keys):
        return False

    meta = raw["meta"]
    if not shape.one(meta.get("kind"), "meta.kind", META_KINDS):
        return False
    for name in META_FIELDS:
        if not check_field(shape, meta.get(name), f"meta.{name}", keys):
            return False

    debug = raw["debug"]
    for name in ("pos", "fnPos"):
        if not shape.array(debug.get(name), f"debug.{name}"):
            return False

    return _check_outputs(shape, raw["outputs"], len(raw["channels"]), frame["slots"], keys)


#: Each declaration group, the fields of it that name a channel, and the fields
#: that hold a value or the input reference that resolves to one.
DECLARATIONS = (
    ("plots", ("channel",),
     ("title", "color", "width", "lineStyle", "offset", "overlay", "scale")),
    ("levels", ("channel",), ("title", "color", "lineStyle", "lineWidth")),
    ("markers", ("channel",), ("position", "shape", "color", "textColor")),
    ("alerts", ("condChannel",), ("title", "frequency")),
)

OUTPUT_GROUPS = ("plots", "fills", "levels", "markers", "tables", "alerts")


def _check_outputs(
    shape: ShapeCheck, outputs: Any, channels: int, slots: int, keys: Set[str]
) -> bool:
    """Every declaration in ``outputs``, and every channel it points at."""
    for group in OUTPUT_GROUPS:
        if not shape.array(outputs.get(group), f"outputs.{group}"):
            return False

    def channel_field(holder: Any, path: str, name: str) -> bool:
        return shape.index(holder.get(name), f"{path}.{name}", channels, "channels")

    for group, channel_fields, value_fields in DECLARATIONS:
        for at, one in enumerate(outputs[group]):
            path = f"outputs.{group}[{at}]"
            if not shape.object(one, path):
                return False
            for name in channel_fields:
                if not channel_field(one, path, name):
                    return False
            for name in value_fields:
                if not check_field(shape, one.get(name), f"{path}.{name}", keys):
                    return False

    for at, grid in enumerate(outputs["tables"]):
        path = f"outputs.tables[{at}]"
        if not shape.object(grid, path):
            return False
        if not shape.index(grid.get("slot"), f"{path}.slot", slots, "the frame"):
            return False
        for name in ("title", "position", "rows", "cols"):
            if not check_field(shape, grid.get(name), f"{path}.{name}", keys):
                return False

    for paint in ("barColor", "background"):
        value = outputs.get(paint)
        if value is None:
            continue
        if not shape.object(value, f"outputs.{paint}"):
            return False
        if not channel_field(value, f"outputs.{paint}", "channel"):
            return False

    return True


def input_keys(raw: Any) -> List[str]:
    """The declared settings keys, in the order of section 2.6."""
    return [one["key"] for one in raw["inputs"]]


def channel_flags(raw: Any, name: str) -> Sequence[bool]:
    return [bool(one[name]) for one in raw["channels"]]
