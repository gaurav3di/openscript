"""Reading `spec/vectors/library/`, which is this engine's oracle for the library.

`docs/integrating/library-vectors.md` is the page these files are described on,
and this module is that page followed. Every number in them is a binary64 bit
pattern: sixteen lower case hex digits, sign bit first, the eight bytes in big
endian order. Nothing was formatted as a decimal anywhere on the way, so what is
decoded here is what the first engine held.

**Comparison is on the sixteen digits, never on two floats.** A float comparison
says two zeros of different signs are equal and that a not-a-number equals
nothing, and neither is the comparison `conformance.md` section 6 defines. The
value a function returns is encoded and the strings are compared, which also
makes a failure readable: the two patterns are what a reader needs to see.

Absence matches only absence. A tolerance of zero is the default there and the
only setting this file has.
"""

import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LIBRARY = ROOT / "spec" / "vectors" / "library"
NUMBER_TEXT = ROOT / "spec" / "vectors" / "number-text.json"


def read(path: Path):
    """One JSON file of the specification, as the data it holds."""
    return json.loads(path.read_text(encoding="utf-8"))


def index():
    """The index file: every vector file, and what has none and why."""
    return read(LIBRARY / "index.json")


def vectors_for(file_name: str):
    """One function's file: its cases, each a run of bars."""
    return read(LIBRARY / file_name)


def number_of(cell) -> float | None:
    """One cell as a number, for a column a caller knows is numeric."""
    return None if cell is None else struct.unpack(">d", bytes.fromhex(cell))[0]


def column_value(column, at: int):
    """One cell of one column, as the value the column's ``kind`` says it is.

    The kind is asked rather than guessed from the cell, because a bit pattern
    and a plain string are both strings in a JSON file and a column of
    sixteen character symbols would otherwise be read as numbers. A column whose
    kind is ``none`` is absent throughout and answers absence at every bar.
    """
    cell = column["values"][at]
    if cell is None:
        return None
    return number_of(cell) if column["kind"] == "number" else cell


def cell_of(value):
    """A value as the cell a vector file would hold for it.

    The encoding is what makes the comparison exact: a number becomes its bit
    pattern, which distinguishes the two zeros and every neighbouring value, and
    a bool stays a bool so that ``true`` can never match the number one.
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value
    return struct.pack(">d", value).hex()


def ulps_between(one: str, other: str) -> int:
    """How many representable values apart two bit patterns are.

    Used for the gap 1 calls only, which `conformance.md` section 8 scopes out of
    equality: there is no portable algorithm for them, so the question that can
    be asked is how far the two libraries are apart rather than whether they
    agree. Both sides are read as signed whole numbers, which is the right
    distance for two values of the same sign and an overstatement across zero;
    an overstatement fails loudly rather than passing quietly, which is the
    direction a check should err in.
    """
    (left,) = struct.unpack(">q", bytes.fromhex(one))
    (right,) = struct.unpack(">q", bytes.fromhex(other))
    return abs(left - right)
