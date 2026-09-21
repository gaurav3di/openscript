"""The chart surface: what a run draws, in the channels a case asserts it through.

``compiled-program.md`` section 11 maps a compiled program to a chart, and this
package is the half of that map an engine can perform: the declarations in
``outputs`` against the channels a bar wrote, folded into the ordered lists
``conformance.md`` section 4 compares. A host wanting the rest of the descriptor,
a legend, a pane, a settings dialog, builds it from the program, which carries
every declared field; nothing here decides how anything is drawn.

## The encoding, and the part of it the page does not fix

Section 4 fixes the shape of a channel, "an ordered list, and each element is a
flat object of named fields", and section 6 fixes how each kind of field is
compared, a colour as four integer channels and a string as an exact sequence of
code points. **It names no field of a surface row.** The first engine writes
none of these channels into a case either, so there is no second implementation
to read them off. What follows is therefore this engine's reading, stated here
rather than spread over five modules, and recorded in the stage's report as a
question for the page.

**A row is a thing the host was handed to draw, and there is no row for a thing
it was not.** That is ``stdlib.md`` section 18's closing sentence turned into an
encoding: "An absent value reaching any of these is a gap, never a zero: a line
breaks, a band stops, a level is not drawn, a bar keeps its own colour, a cell is
blank". So a marker fires or it does not, a bar is painted or it keeps its own
colour, a band spans a bar or stops at it, and each of those is a row present or
a row absent. A length difference is then the first thing a report names, which
section 6 says is what a reader of a failed case wants to see.

**A row carries what the run computed, and the identity of the declaration it
belongs to.** The bar index, the declaration's key or its ordinal, and the value
the channel held. It does not carry the declaration's own fields: a marker's
shape, a level's title, a band's opacity and a plot's colour are fixed before bar
0 and are in the compiled program that both engines were handed, so a row
repeating one would compare the compiler's output twice and call it an engine
agreeing with an engine. ``spec/decisions.md`` 14 reaches the same place from the
other side: the suite asserts columns, markers, fills, levels and paint, never a
plot's default style colour.

## What this engine does not draw

Two of section 2's channels are not answered, and they are named rather than
answered emptily, because an empty channel compares equal to an empty
expectation and is a pass nobody earned (``conformance.md`` section 8).

``table`` and ``drawings`` are the two, and the reason is the same for both:
4.11 keeps them out of the channels on purpose, a grid's cells are written by
library calls against a handle and a drawing is an object in the heap, and this
engine's library holds neither the grid calls nor the ``draw`` namespace. A
program that declares a grid or creates a drawing calls a function this engine's
manifest does not have, so it is already refused at load with OS6004 naming the
function; the sentences below are what a case asserting either channel is told.

The ``alerts`` and ``log`` channels are not this package's: an alert is raised by
the bar cycle (``run.py``, section 5.4) and a log line is written by a library
call this engine does not hold.
"""

from typing import Any, Callable, Dict, List, Sequence

from ..program import LoadedProgram
from ..run import BarResult
from .bands import FILLS, fills_channel
from .levels import LEVELS, levels_channel
from .marks import MARKERS, markers_channel
from .paints import PAINTS, paint_channel
from .published import published

#: The surface channels of section 2 this engine answers.
ANSWERED = (MARKERS, FILLS, LEVELS) + tuple(name for name, _field in PAINTS)

#: The surface channels it does not, each with what a case asserting one is told.
UNANSWERED: Dict[str, str] = {
    "table": (
        "the table channel: a grid's cells are written by library calls against a handle rather "
        "than through channels (compiled-program.md 4.11), and this engine's library holds "
        "neither table nor cell, so a program declaring a grid is refused at load naming the "
        "function"
    ),
    "drawings": (
        "the drawings channel: a free drawing is an object in the heap that the draw namespace "
        "creates and mutates (compiled-program.md 4.11, stdlib.md 14.4), and this engine's "
        "library holds none of those calls, so a program creating one is refused at load naming "
        "the function"
    ),
}


def surface_channels(
    program: LoadedProgram,
    executions: Sequence[BarResult],
    spell: Callable[[Any], Any],
) -> Dict[str, List[Dict[str, Any]]]:
    """Every surface channel this engine answers, for one run.

    ``executions`` is what the caller driving the bars got back, in the order it
    ran them, a moving bar's repeated executions included: the fold to one row
    per bar is ``published.py``'s and not the caller's. ``spell`` is how one
    value is written into a case file, which is ``adapter.spellings.as_reported``
    for the adapter and identity for a caller reading the machine's own values.
    A channel a case does not assert costs the list it is not asked for, which is
    cheap enough that answering all five is simpler than answering some.
    """
    bars = published(executions)
    found: Dict[str, List[Dict[str, Any]]] = {
        MARKERS: markers_channel(program, bars, spell),
        FILLS: fills_channel(program, bars, spell),
        LEVELS: levels_channel(program, bars, spell),
    }
    for name, declared in PAINTS:
        found[name] = paint_channel(program, bars, declared, spell)
    return found


__all__ = ["ANSWERED", "UNANSWERED", "surface_channels"]
