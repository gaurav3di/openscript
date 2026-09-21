"""The script's log: what ``print`` leaves behind, and what a host does with it.

`stdlib.md` 14.3 is the call. Three sentences of it are the whole of the
behaviour, and each one is a line of code here rather than a paragraph in a
document nobody runs:

- **``print`` writes to the per-script log, not to the chart.** It draws
  nothing, lands in no contract field and answers nothing, so a case's numeric
  output is identical with logging on and with logging off. That is not this
  module's promise to keep: ``print`` carries an effect, so the machine pushes
  absence and holds the record until step 9 (`compiled-program.md` 5.4), and the
  columns are written at step 8, before any of this runs. What is kept here is a
  test that would notice if it stopped being true.
- **Every entry carries the bar's time**, so a log line can be matched to a bar.
  A bar index goes with it, because `conformance.md` section 7's example of a
  log case is a line carrying one, and the index is what a runner compares
  against an expected file without knowing the dataset's own clock.
- **It is rate limited by the host rather than by the language, and a host that
  drops lines must say how many it dropped rather than truncating silently.** So
  the limit arrives from the caller and is not a number this engine chose, and
  the count of what it dropped is part of the answer rather than a log line
  saying so, which would itself be a line a limit could drop.

**A moving bar writes nothing that is not decided.** Step 9 applies the records
of a bar this engine decided, and `stdlib.md` 14.3's rollback question is open in
`feature-matrix.md` for the case it does not cover: whether lines written during
a re-executed moving bar replace the previous execution's or are deferred like an
order. Nothing here answers it. The records this is handed are the ones step 9
applied, which is the half the pages do fix, and a caller replaying a moving bar
is handed the same answer twice rather than a reading this module invented.

**The shape of a line is this engine's and not a page's, and it is written down
once.** `conformance.md` section 4 says the ``log`` channel is an ordered list
whose elements are flat objects of named fields, and nothing anywhere names the
fields. The first engine hands the host the raw effect and builds no line at all,
so there is no second engine's spelling to agree with either. ``rows`` below is
therefore the one place a name is chosen, and the day a page fixes them it is the
one place that changes.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .contracts import LibraryEntry
from .values import ABSENT

#: `stdlib.md` 14.3's one call, and the effect `compiled-program.md` 5.4 gives
#: it. One argument: the value. The extra argument of section 4.10 belongs to an
#: order call, whose defaults are absence itself, and this call has no default to
#: tell apart from a value that came out absent.
PRINT = "print"

LOG_ENTRIES: Dict[Tuple[str, int], LibraryEntry] = {
    (PRINT, 1): LibraryEntry(PRINT, 1, False, "log")
}


@dataclass(frozen=True)
class Line:
    """One entry of the log: the bar it was written on, and the value written."""

    #: The index of the bar being executed, which is what a case compares.
    bar: int
    #: The bar's own open time, `host-interface.md` 3.1, in UTC milliseconds.
    time: Any
    #: Whatever the script passed, absence included. A script that printed a
    #: value which was absent during warmup wrote an absent line, and an engine
    #: that turned it into an empty string would hide the one thing the author is
    #: looking at the log for.
    value: Any = ABSENT


@dataclass
class Logbook:
    """One run's log, with the ceiling the host sets on it.

    ``limit`` is the host's rate limit and ``None`` is a host that states none,
    which is every conformance run: a case fixes its input in files and a limit
    the suite did not state would be a limit one engine applied and another did
    not. A host that does state one gets what it asked for and the count of what
    that cost, which is 14.3's own requirement and the reason the count is a
    field here rather than a line in the log.
    """

    limit: Optional[int] = None
    lines: List[Line] = field(default_factory=list)
    dropped: int = 0

    def write(self, effects: Iterable[Any], bar: int, time: Any) -> None:
        """The log records one execution left behind, in the order it made them.

        The records are step 9's, so a call this is handed was made on a bar the
        engine decided. Order is the bar's own and is never sorted: a script
        printing a heading and then a row is a script whose two lines are only
        useful in that order.
        """
        for effect in effects:
            if getattr(effect, "name", None) != PRINT:
                continue
            arguments = getattr(effect, "arguments", ())
            self.add(bar, time, arguments[0] if arguments else ABSENT)

    def add(self, bar: int, time: Any, value: Any) -> None:
        """One line, unless the host's limit has been reached and it is counted instead."""
        if self.limit is not None and len(self.lines) >= self.limit:
            self.dropped += 1
            return
        self.lines.append(Line(bar, time, value))

    def rows(self) -> List[Dict[str, Any]]:
        """The lines as the flat objects section 4 compares a non columnar channel as.

        The field names are this module's, for the reason the opening note gives:
        no page fixes them. What is not this module's is the encoding of the
        value, which section 4 already fixes for every channel and the adapter
        already carries in one place, so a value goes out as it is held and is
        spelled where every other spelling is decided.
        """
        return [{"barIndex": one.bar, "time": one.time, "value": one.value} for one in self.lines]
