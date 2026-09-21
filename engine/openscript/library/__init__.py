"""The library of `spec/stdlib.md`, in the accumulation order section 20 fixes.

This door exports **both halves**, as two tables rather than one. The stateless
half is every function whose result depends on this bar's arguments and this
bar's facts and on nothing it remembers; the stateful half is the averages and
the windowed studies that carry a state region from bar to bar. They are two
tables because a call of one takes two things and a call of the other takes
three: the region is the difference, and a single table would hand a caller two
shapes to tell apart at the call site rather than at the manifest.

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
- ``stateless``     the manifest rows of the first half
- ``series``        section 20.2's two shapes, and the region they are kept in
- ``prices``        the two derived prices the second half forms for itself
- ``averages``      section 20.3, the six means not built from another mean
- ``composites``    section 20.3, the means built from those, and the fit
- ``trend``         section 20.3, the studies that carry a decision from bar to bar
- ``strength``      section 20.4, the position and strength readings
- ``momentum``      section 20.4, the momentum readings and the two mean gaps
- ``ranges``        section 20.5, the readings taken from the bar's own range
- ``deviation``     section 20.5, the spread readings and the bands built on them
- ``flows``         section 20.6, the volume readings
- ``extremes``      sections 9 and 20.10, the window scans and the pivots
- ``counting``      section 20.8, the totals, the ranks and the pair statistics
- ``bookkeeping``   section 9, the comparisons and the two that wait on a condition
- ``stateful``      the manifest rows of the second half

**One thing this package will not do.** It raises nothing: a wrong argument is a
diagnostic with a code and a span, produced by the checker or the interpreter
before a call arrives, and every backstop here answers with absence instead
(`stdlib.md` section 2.4). The memory ceilings are the interpreter's for the same
reason, and ``MEASURED`` below is what it asks this package before it spends one:
the two calls that can be asked for a string no engine could hold, and how long
each of them will be before a character of it exists.

**What a stateful call is handed that a stateless one is not** is the call site's
own region, a plain mapping the engine created and owns, because
`compiled-program.md` section 2.11 requires a region to be snapshottable by a
mechanical copy without the engine knowing which function it belongs to. A
stateless call needs none, which is what lets an engine call one of those from
anywhere without a checkpoint or a rollback.

**One family is not held to the vectors.** ``exp``, ``log``, ``log10``,
``math.log2``, ``pow``, ``math.hypot`` and the trigonometric namespace reach gap 1
of `stdlib.md` section 20.11, and so do ``alma``, ``hv`` and ``chop``, which are
built on the first three: no portable reference algorithm is written down
anywhere, so they call the host's maths module and carry no cross-engine
guarantee. ``elementary`` says it again where an implementer will be standing.
"""

from .stateful import ENTRIES as STATEFUL_ENTRIES
from .stateful import Entry as StatefulEntry
from .stateful import table as stateful_table
from .stateless import BUILDS_A_STRING, ENTRIES, MEASURED, Context, Entry, table

__all__ = [
    "ENTRIES",
    "Context",
    "Entry",
    "BUILDS_A_STRING",
    "MEASURED",
    "STATEFUL_ENTRIES",
    "StatefulEntry",
    "stateful_table",
    "table",
]
