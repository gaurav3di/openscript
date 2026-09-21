"""The library of `spec/stdlib.md`, in the accumulation order section 20 fixes.

This door exports the **stateless half**: every function whose result depends on
this bar's arguments and this bar's facts and on nothing it remembers. The
stateful half, the averages and the windowed studies that carry a state region
from bar to bar, is a separate stage and adds its own modules and its own entries
beside these.

What is here, by the page it is written from:

- ``values``        absence, and the two rules every number returned has passed
- ``arithmetic``    section 8.1, the bare calls that compute one value
- ``rounding``      section 8.1 and 20.7, one rule for halves and one scale table
- ``elementary``    section 8.2, the square root and the gap 1 family
- ``bars``          section 20.5's one reading that remembers nothing
- ``code_points``   section 10's whitespace set and the one string order
- ``number_text``   `language.md` 5.5, how a number becomes text and back
- ``strings``       section 10, the string calls
- ``colour``        section 11, the nineteen names and the calls that compute one
- ``stateless``     the manifest rows: what a name and an arity resolve to

**Two things this package will not do.** It raises nothing: a wrong argument is a
diagnostic with a code and a span, produced by the checker or the interpreter
before a call arrives, and every backstop here answers with absence instead
(`stdlib.md` section 2.4). And it holds no state: a function that needs to
remember is not in this half, which is what lets an engine call any of these from
anywhere without a state region, a checkpoint or a rollback.

**One family is not held to the vectors.** ``exp``, ``log``, ``log10``,
``math.log2``, ``pow``, ``math.hypot`` and the trigonometric namespace reach gap 1
of `stdlib.md` section 20.11: no portable reference algorithm is written down
anywhere, so they call the host's maths module and carry no cross-engine
guarantee. ``elementary`` says it again where an implementer will be standing.
"""

from .stateless import ENTRIES, Context, Entry, table

__all__ = ["ENTRIES", "Context", "Entry", "table"]
