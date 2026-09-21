"""A verified program, with the parts a bar reads worked out once.

Everything here is a table read from the program rather than a decision about
it: the constant pool as machine values, the source position of each
instruction, the line of each loop, and what the library manifest says about
each entry the program calls. None of it changes between bars, so working it out
per bar would be the same answer computed forty thousand times.

**Nothing is built out of text.** The program is data, this is that data in the
shape the loop reads it in, and there is no step between the two where a name
becomes a function or a string becomes an instruction. That is the rule the
whole format exists to keep, and it is what lets a platform run many people's
scripts in one process.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .contracts import LibraryEntry
from .diagnostics import NO_POSITION, Position
from .values import ABSENT, Colour


def constant_value(entry: Sequence[Any]) -> Any:
    """The machine value a constant pool entry denotes, section 2.9."""
    tag = entry[0]
    if tag == "z":
        return ABSENT
    if tag == "b":
        return bool(entry[1])
    if tag == "n":
        return float(entry[1])
    if tag == "s":
        return entry[1]
    red, green, blue, alpha = entry[1]
    return Colour(float(red), float(green), float(blue), float(alpha))


def positions_for(triples: Sequence[Sequence[int]], length: int) -> List[Position]:
    """One position per instruction, from the triples ``debug.pos`` holds.

    Section 2.15: the position of an instruction is the triple with the greatest
    index at or below it, so a run of instructions from one expression costs one
    triple. Spread once here rather than searched per instruction, because a
    diagnostic is rare and the search would be on the path of every bar.
    """
    found: List[Position] = [NO_POSITION] * length
    current = NO_POSITION
    at = 0
    ordered = sorted(
        (one for one in triples if isinstance(one, list) and len(one) >= 3),
        key=lambda one: one[0],
    )
    for index, line, column in ((one[0], one[1], one[2]) for one in ordered):
        while at < length and at < index:
            found[at] = current
            at += 1
        current = Position(int(line), int(column))
        if 0 <= index < length:
            found[index] = current
            at = index + 1
    while at < length:
        found[at] = current
        at += 1
    return found


@dataclass
class Body:
    """One instruction list with the tables a frame running it needs."""

    code: List[Any]
    positions: List[Position]
    slots: int


@dataclass
class LoadedProgram:
    """The verified program and the tables a bar reads, worked out once at load."""

    raw: Dict[str, Any]
    consts: List[Any] = field(default_factory=list)
    top: Body = None
    functions: List[Body] = field(default_factory=list)
    call_sites: List[Dict[str, Any]] = field(default_factory=list)
    loop_lines: List[int] = field(default_factory=list)
    entries: List[LibraryEntry] = field(default_factory=list)
    defer: List[bool] = field(default_factory=list)

    @property
    def loop_budget(self) -> int:
        return int(self.raw["limits"]["loops"])

    @property
    def retained(self) -> Optional[int]:
        held = self.raw["limits"]["history"]
        return None if held is None else int(held)

    @property
    def on_unconfirmed(self) -> bool:
        return bool(self.raw["meta"]["onUnconfirmed"])

    @property
    def kind(self) -> str:
        return self.raw["meta"]["kind"]


def loaded(raw: Dict[str, Any], entries: Sequence[LibraryEntry]) -> LoadedProgram:
    """Spread a verified program into the tables above, and nothing more."""
    functions = [
        Body(
            code=one["code"],
            positions=_function_positions(raw, at, len(one["code"])),
            slots=int(one["slots"]),
        )
        for at, one in enumerate(raw["functions"])
    ]
    return LoadedProgram(
        raw=raw,
        consts=[constant_value(one) for one in raw["consts"]],
        top=Body(
            code=raw["code"],
            positions=positions_for(raw["debug"]["pos"], len(raw["code"])),
            slots=int(raw["frame"]["slots"]),
        ),
        functions=functions,
        call_sites=list(raw["callSites"]),
        loop_lines=[int(one["line"]) for one in raw["loops"]],
        entries=list(entries),
        defer=[bool(one["defer"]) for one in raw["channels"]],
    )


def _function_positions(raw: Dict[str, Any], which: int, length: int) -> List[Position]:
    for pair in raw["debug"]["fnPos"]:
        if isinstance(pair, list) and len(pair) == 2 and pair[0] == which:
            return positions_for(pair[1], length)
    return [NO_POSITION] * length


def manifest_entries(raw: Dict[str, Any]) -> List[Tuple[str, int, bool, str]]:
    """What the program says about each function it calls, section 2.5."""
    return [
        (one["name"], int(one["arity"]), bool(one["state"]), one["effect"])
        for one in raw["lib"]["functions"]
    ]
