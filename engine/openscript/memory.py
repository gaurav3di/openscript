"""The regions section 3.2 tabulates, each with the lifetime that table gives it.

Three lifetimes and one table. Slots, the operand stack and the channels last one
execution of a bar; cells, library state regions, register histories and the
object heap last across bars; and the third and fourth columns of that table,
what rolls back and what a checkpoint holds, are section 6 and are ``run.py``'s.

**A register is the only thing with history.** ``HIST`` and ``HISTP`` are the
only way to read one, and the resolution order below is the page's own numbered
list, in that order, because case 3 and case 4 are different on purpose: in case
3 the value never existed, and in case 4 it existed and the engine threw it away.
Returning absence for both would hide a real bug behind a plausible gap.

**Trimming moves the storage and not the bar numbering.** A register that has
dropped its oldest entries still answers about bar 300 when asked for bar 300, so
the count of what was dropped is kept beside the entries rather than the caller
being asked to subtract.
"""

from typing import Any, Dict, List, Optional

from .canonical import canonical_number
from .diagnostics import Position, raise_at
from .values import ABSENT, is_number, is_whole, stored


class Register:
    """One series register: a history of one value per bar, plus this bar's cell."""

    __slots__ = ("history", "current", "dropped")

    def __init__(self) -> None:
        self.history: List[Any] = []
        self.current: Any = ABSENT
        #: How many of the oldest entries trimming has thrown away.
        self.dropped: int = 0

    @property
    def length(self) -> int:
        """The number of bars this register has entries for, trimmed or not."""
        return self.dropped + len(self.history)

    def truncate(self, length: int) -> None:
        """Step 2: discard any entry a previous execution of this bar wrote."""
        keep = max(0, length - self.dropped)
        if keep < len(self.history):
            del self.history[keep:]

    def close(self) -> None:
        """Step 7: the current cell becomes this bar's entry."""
        self.history.append(self.current)

    def at(self, bar: int) -> Any:
        """The value this register held on that bar, or absence where it is gone."""
        where = bar - self.dropped
        if where < 0 or where >= len(self.history):
            return ABSENT
        return self.history[where]

    def trim(self, depth: int) -> None:
        """Step 10: drop entries older than the retained depth.

        ``depth`` entries plus the bar just closed, because a read at the depth
        itself is the last one section 4.4's case 4 does not refuse.
        """
        keep = depth + 1
        if len(self.history) <= keep:
            return
        self.dropped += len(self.history) - keep
        del self.history[: len(self.history) - keep]


def read_history(
    register: Register,
    offset: Any,
    bar_index: int,
    retained: Optional[int],
    position: Position,
) -> Any:
    """``HIST``, resolved in the order section 4.4 gives and no other."""
    if offset is ABSENT:
        return ABSENT
    if not is_whole(offset) or offset < 0:
        raise_at("OS4001", position, index=_written(offset))
    back = int(offset)
    if back > bar_index:
        return ABSENT
    if retained is not None and back > retained:
        raise_at("OS4002", position, index=back, depth=retained, suggested=back)
    # Offset zero is the bar being executed, which is the current cell and not a
    # history entry: the entry for this bar is appended at step 7, after the
    # code that is asking has finished running.
    if back == 0:
        return register.current
    return register.at(bar_index - back)


def _written(value: Any) -> str:
    """The offending value as the message shows it."""
    if value is ABSENT:
        return "none"
    if is_number(value):
        return canonical_number(value)
    return str(value)


class Cells:
    """The persistent values of section 2.11: one entry per ``var`` declaration.

    Both kinds survive from bar to bar and both start uninitialised, which is a
    state of its own rather than a value: a cell inside an ``if`` that is false
    for a hundred bars is absent for a hundred bars, and ``CELL_INIT`` is what
    ends that.
    """

    __slots__ = ("values", "ready")

    def __init__(self, count: int) -> None:
        self.values: List[Any] = [ABSENT] * count
        self.ready: List[bool] = [False] * count

    def initialised(self, cell: int) -> bool:
        return self.ready[cell]

    def mark(self, cell: int) -> None:
        self.ready[cell] = True

    def read(self, cell: int) -> Any:
        return self.values[cell]

    def write(self, cell: int, value: Any) -> None:
        self.values[cell] = stored(value)


class States:
    """The per-call-site regions of the library functions that hold state.

    What a region contains is the library's, section 20, and not this engine's.
    What this engine requires of it is that it be snapshottable by a mechanical
    copy, because the rollback and replay rules apply to every region at once and
    an engine must be able to copy one without knowing which function owns it.
    """

    __slots__ = ("regions",)

    def __init__(self, count: int) -> None:
        self.regions: List[Dict[str, Any]] = [{} for _ in range(count)]

    def region(self, at: int) -> Dict[str, Any]:
        return self.regions[at]


class Channels:
    """Everything a script draws for a bar, one value per channel per bar.

    ``EMIT`` is the only way to write one and a second write on a bar replaces
    the first, so the last write wins and no drawing surface needs a rule of its
    own. A channel nothing wrote is absent, and absence reaching a surface is a
    gap in a plot, no marker, no alert, a bar left its own colour: never a zero.
    """

    __slots__ = ("values",)

    def __init__(self, count: int) -> None:
        self.values: List[Any] = [ABSENT] * count

    def clear(self) -> None:
        for at in range(len(self.values)):
            self.values[at] = ABSENT

    def write(self, channel: int, value: Any) -> None:
        self.values[channel] = stored(value)

    def read(self, channel: int) -> Any:
        return self.values[channel]


class Frame:
    """One frame, section 3.3: a list, a counter and the bases a body reads through.

    A frame's stack region is its own. A called function cannot see or disturb
    the caller's operands, which is what makes the verifier's job local and what
    lets the depth walk of check 5 stop at a call.
    """

    __slots__ = ("code", "pc", "slots", "cell_base", "state_base", "bindings", "stack", "positions")

    def __init__(
        self,
        code: List[Any],
        slots: int,
        cell_base: int = 0,
        state_base: int = 0,
        bindings: Optional[List[int]] = None,
        positions: Optional[List[Any]] = None,
    ) -> None:
        self.code = code
        self.pc = 0
        self.slots: List[Any] = [ABSENT] * slots
        self.cell_base = cell_base
        self.state_base = state_base
        self.bindings: List[int] = [] if bindings is None else bindings
        self.stack: List[Any] = []
        self.positions = positions
