"""The levels channel: the horizontal lines a host draws after the run.

``compiled-program.md`` 2.8, the ``levels[]`` table: "A level's price arrives
through a channel and is therefore evaluated every bar, and the level drawn is
the one from the last bar executed." So this channel is not one row per bar. It
is one row per level, holding the value the last bar left, which is the only
value a host ever draws.

A level whose last value is absent is not drawn (``stdlib.md`` 18: "a level is
not drawn"), so it has no row, and the ordinal on each row is what says which
of the declared levels is missing. The declaration's title, colour, style and
width are the program's and are not repeated here, for the reason the door's
docstring gives.
"""

from typing import Any, Dict, List, Sequence

from ..program import LoadedProgram
from ..values import ABSENT
from .published import Published, value_of

#: Section 2's vocabulary for this channel.
LEVELS = "levels"


def levels_channel(
    program: LoadedProgram, bars: Sequence[Published], spell: Any
) -> List[Dict[str, Any]]:
    """Each declared level, with the value the last bar executed left in it.

    A run with no bars draws none: there is no last bar for a level to take its
    price from, and a level drawn at a price nothing computed would be a line
    across a chart with no data behind it.
    """
    if not bars:
        return []
    last = bars[-1]
    rows: List[Dict[str, Any]] = []
    for at, one in enumerate(program.raw["outputs"][LEVELS]):
        value = value_of(program, last, one["channel"])
        if value is ABSENT:
            continue
        rows.append({"level": at, "value": spell(value)})
    return rows
