"""The ``drawings`` and ``table`` channels, in the encoding ``conformance.md`` section 4 gives them.

Neither is one value per bar. ``drawings`` is the set of objects the script holds
after the last bar, which is what ``compiled-program.md`` section 11 hands a host
after every execution, and ``table`` is the cells the last bar wrote into the
declared grids, which every execution starts empty.

**Nothing here decides what the channels hold.** The roster already leaves a
deleted object out and keeps the rest in creation order, and a grid already holds
only what the last execution wrote. What this adds is the spelling, a value as a
cell of the ``values`` channel spells it, and the one thing a channel drops on
purpose: the serial the roster keys an object by, which nothing outside this
engine can name.
"""

from typing import Any, Dict, List

from ..objects import CELL_FIELDS, Objects
from .spellings import as_reported

#: ``compiled-program.md`` 2.2's tags for a program that draws objects and one
#: that declares a grid, both of which this engine now serves.
SURFACE_TAGS = ("objects", "tables")

#: The two channels this module answers.
DRAWINGS = "drawings"
TABLE = "table"


def drawings_channel(objects: Objects) -> List[Dict[str, Any]]:
    """One element per object the script holds, oldest first."""
    out = []
    for kind, anchors, style in objects.drawings():
        element: Dict[str, Any] = {
            "kind": kind,
            "anchors": [{"time": as_reported(t), "price": as_reported(p)} for t, p in anchors],
        }
        for name, value in style.items():
            element[name] = as_reported(value)
        out.append(element)
    return out


def table_channel(objects: Objects) -> List[Dict[str, Any]]:
    """One element per cell, grid by grid in declaration order and each in write order."""
    out = []
    for _, grid in objects.grids:
        for cell in grid.cells:
            element: Dict[str, Any] = {"table": grid.title}
            for name, value in zip(CELL_FIELDS, cell):
                element[name] = as_reported(value)
            out.append(element)
    return out

