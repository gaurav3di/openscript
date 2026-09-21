"""The two paint channels: the price bars' colour, and the pane's background.

``compiled-program.md`` 2.8: ``barColor`` and ``background`` are each either
null or one channel, and there is one of each per program. A script with three
``barColor()`` calls writes the same channel three times and the last write on
the bar wins, which is 2.7's rule for every channel and needs no sentence here.

**A bar with no paint has no row.** ``stdlib.md`` 14.3 says ``barColor(none)``
and ``background(none)`` leave the bar alone and that passing an absent colour
is not an error, and 18 says an absent value reaching a surface is a gap and
never a zero. So a row is a bar that was painted, carrying the bar and the
colour, and a bar that was not painted is the row that is not there. The two
channels are projected by one function because they are one shape: an engine
with a rule for the background that it did not have for the bars would be two
answers to one question.

**What is in the row is what the channel held.** A colour reaches a case file as
the four integer channels of ``conformance.md`` section 6, spelled ``#rrggbbaa``
after the alpha conversion of ``compiled-program.md`` 3.1, and the spelling is
the caller's: ``adapter.spellings`` states that conversion once and this module
does not state it again. A channel declared ``color`` that held something else
is reported as what it held rather than dropped, because 3.5 has no check that
an ``EMIT`` matches its channel's declared type, and a value silently missing
from a channel is the failure this whole surface exists to avoid.
"""

from typing import Any, Dict, List, Sequence

from ..program import LoadedProgram
from ..values import ABSENT
from .published import Published, value_of

#: Section 2's vocabulary for the two channels, against the field of ``outputs``
#: each is read from. The names differ by a plural: a case asserts ``barColors``,
#: one row per painted bar, and a program declares ``barColor``, one channel.
PAINTS = (("barColors", "barColor"), ("background", "background"))


def paint_channel(
    program: LoadedProgram, bars: Sequence[Published], declared: str, spell: Any
) -> List[Dict[str, Any]]:
    """Every bar the named paint was applied to, oldest first.

    ``declared`` is the field of ``outputs``: ``barColor`` or ``background``. A
    program that declares neither paints nothing, and its channel is null rather
    than a channel that is never written.
    """
    held = program.raw["outputs"].get(declared)
    if held is None:
        return []
    channel = held["channel"]
    rows: List[Dict[str, Any]] = []
    for bar in bars:
        colour = value_of(program, bar, channel)
        if colour is ABSENT:
            continue
        rows.append({"barIndex": bar.index, "color": spell(colour)})
    return rows
