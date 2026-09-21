"""What a case expects, read out of its own files into one mapping by channel.

``conformance.md`` section 4 splits the expectation across two files for a reason
it gives: ``expected.csv`` is one value per bar and one column per asserted
channel, and ``expected.json`` is everything that is not, each channel an ordered
list of flat objects. The comparison wants one shape, so both are read here into
the shape the answer already has, and a channel the case asserts that neither
file holds is a malformed case rather than a failure of the engine.

**A cell is read as the channel's own type, and the case file does not carry
one.** ``expected.csv`` has a header of column names and no types, so the four
letters ``true`` in a string column and the bool are the same eight bytes on
disk. The type comes from the compiled program's channel table
(``compiled-program.md`` section 2.7), which the run has already resolved, and it
is passed in here rather than guessed from the shape of the text: a guess would
read a string channel that emitted ``true`` as a bool and report a difference
that is in the reader rather than in either engine.
"""

from typing import Any, Dict, Mapping, Optional, Sequence, Tuple

from .reading import Case
from .spellings import Malformed, read_cell

#: Section 4: the channel whose expectation is columnar, and the file it is in.
COLUMNAR = "values"


def values_expected(
    columns: Sequence[str], rows: Sequence[Sequence[str]], types: Mapping[str, str]
) -> list:
    """``expected.csv`` as one flat object per bar, in the answer's own shape."""
    out = []
    for at, row in enumerate(rows):
        held: Dict[str, Any] = {}
        for which, name in enumerate(columns):
            kind = types.get(name)
            if kind is None:
                raise Malformed(
                    f"expected.csv names the column {name} and this program has no channel for it"
                )
            held[name] = read_cell(row[which], kind, f"expected.csv line {at + 2}, {name}")
        out.append(held)
    return out


def expected_channels(
    case: Case, types: Mapping[str, str]
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Every asserted channel as the case holds it, or the sentence refusing it."""
    found: Dict[str, Any] = {}
    for channel in case.asserts:
        if channel == COLUMNAR:
            if not case.expected_columns:
                return None, "the case asserts values and holds no expected.csv (section 4)"
            found[channel] = values_expected(case.expected_columns, case.expected_rows, types)
            continue
        if case.expected_json is None or channel not in case.expected_json:
            return None, (
                f"expected.json holds no {channel}, which case.json asserts. A case asserts the "
                "channels it names, and one it names with nothing to compare against is malformed"
            )
        held = case.expected_json[channel]
        if not isinstance(held, list):
            return None, f"expected.json's {channel} is not an ordered list (section 4)"
        found[channel] = held
    return found, None
