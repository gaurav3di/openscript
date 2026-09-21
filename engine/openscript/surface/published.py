"""What a bar left the machine, after however many times that bar was executed.

Every surface here is read from the same two things: the columns step 8
published for a bar, and the deferred channels step 9 applied on it
(``compiled-program.md`` 5.1). This module turns a run's executions into that
pair, once, so that no surface module counts a bar twice or reads a channel the
engine held back.

**The last execution of a bar is the bar.** Section 6.4: a bar that
re-executes has rolled its state back first, so the set of drawings after five
updates to a moving bar is the set after one. An engine that appended a marker
per execution would draw five where a host redrawing what it is handed draws
one, and the difference would only ever show up on a live chart. So an
execution of a bar replaces the one before it rather than adding to it.

**A deferred channel reaches a host only on a bar the engine decided.** Section
5.4 holds back the channels declared ``defer``, which are the markers and the
alert conditions, until step 9, and step 9 runs only on a bar that was confirmed
or under ``meta.onUnconfirmed``. ``reached`` is that rule, and it is asked of
every channel rather than of the markers alone: a channel that is not deferred
is published at step 8 on every execution, and a surface that assumed which of
its channels carried the flag would be reading the compiler's habits rather than
the program in front of it.

**A field the verifier does not reach is checked here.** ``compiled-program.md``
3.5 check 1 holds every index into the channel table in range, and this engine's
verification reads the required ones: a plot's ``channel``, a level's, a
marker's, an alert's ``condChannel`` and the two paint channels. The nullable
ones beside them, ``plots[].colorChannel``, ``fills[].colorUpChannel``,
``fills[].colorDownChannel``, the four of ``plots[].ohlc`` and an alert's
``messageChannel``, are not read there, so a program naming a channel past the
end of the table would be read past the end of a list here. ``channel_named``
refuses it with OS6018 naming the field, which is the code check 1 refuses with,
rather than answering a colour nobody wrote. The stage's report carries the
verification change that would make this unreachable.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

from ..diagnostics import ScriptError, malformed
from ..program import LoadedProgram
from ..run import BarResult
from ..values import ABSENT


@dataclass(frozen=True)
class Published:
    """One bar, as the last execution of it left the machine.

    ``columns`` is what step 8 published and ``applied`` is the deferred
    channels step 9 applied, which is empty on a bar the engine did not decide.
    """

    index: int
    columns: Sequence[Any]
    applied: Sequence[int]


def published(executions: Sequence[BarResult]) -> List[Published]:
    """Every bar the run published, in bar order, each as its last execution.

    An execution that failed published nothing: ``run.py`` returns the columns
    the bar began with and a diagnostic, and the bar keeps whatever a previous
    execution published, which is section 5.1's own sentence about an error
    during step 6. So a failed execution is not a bar here, and a bar that
    failed after an earlier execution succeeded keeps that earlier one.
    """
    found: Dict[int, Published] = {}
    for one in executions:
        if one.diagnostic is not None:
            continue
        found[one.index] = Published(one.index, list(one.columns), list(one.applied_channels))
    return [found[at] for at in sorted(found)]


def reached(program: LoadedProgram, bar: Published, channel: int) -> bool:
    """Whether what a channel held for this bar reached the host, section 5.4."""
    if channel < 0 or channel >= len(program.defer):
        return False
    if program.defer[channel]:
        return channel in bar.applied
    return True


def value_of(program: LoadedProgram, bar: Published, channel: int) -> Any:
    """What a channel held for this bar, or absence where nothing reached the host.

    Absence is the whole of the rule 2.7 states and 18 repeats: a channel
    nothing wrote is absent, and absence reaching a surface is a gap in a plot,
    no marker, a bar left its own colour. Never a zero and never a default.
    """
    if not reached(program, bar, channel):
        return ABSENT
    if channel < 0 or channel >= len(bar.columns):
        return ABSENT
    return bar.columns[channel]


def channel_named(raw: Dict[str, Any], holder: Any, field: str, path: str) -> Optional[int]:
    """A channel a nullable declaration field names, held to the program's table.

    ``None`` where the field is null, which is what every one of these fields
    holds in the common case: a plot with a constant colour, a band with two,
    an alert with no message.
    """
    held = holder.get(field)
    if held is None:
        return None
    count = len(raw["channels"])
    whole = isinstance(held, int) and not isinstance(held, bool)
    if not whole or held < 0 or held >= count:
        raise ScriptError(
            malformed(
                f"{path}.{field}",
                f"names channel {held} and the program declares {count} of them",
            )
        )
    return held
