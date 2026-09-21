"""What the other surfaces need of a plot: the column a declared key names.

A plot's own column is not a surface channel. ``conformance.md`` section 4 puts
one value per bar in ``expected.csv``, one column per plot, and the adapter
reads a column's name against this program's plots and takes the channel behind
it. That is where a plot's values are compared and this module does not repeat
it. What is here is the one question the band next door asks: which channel does
a plot key name, since ``compiled-program.md`` 2.8 carries a band's two sides as
the plot keys of ``fills[].between`` rather than as channels.

**A plot's per-bar colour has no channel to be asserted through, and that is a
gap in the page rather than in this engine.** 2.8 gives a plot a
``colorChannel`` for the bars where the colour is computed rather than declared,
and 4.11 lists "a plot's per-bar colour" among the values an ``EMIT`` writes, so
it is a per-bar output like any other. Section 2's list of channels a case may
assert has no name for it: ``values`` names a plot by its title or its key and
reads the channel carrying its value, and there is no spelling that would reach
the colour beside it. So a study that paints a histogram by sign produces output
no case can compare, on either engine. The same is true of the four colour
channels of a candle. The stage's report carries it.
"""

from typing import Any, Dict

from ..diagnostics import ScriptError, malformed


def channel_of_key(raw: Dict[str, Any], key: Any, path: str) -> int:
    """The channel of the plot a declaration names by key, 2.8's ``between``.

    A key naming no declared plot is OS6018 at the field that named it, which is
    the code 3.5 check 1 refuses an index out of range with. This engine's
    verification reads the indexes and not this pair of names, so a band drawn
    between a column the program never declared would otherwise be a band drawn
    nowhere and nothing said. The stage's report carries the change that moves
    the refusal into verification, where the rest of check 1 is.
    """
    for one in raw["outputs"]["plots"]:
        if one.get("key") == key:
            return int(one["channel"])
    raise ScriptError(
        malformed(path, f"names the plot {key!r} and this program declares no plot with that key")
    )

