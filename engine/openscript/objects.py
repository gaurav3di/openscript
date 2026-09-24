"""Drawing objects and grids: ``stdlib.md`` sections 14.3 and 14.4.

Neither goes through a channel, and ``compiled-program.md`` 4.11 says why: a
channel is one value per bar, and a script may hold any number of lines, labels
and boxes, created once and changed over many bars, and write any number of
cells into a grid. The calls live here rather than in ``library/`` for the same
reason ``arrays.py`` does: three of them refuse, and the library refuses nothing.

- **A change to a deleted object is OS4005**, naming the bar it was deleted on.
  A script that moves a line it already threw away is holding a name for
  nothing, and answering absence would hide that behind a line that quietly
  stopped moving. An *absent* handle is a different fact and does nothing, which
  is what the fix for OS4005 asks a script to hand over.
- **A cell outside its grid is OS4008**, and a row or a column that is not a
  whole number of zero or more is OS4003 against that argument.
- **The object past the ceiling is OS5010.** The ceiling is the first engine's
  number, for the reason ``budget.EngineLimits`` gives for the string ceiling:
  a case that reaches it must be refused by both engines or by neither.

**A drawing object rolls back with everything else.** A moving bar executed ten
times leaves one box and not ten. The roster is part of the checkpoint (``Run``
takes ``mark`` beside the cells and restores it beside them), and it is cheap to
take because nothing in it is changed in place: a setter replaces an object's
properties with a new mapping, so the mark is a shallow copy of the roster and
the objects it points at are never written again.

**A handle is the object's identity, and a copy of the cells keeps it.** Cells
are copied whole at a checkpoint, so a handle held in a cell would come back as
a second handle to the same object, and ``==`` between two of them would change
its answer across a restore. A handle therefore copies to itself. The same holds
for a grid, whose cells are an output buffer that step 3 empties and nothing
rolls back.

**What a deleted object leaves behind is kept only while a handle names it.**
OS4005 needs the bar an object was deleted on for as long as a script can still
reach it, and not a moment longer: a study that deletes yesterday's line and
draws today's, on every bar, would otherwise keep one record per bar for the
life of the chart and copy all of them at every checkpoint. The record is keyed
weakly by the handle, so it goes when the last name for the object does, which
is also when nothing could ask about it.
"""

import weakref
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .arrays import Refused
from .canonical import canonical_number
from .values import ABSENT, ArrayValue, Reference, is_number, is_whole

#: The kinds ``stdlib.md`` 14.4 creates, each with the property pairs that anchor
#: it, in order. A polyline holds its own path instead, section 14.4's `times`
#: and `prices`, copied at the call.
ANCHORS: Dict[str, Tuple[Tuple[str, str], ...]] = {
    "line": (("t1", "p1"), ("t2", "p2")),
    "box": (("t1", "p1"), ("t2", "p2")),
    "label": (("t", "p"),),
    "polyline": (),
}

#: The two properties a polyline's path is held under.
PATH = ("times", "prices")


class Handle(Reference):
    """One drawing object's identity. Equality is identity, and a copy is itself."""

    __slots__ = ("serial", "kind", "__weakref__")

    def __init__(self, serial: int, kind: str) -> None:
        self.serial = serial
        self.kind = kind

    def __deepcopy__(self, memo: Dict[int, Any]) -> "Handle":
        return self


class Grid(Reference):
    """One declared grid, and the cells the bar being executed wrote into it."""

    __slots__ = ("key", "title", "rows", "cols", "cells")

    def __init__(self, key: str, title: str, rows: int, cols: int) -> None:
        self.key = key
        self.title = title
        self.rows = rows
        self.cols = cols
        self.cells: List[Tuple[Any, ...]] = []

    def __deepcopy__(self, memo: Dict[int, Any]) -> "Grid":
        return self


class Objects:
    """The drawing roster and the declared grids of one run."""

    def __init__(self, ceiling: int, grids: Sequence[Tuple[int, Grid]] = ()) -> None:
        self.ceiling = ceiling
        #: The objects the script holds, by serial, in creation order.
        self.live: Dict[int, Tuple[Handle, Dict[str, Any]]] = {}
        #: The bar each deleted object was deleted on, while a handle names it.
        self.deleted: "weakref.WeakKeyDictionary[Handle, int]" = weakref.WeakKeyDictionary()
        self.serial = 0
        #: Each grid with the slot step 5 puts it in.
        self.grids: List[Tuple[int, Grid]] = list(grids)

    # -- the checkpoint --------------------------------------------------------

    def mark(self) -> Tuple[Any, ...]:
        return (dict(self.live), self.deleted.copy(), self.serial)

    def restore(self, mark: Tuple[Any, ...]) -> None:
        live, deleted, serial = mark
        self.live = dict(live)
        self.deleted = deleted.copy()
        self.serial = serial

    # -- steps 3 and 5 ---------------------------------------------------------

    def clear_grids(self) -> None:
        for _, grid in self.grids:
            grid.cells.clear()

    # -- what a host is handed ------------------------------------------------

    def drawings(self) -> List[Tuple[str, List[Tuple[Any, Any]], Dict[str, Any]]]:
        """Every object the script holds, oldest first: kind, anchors, and the rest."""
        out = []
        for handle, props in self.live.values():
            out.append((handle.kind, _anchors(handle.kind, props), _style(handle.kind, props)))
        return out

    # -- the calls ---------------------------------------------------------------

    def create(self, kind: str, props: Dict[str, Any]) -> Handle:
        if len(self.live) >= self.ceiling:
            raise Refused("OS5010", max=self.ceiling, found=len(self.live) + 1)
        handle = Handle(self.serial, kind)
        self.serial += 1
        self.live[handle.serial] = (handle, props)
        return handle

    def change(self, held: Any, bar: int, fields: Dict[str, Any]) -> Any:
        """A setter: new fields onto a live object, OS4005 onto a deleted one."""
        if not isinstance(held, Handle):
            return ABSENT
        gone = self.deleted.get(held)
        if gone is not None:
            raise Refused("OS4005", kind=held.kind, bar=gone)
        found = self.live.get(held.serial)
        if found is not None:
            self.live[held.serial] = (held, {**found[1], **fields})
        return ABSENT

    def delete(self, held: Any, bar: int) -> Any:
        """Deleting twice is not an error: the object is gone either way."""
        if isinstance(held, Handle) and self.live.pop(held.serial, None) is not None:
            self.deleted[held] = bar
        return ABSENT


def _number(value: Any) -> Any:
    return value if is_number(value) else ABSENT


def _anchors(kind: str, props: Dict[str, Any]) -> List[Tuple[Any, Any]]:
    if kind == "polyline":
        times, prices = props.get(PATH[0], ()), props.get(PATH[1], ())
        return [(_number(times[i]), _number(prices[i])) for i in range(len(times))]
    return [(_number(props.get(time)), _number(props.get(price))) for time, price in ANCHORS[kind]]


def _style(kind: str, props: Dict[str, Any]) -> Dict[str, Any]:
    anchored = set(PATH)
    for time, price in ANCHORS[kind]:
        anchored.update((time, price))
    return {name: value for name, value in props.items() if name not in anchored}


def _at(arguments: Sequence[Any], at: int) -> Any:
    return arguments[at] if at < len(arguments) else ABSENT


def _named(arguments: Sequence[Any], names: str, first: int = 0) -> Dict[str, Any]:
    """The arguments from ``first`` on, under the names the call gives them."""
    return {name: _at(arguments, first + at) for at, name in enumerate(names.split())}


def _path(arguments: Sequence[Any], first: int) -> Dict[str, Any]:
    """A polyline's path, copied out of its two arrays at the call.

    Paired by index over the longer array, so more times than prices is a point
    with no price rather than a shorter path, and a value that is not a number
    is absent: a gap the host draws as a break rather than a shape redrawn.
    """
    held = [_at(arguments, first), _at(arguments, first + 1)]
    items = [one.elements if isinstance(one, ArrayValue) else [] for one in held]
    length = max(len(items[0]), len(items[1]))
    return {
        name: tuple(_number(source[i]) if i < len(source) else ABSENT for i in range(length))
        for name, source in zip(PATH, items)
    }


def _whole(argument: str, value: Any) -> Optional[int]:
    """A row or a column: absent is nothing to write, and anything else not whole is OS4003."""
    if value is ABSENT:
        return None
    if not is_whole(value) or value < 0:
        raise Refused("OS4003", name="cell", argument=argument, found=_described(value))
    return int(value)


def _described(value: Any) -> str:
    if isinstance(value, str):
        return '"' + value + '"'
    if isinstance(value, bool):
        return "true" if value else "false"
    if is_number(value):
        return canonical_number(float(value))
    return "an object"


def _cell(objects: Objects, bar: int, arguments: Sequence[Any]) -> Any:
    grid = _at(arguments, 0)
    if not isinstance(grid, Grid):
        return ABSENT
    row = _whole("row", _at(arguments, 1))
    col = _whole("col", _at(arguments, 2))
    if row is None or col is None:
        return ABSENT
    if row >= grid.rows or col >= grid.cols:
        raise Refused("OS4008", row=row, column=col, rows=grid.rows, columns=grid.cols)
    grid.cells.append((row, col) + tuple(_at(arguments, at) for at in range(3, 7)))
    return ABSENT


def clears_a_grid(arguments: Sequence[Any]) -> bool:
    """``clear(t)`` on a grid: its cells for this bar are gone. False for anything else."""
    grid = _at(arguments, 0)
    if not isinstance(grid, Grid):
        return False
    grid.cells.clear()
    return True


#: The names a cell is written under, the ones ``cell`` gives its arguments.
CELL_FIELDS = ("row", "col", "text", "textColor", "bgColor", "align")


def _made(kind: str, names: str) -> Any:
    return lambda objects, bar, arguments: objects.create(kind, _named(arguments, names))


def _setter(names: str) -> Any:
    return lambda objects, bar, arguments: objects.change(
        _at(arguments, 0), bar, _named(arguments, names, 1)
    )


def _polyline(objects: Objects, bar: int, arguments: Sequence[Any]) -> Any:
    styled = _named(arguments, "color width closed fillColor opacity", 2)
    return objects.create("polyline", {**_path(arguments, 0), **styled})


def _delete_all(objects: Objects, bar: int, arguments: Sequence[Any]) -> Any:
    for handle, _ in list(objects.live.values()):
        objects.delete(handle, bar)
    return ABSENT


#: Every call, by name and argument count, as the manifest keys it. Each takes
#: the run's objects, the bar index and the arguments.
CALLS: Dict[Tuple[str, int], Any] = {
    ("draw.line", 9): _made("line", "t1 p1 t2 p2 color width style extendLeft extendRight"),
    ("draw.label", 7): _made("label", "t p text color textColor align tooltip"),
    ("draw.box", 11): _made("box", "t1 p1 t2 p2 color fillColor opacity width text textColor tooltip"),
    ("draw.polyline", 7): _polyline,
    ("draw.setFrom", 3): _setter("t1 p1"),
    ("draw.setTo", 3): _setter("t2 p2"),
    ("draw.setAt", 3): _setter("t p"),
    ("draw.setBounds", 5): _setter("t1 p1 t2 p2"),
    ("draw.setPoints", 3): lambda objects, bar, arguments: objects.change(
        _at(arguments, 0), bar, _path(arguments, 1)
    ),
    ("draw.setText", 2): _setter("text"),
    ("draw.setColor", 2): _setter("color"),
    ("draw.setTextColor", 2): _setter("textColor"),
    ("draw.setFillColor", 2): _setter("fillColor"),
    ("draw.setWidth", 2): _setter("width"),
    ("draw.setStyle", 2): _setter("style"),
    ("draw.setExtend", 3): _setter("extendLeft extendRight"),
    ("draw.setTooltip", 2): _setter("tooltip"),
    ("draw.delete", 1): lambda objects, bar, arguments: objects.delete(_at(arguments, 0), bar),
    ("draw.deleteAll", 0): _delete_all,
    ("draw.count", 0): lambda objects, bar, arguments: float(len(objects.live)),
    ("cell", 7): _cell,
}
