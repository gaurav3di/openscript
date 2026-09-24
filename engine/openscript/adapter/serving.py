"""The seam between the library's entries and the machine's ``Library`` protocol.

``contracts.py`` says what the machine asks of a library: a manifest to disagree
with at load, a sentence describing what this engine holds instead, and a way to
call one. ``library/`` answers a different shape, and two of them: a stateless
table whose calls take a context and the arguments, and a stateful one whose
calls take the call site's region as well. Nothing in the package joins them, so
this adapter carries the join, and it carries it here rather than inside the
answer so that the day a module in the package does it, one import changes and
nothing else does.

**Seven tables and not one.** Beside the two halves of the library are the two
namespaces that are not in it: the ``chart`` and ``pos`` facts of ``facts.py``,
whose answer is the host's record and the strategy's own fills, and the nine
order calls of ``ordering.py``, which carry an effect and are therefore never
called through here at all. Then the array calls of ``arrays.py``, which live
outside the library because they refuse an index and a size and the library
refuses nothing, and ``print``, whose one row is ``logbook.py``'s and which
carries an effect, so it is never called through here either. Last, the drawing
and grid calls of ``objects.py``, outside the library for the reason the array
calls are, which write into the run's roster that the context carries. A name in
none of the seven is a name this engine's manifest does not hold, and a program calling it
is refused at load (OS6004) naming the function and what this engine holds
instead.

**Two things the machine cannot pass through, and how they are served.**

``CallContext`` carries a bar index, the instrument facts and the fixed value of
the clock. It does not carry the bar. ``stdlib.md`` section 6's ``trueRange``
reads the bar's high, its low and the previous bar's close, and section 20.5
grants the oldest bar the library's one exception to absence propagation, so a
context of three fields cannot answer it. The caller driving the bars knows all
three, so it states them here before each execution, and a call that arrives
without them is answered with absence rather than with a value read from
somewhere else.

``roundToTick`` asks the host for the instrument's tick, which ``CallContext``
does carry, so it is read from there and from nowhere else.

**The heap is not a table.** An array on this machine is the object itself
(``values.ArrayValue``), so making one and reading one are the two lines below
rather than an allocation and an index.

**A colour has two spellings in this package, and this seam is where they meet.**
The machine builds one shape from the constant pool and the library returns
another, so a colour a script computes is not the type the machine's own tag
function knows. That is a defect in the package rather than in either half, and
it is written up in the stage's report; nothing here papers over it, because a
seam that converted quietly would hide the one place a test can see it.
"""

from typing import Any, Dict, List, Optional, Sequence, Tuple

from ..arrays import CALLS as ARRAY_CALLS
from ..contracts import CallContext, LibraryEntry
from ..dates import table as dates_table
from ..library import BUILDS_A_STRING, MEASURED, stateful_table, table
from ..library.stateless import Entry
from ..logbook import LOG_ENTRIES
from ..objects import CALLS as OBJECT_CALLS, clears_a_grid
from ..values import ABSENT, ArrayValue, Reference, tag
from .facts import FACT_NAMES, POSITION_FACTS, Book, fact_value
from .ordering import ORDER_ENTRIES


#: The one calendar call that builds a string, which the ceiling is spent on.
DATE_FORMAT = "date.format"


class Serving:
    """The library and the two namespaces that are not in it, as a ``Library``.

    One instance per run. ``at_bar`` is called by whatever drives the bars,
    before each execution, with the three facts a bar-reading call needs and no
    context carries.

    ``book`` is the strategy's position book, which is the ledger. A run without
    one serves no ``pos`` entry and no order call, so a program that places an
    order is refused at load naming the function (OS6004) rather than running as
    a study that quietly trades nothing.
    """

    def __init__(self, book: Optional[Book] = None) -> None:
        # The calendar's calls are stateless and are joined to the library's own
        # stateless table rather than kept as a seventh: they take a context and
        # their arguments, exactly as those do (``dates.py``).
        self._entries = {**table(), **dates_table()}
        self._stateful = stateful_table()
        self._book = book
        self._bar: Dict[str, Any] = {}
        self._first = False
        self._context: Optional[CallContext] = None

    # -- what the caller states before a bar --------------------------------

    def at_bar(self, facts: Dict[str, Any], first: bool) -> None:
        """The bar facts a library call reads, for the execution about to happen.

        Each is read by name: the bar's ``time``, ``high``, ``low``, ``close`` and
        ``volume``, the ``previousClose``, and the two session facts,
        ``isSessionFirst`` and ``isSessionLast``. The names are the
        library's, asked for through ``bar``, and a fact the caller does not state
        is absent rather than a value read from somewhere else: a study that
        answered absence for every bar would be a study with a silently empty
        line through it, and this is the one place that could happen quietly.
        """
        self._bar = dict(facts)
        self._first = first

    # -- the manifest, which is what a load is held to ----------------------

    def _facts(self) -> Sequence[str]:
        """The fact names this run can answer, which the ``pos`` half depends on."""
        if self._book is not None:
            return FACT_NAMES
        return tuple(name for name in FACT_NAMES if name not in POSITION_FACTS)

    def entry(self, name: str, arity: int) -> Optional[LibraryEntry]:
        """One manifest row, from whichever of the four tables holds the name.

        The order they are asked in decides nothing: a name is in one of them,
        because the two halves of the library are keyed apart by their own module
        and neither namespace is a function the library holds.
        """
        held = self._entries.get((name, arity)) or self._stateful.get((name, arity))
        if held is not None:
            return LibraryEntry(held.name, held.arity, held.state, held.effect)
        if arity == 0 and name in self._facts():
            return LibraryEntry(name, 0, False, "none")
        if (name, arity) in ARRAY_CALLS or (name, arity) in OBJECT_CALLS:
            return LibraryEntry(name, arity, False, "none")
        return ORDER_ENTRIES.get((name, arity)) or LOG_ENTRIES.get((name, arity))

    def _arities(self, name: str) -> Sequence[int]:
        """Every argument count this engine holds the name under."""
        found = {arity for (held, arity) in self._entries if held == name}
        found |= {arity for (held, arity) in self._stateful if held == name}
        found |= {arity for (held, arity) in ORDER_ENTRIES if held == name}
        found |= {arity for (held, arity) in ARRAY_CALLS if held == name}
        found |= {arity for (held, arity) in OBJECT_CALLS if held == name}
        found |= {arity for (held, arity) in LOG_ENTRIES if held == name}
        if name in self._facts():
            found.add(0)
        return sorted(found)

    def manifest(self) -> List[Tuple[str, int]]:
        """Every name and argument count this engine holds, across all seven tables.

        ``scripts/check-manifests.mjs`` compares this against the first engine's
        library, which is how a call one engine has and the other does not is
        found by a build rather than by the first case that happens to reach it.
        """
        held = set(self._entries) | set(self._stateful) | set(ORDER_ENTRIES)
        held |= set(ARRAY_CALLS) | set(LOG_ENTRIES) | set(OBJECT_CALLS)
        held |= {(name, 0) for name in self._facts()}
        return sorted(held)

    def length_of(self, name: str, arguments: Sequence[Any]) -> Optional[int]:
        """How long the string this call will build is, before it is built.

        The library says which of its calls can answer that and how, and the
        machine spends the ceiling: a string no engine could hold is reported
        rather than allocated. Absence for every other name, which is the honest
        answer and not a refusal to look: a padded or a replaced string's length
        is not known until it is built, and building it costs what it costs.

        Neither namespace is here. A ``chart`` fact is the instrument record the
        host stated and a ``pos`` fact is a number, so neither is a string this
        bar grew.
        """
        measure = MEASURED.get((name, len(arguments)))
        return None if measure is None else measure(*arguments)

    def builds_a_string(self, name: str) -> bool:
        """Whether this call makes the string it answers, rather than passing one on.

        The ceiling is on what a script grows. A call that hands back a string
        it was given, or one the host stated, grew nothing, and holding it to the
        ceiling would refuse a host its own long instrument name on a script that
        only read it.
        """
        return name in BUILDS_A_STRING or name == DATE_FORMAT

    def describe(self, name: str) -> str:
        """What this engine's manifest holds for a name, in OS6004's own words."""
        arities = self._arities(name)
        if not arities:
            return f"no function called {name}"
        spelled = " or ".join(str(one) for one in arities)
        return f"{name} with {spelled} arguments"

    # -- the call -----------------------------------------------------------

    def call(
        self,
        name: str,
        arguments: Sequence[Any],
        state: Optional[Dict[str, Any]],
        context: CallContext,
    ) -> Any:
        """One ``CALL_LIB``, dispatched by the name and the argument count.

        ``state`` is the call site's own region and is passed to the half of the
        library that keeps one and to nothing else: a region handed to a
        stateless call would be a region the load-time check should have refused,
        and a stateful call reaching this engine without one is the same
        disagreement from the other side, so it answers absence rather than
        making a region of its own that no rollback would ever restore.

        An order call never arrives here. Its manifest row carries an effect, so
        the machine holds it until step 9 and hands it to the ledger, which is
        ``compiled-program.md`` 5.4 and the whole reason a strategy is
        reproducible on a moving bar.
        """
        self._context = context
        held: Optional[Entry] = self._entries.get((name, len(arguments)))
        if held is not None:
            return held.call(self, list(arguments))
        keeping = self._stateful.get((name, len(arguments)))
        if keeping is not None:
            return ABSENT if state is None else keeping.call(self, list(arguments), state)
        drawn = OBJECT_CALLS.get((name, len(arguments)))
        if drawn is not None:
            return ABSENT if context.objects is None else drawn(context.objects, context.bar_index, arguments)
        if name == "clear" and clears_a_grid(arguments):
            return ABSENT
        array = ARRAY_CALLS.get((name, len(arguments)))
        if array is not None:
            return array(list(arguments))
        if len(arguments) == 0 and name in self._facts():
            return fact_value(name, self._instrument(), self._now(), self._book, self._bar)
        return ABSENT

    # -- the six members a stateless call may ask for -----------------------

    def bar(self, fact: str) -> Any:
        return self._bar.get(fact, ABSENT)

    def host(self, fact: str) -> Any:
        if self._context is None:
            return ABSENT
        return self._context.instrument.get(fact, ABSENT)

    def first_bar(self) -> bool:
        return self._first

    def _instrument(self) -> Any:
        """The record the host stated, which is what a ``chart`` fact is read from."""
        return {} if self._context is None else self._context.instrument

    def _now(self) -> Any:
        """The clock's fixed value, which a case states and no engine reads."""
        return ABSENT if self._context is None else self._context.now

    def kind_of(self, reference: Any) -> str:
        return tag(reference)

    def items_of(self, reference: Any) -> Optional[List[Any]]:
        if isinstance(reference, ArrayValue):
            return list(reference.elements)
        return None

    def make_array(self, items: List[Any]) -> Any:
        return ArrayValue(list(items))


def is_reference(value: Any) -> bool:
    """Whether a value is one of the heap's, which a channel never carries out."""
    return isinstance(value, Reference)
