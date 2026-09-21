"""The seam between the library's entries and the machine's ``Library`` protocol.

``contracts.py`` says what the machine asks of a library: a manifest to disagree
with at load, a sentence describing what this engine holds instead, and a way to
call one. ``library/stateless.py`` answers a different shape: a table keyed by a
name and an argument count, whose calls take a context of six members and the
arguments. Nothing in the package joins the two yet, so this adapter carries the
join, and it carries it here rather than inside the answer so that the day a
module in the package does it, one import changes and nothing else does.

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

from typing import Any, Dict, List, Optional, Sequence

from ..contracts import CallContext, LibraryEntry
from ..library import table
from ..library.stateless import Entry
from ..values import ABSENT, ArrayValue, Reference, tag


class Serving:
    """The stateless half of the library, as the machine's ``Library``.

    One instance per run. ``at_bar`` is called by whatever drives the bars,
    before each execution, with the three facts a bar-reading call needs and no
    context carries.
    """

    def __init__(self) -> None:
        self._entries = table()
        self._bar: Dict[str, Any] = {}
        self._first = False
        self._context: Optional[CallContext] = None

    # -- what the caller states before a bar --------------------------------

    def at_bar(self, high: Any, low: Any, previous_close: Any, first: bool) -> None:
        """The bar facts ``trueRange`` reads, for the execution about to happen."""
        self._bar = {"high": high, "low": low, "previousClose": previous_close}
        self._first = first

    # -- the manifest, which is what a load is held to ----------------------

    def entry(self, name: str, arity: int) -> Optional[LibraryEntry]:
        held = self._entries.get((name, arity))
        if held is None:
            return None
        return LibraryEntry(held.name, held.arity, held.state, held.effect)

    def describe(self, name: str) -> str:
        """What this engine's manifest holds for a name, in OS6004's own words."""
        arities = sorted(arity for (held, arity) in self._entries if held == name)
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

        ``state`` is not read: every entry of this half holds nothing across
        bars, which is what the manifest says of it, and a region handed to one
        would be a region the load-time check should have refused.
        """
        held: Optional[Entry] = self._entries.get((name, len(arguments)))
        if held is None:
            return ABSENT
        self._context = context
        return held.call(self, list(arguments))

    # -- the six members a stateless call may ask for -----------------------

    def bar(self, fact: str) -> Any:
        return self._bar.get(fact, ABSENT)

    def host(self, fact: str) -> Any:
        if self._context is None:
            return ABSENT
        return self._context.instrument.get(fact, ABSENT)

    def first_bar(self) -> bool:
        return self._first

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
