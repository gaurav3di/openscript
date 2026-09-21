"""The fills channel: where a shaded band is drawn, and the colour it is drawn in.

``compiled-program.md`` 2.8, the ``fills[]`` table: a band names the two plot
keys it is drawn between, a colour for each side, and a channel beside each
colour for the bars where the script computed one instead of declaring it.

**A band is drawn on a bar where both of its columns have a value.**
``stdlib.md`` 18: "An absent value reaching any of these is a gap, never a zero:
a line breaks, a band stops". So a row exists for a bar the band spans and there
is no row for a bar it does not, which is what makes the case the conformance
page names in section 7, a fill stopping across an absent bar, a difference in
this channel rather than a difference nobody can see. The two columns are read
through the plot keys, because ``between`` carries keys and not channels.

**A row carries the colours the bar computed and nothing the program declares.**
A band with two constant colours computes nothing per bar, so both fields are
null on every row and the row says only that the band is drawn there; the
colours are in the program both engines read. A band with a colour channel
carries what that channel held. Null therefore means "this bar computed no
colour for that side", which covers a side that was never per-bar and a per-bar
side that was absent on this bar. Whether a host draws the declared colour on
such a bar or leaves the band unpainted is not written down anywhere, and this
engine reports the fact rather than deciding it; the stage's report carries the
question.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

from ..diagnostics import ScriptError, malformed
from ..program import LoadedProgram
from ..values import ABSENT
from .plots import channel_of_key
from .published import Published, channel_named, value_of

#: Section 2's vocabulary for this channel.
FILLS = "fills"

#: The two sides of a band, as 2.8 spells them, each with the field that carries
#: a channel for it.
SIDES = (("colorUp", "colorUpChannel"), ("colorDown", "colorDownChannel"))


@dataclass(frozen=True)
class Band:
    """One declared band, with every name it carries resolved to a channel."""

    index: int
    between: Sequence[int]
    colours: Sequence[Optional[int]]


def bands_of(program: LoadedProgram) -> List[Band]:
    """Every declared band, resolved once rather than on every bar.

    Resolved before the first bar is read, so a program naming a plot key
    nothing declares, or a channel past the end of the table, is refused whole
    rather than on the bar the band would first have been drawn on.
    """
    raw = program.raw
    found: List[Band] = []
    for at, one in enumerate(raw["outputs"][FILLS]):
        path = f"outputs.{FILLS}[{at}]"
        between = one.get("between")
        if not isinstance(between, (list, tuple)) or len(between) != 2:
            raise ScriptError(
                malformed(f"{path}.between", "is not the two plot keys a band is drawn between")
            )
        found.append(
            Band(
                index=at,
                between=[
                    channel_of_key(raw, key, f"{path}.between[{side}]")
                    for side, key in enumerate(between)
                ],
                colours=[channel_named(raw, one, field, path) for _colour, field in SIDES],
            )
        )
    return found


def fills_channel(
    program: LoadedProgram, bars: Sequence[Published], spell: Any
) -> List[Dict[str, Any]]:
    """Every band on every bar it is drawn on, oldest bar first.

    Declaration order inside a bar, which is the order the bands are drawn in
    and the order a legend lists them in.
    """
    declared = bands_of(program)
    if not declared:
        return []
    rows: List[Dict[str, Any]] = []
    for bar in bars:
        for band in declared:
            if any(value_of(program, bar, one) is ABSENT for one in band.between):
                continue
            row: Dict[str, Any] = {"barIndex": bar.index, "fill": band.index}
            for (colour, _field), channel in zip(SIDES, band.colours):
                held = ABSENT if channel is None else value_of(program, bar, channel)
                row[colour] = None if held is ABSENT else spell(held)
            rows.append(row)
    return rows
