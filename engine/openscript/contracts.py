"""The two edges of this engine: what a host hands it, and what a library is to it.

``host-interface.md`` names six duties a host carries and
``compiled-program.md`` section 5.2 lists what an engine reads from one. Neither
is restated here. What is here is the shape those facts arrive in, so that the
bar cycle has one thing to read and a test has one thing to build.

**A bar and its state are two objects because they are two facts.** The prices
are the dataset; ``isNew``, ``isConfirmed``, ``isRealtime`` and ``updates`` are
facts about the delivery, which only the side that built the bar knows
(``host-interface.md`` section 6.2). The other four bar facts are the engine's
to derive from the dataset and the position in it, and it derives them rather
than asking, because two sources for one number can disagree and no rule would
say which of them wins.

**The library is a seam and not an import.** The functions of ``stdlib.md`` are
another stage's work and another package's; what the machine needs of them is
below, and it is small on purpose: a manifest to disagree with at load, and a
way to call one. An engine that reached into the library for anything else would
be an engine the library could not be replaced under, and the whole point of the
manifest check is that the two are separate enough to disagree.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, Mapping, Optional, Protocol, Sequence

from .values import ABSENT


@dataclass(frozen=True)
class Bar:
    """One bar as a host states it, ``host-interface.md`` section 3.1.

    A price may be absent: real feeds have holes, and an absent price propagates
    rather than reading as a zero. An absent ``volume`` is not a zero volume,
    which is that section's own three level distinction and the reason the two
    are different values here rather than one with a default.
    """

    time: float
    open: Any
    high: Any
    low: Any
    close: Any
    volume: Any = ABSENT
    oi: Any = ABSENT


@dataclass(frozen=True)
class BarState:
    """The four facts the host states about an execution, ``language.md`` 7.2."""

    is_new: bool = True
    is_confirmed: bool = True
    is_realtime: bool = False
    updates: float = 1.0


@dataclass(frozen=True)
class CallContext:
    """What a library function may be told about the moment it is running in.

    Deliberately thin. Everything a function computes from the bars is already
    in its arguments, because the compiler put it there, and everything it
    computes from its own past is in its state region. What is left is the two
    facts that are neither: where in the run this bar is, and what the host says
    about the instrument.
    """

    bar_index: int = 0
    instrument: Mapping[str, Any] = field(default_factory=dict)
    now: Any = ABSENT


@dataclass(frozen=True)
class LibraryEntry:
    """What the manifest says about one function, section 2.5's four fields."""

    name: str
    arity: int
    state: bool
    effect: str


class Library(Protocol):
    """What the machine asks of the library, and the whole of what it asks.

    ``entry`` and ``describe`` are load-time: section 2.5 has the program carry
    facts the engine already knows so that the two can be disagreed with, and
    ``describe`` is what the refusal says this engine's manifest holds instead.

    ``call`` is the bar. ``state`` is the call site's own region, a plain mapping
    the engine created and owns, because section 2.11 requires a region to be
    snapshottable by a mechanical copy without the engine knowing which function
    it belongs to. It is ``None`` for a pure function, which is what the ``-1``
    on a ``CALL_LIB`` means, and a function whose manifest entry says it holds no
    state is never handed one to write into by accident.

    ``length_of`` is the string ceiling asked before the string exists. The
    ceiling is the engine's to spend and the library raises nothing, so the two
    meet here: the machine asks how long the string a call is about to build will
    be, and refuses the call rather than the result where the answer is past the
    ceiling. ``None`` is the honest answer for every call whose length is not
    known until the work is done, which is all but two of them.

    ``builds_a_string`` is the other half, asked after. Only a call that BUILDS
    a string is held to the ceiling, because the ceiling is on what a script
    grows. A call that passes one through, or answers a fact the host stated,
    hands back a string it did not make, and refusing that would refuse the
    host its own symbol for being long. Both questions are the library's,
    because the library is what knows which of its functions build.
    """

    def entry(self, name: str, arity: int) -> Optional[LibraryEntry]:
        ...

    def describe(self, name: str) -> str:
        ...

    def length_of(self, name: str, arguments: Sequence[Any]) -> Optional[int]:
        ...

    def builds_a_string(self, name: str) -> bool:
        ...

    def call(
        self,
        name: str,
        arguments: Sequence[Any],
        state: Optional[Dict[str, Any]],
        context: CallContext,
    ) -> Any:
        ...


class NoLibrary:
    """A library with nothing in it, which is what an engine has before one is wired.

    It is not a stub standing in for the real thing: it answers every manifest
    question with "this engine's manifest has no such function", so a program
    that calls anything at all is refused at load with OS6004 naming the
    function. A program that calls nothing runs exactly as it would with the
    library present, which is what makes the machine testable on its own.
    """

    def entry(self, name: str, arity: int) -> Optional[LibraryEntry]:
        return None

    def describe(self, name: str) -> str:
        return f"no function called {name}"

    def length_of(self, name: str, arguments: Sequence[Any]) -> Optional[int]:
        return None

    def builds_a_string(self, name: str) -> bool:
        return False

    def call(
        self,
        name: str,
        arguments: Sequence[Any],
        state: Optional[Dict[str, Any]],
        context: CallContext,
    ) -> Any:
        return ABSENT
