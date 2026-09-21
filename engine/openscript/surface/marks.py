"""The markers channel: one row per marker a bar drew.

``compiled-program.md`` 2.8, the ``markers[]`` table: one entry per ``signal()``
call site, carrying the channel that holds the marker's text, and "a marker is
emitted when its channel holds a string for the bar, and not otherwise". Both
halves of that sentence are the rule below, and the second half is the one worth
stating: a channel holding a number, a colour or absence draws nothing, and a
call site that fired twice on a bar left the last text written, which is the
last write winning (2.7) rather than a rule of this surface's own.

The other half of when a marker is drawn is deferral, which ``published.py``
holds for every channel at once: 5.4 holds a marker back on a bar that is still
moving, so the first execution of a moving bar writes the text and step 9 throws
it away. Section 12.6's trace prints that row as ``held``, and the test beside
this module is measured against that column.

**A row carries what the engine computed and the identity it belongs to.** The
bar, the call site's key and the text. The marker's position, its shape and its
two colours are declared before bar 0 and are in the program every engine read,
so a row repeating them would assert the compiler's output through the engine's
channel; ``spec/decisions.md`` 14 says the same thing about a plot's declared
colour, that the suite asserts what a run produced. The door's docstring records
the encoding and what the page leaves open about it.
"""

from typing import Any, Dict, List, Sequence

from ..program import LoadedProgram
from .published import Published, value_of

#: Section 2's vocabulary for this channel, which a case names in ``asserts``.
MARKERS = "markers"


def markers_channel(
    program: LoadedProgram, bars: Sequence[Published], spell: Any
) -> List[Dict[str, Any]]:
    """Every marker drawn, oldest bar first and declaration order inside a bar.

    Declaration order rather than the order the call sites ran in: an engine
    reporting the order of execution would report a script's branches, and two
    engines agreeing on the branches is what the values channel is for.
    """
    declared = program.raw["outputs"][MARKERS]
    rows: List[Dict[str, Any]] = []
    for bar in bars:
        for one in declared:
            text = value_of(program, bar, one["channel"])
            if not isinstance(text, str):
                continue
            rows.append({"barIndex": bar.index, "key": one["key"], "text": spell(text)})
    return rows
