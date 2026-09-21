"""How a value is written in a case file and in a report, and how one is read back.

``conformance.md`` sections 3 and 4 fix both directions and this module is the
whole of them, so that a reader of a case file and a writer of a report cannot
part company over a spelling.

**A number is read strictly.** The page says a price is "written in the shortest
form that reads back to the exact binary64 value intended", which is a decimal
and nothing else. The interpreter's own reader is wider than that: it takes an
infinity by name, a not-a-number, a hexadecimal fraction, surrounding space and
an underscore between digits, and each of those would enter the run as a value
``language.md`` section 5.1 says never appears. So the text is held to the
grammar first and converted after, and a case carrying one of those spellings is
malformed rather than quietly run.

**A number is written by the language's own rule.** ``language.md`` section 5.5
decides when the positional form is used and how an exponent is spelled, and
``canonical.py`` next door already implements it for the compiled program's
encoding. A second rule here would be the one that drifted, and the difference
would show up as two engines reporting one value two ways in a document a person
reads to decide which of them is wrong.

**A colour is written after the alpha has become a byte**, which is
``compiled-program.md`` section 3.1's one way conversion and the reason section 6
can compare four integers rather than a float. The two spellings of a colour this
package holds are both accepted here; the note in ``running.py`` says why there
are two.
"""

import re
from typing import Any, Optional

from ..canonical import canonical_number
from ..library.colour import Colour as LibraryColour, hex_byte
from ..library.rounding import round_half_away
from ..values import Colour as MachineColour
from .page import ABSENT_TEXT

#: A decimal, and nothing else: an optional sign, digits, an optional fraction
#: and an optional exponent. Nothing else the interpreter's reader would accept.
_DECIMAL = re.compile(r"^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$")

#: A whole number of milliseconds, which is what every time in a case file is.
_WHOLE = re.compile(r"^[+-]?[0-9]+$")

#: The eight hexadecimal digits a colour is compared as, with the leading hash.
_COLOUR = re.compile(r"^#[0-9a-f]{8}$")


class Malformed(Exception):
    """A case file that cannot be read, which section 9 files under ``error``.

    Carries one sentence naming the file, the row and what was wrong with it. A
    case is input to every engine that meets it, so the cost of a directory this
    one cannot read lands on whoever wrote the directory, and the sentence is
    what tells them which of the two it is.
    """


def read_number(text: str, where: str) -> float:
    """A decimal as the binary64 value it names, or a refusal naming where."""
    if not _DECIMAL.match(text):
        raise Malformed(
            f"{where}: {text!r} is not a decimal number. A case file writes a number in the "
            "shortest form that reads back to the value intended, and every other spelling a "
            "reader might accept, an infinity, a not-a-number or a digit separator, is a value "
            "this language holds none of"
        )
    value = float(text)
    if value != value or value in (float("inf"), float("-inf")):
        raise Malformed(f"{where}: {text!r} is outside the finite range of a binary64 number")
    return value


def read_whole(text: str, where: str) -> int:
    """A whole number, which is what a time and a quantity in a case file are."""
    if not _WHOLE.match(text):
        raise Malformed(f"{where}: {text!r} is not a whole number")
    return int(text)


def read_bool(text: str, where: str) -> bool:
    if text == "true":
        return True
    if text == "false":
        return False
    raise Malformed(f"{where}: {text!r} is neither true nor false")


def read_colour(text: str, where: str) -> str:
    """A colour, kept as the eight digit spelling it is compared as.

    It is not turned back into channels and an alpha. Section 3.1 says the
    conversion to a byte is one way and not a round trip, so a colour read back
    into the machine's own form and written out again would not always be the
    text the file holds, and the text is what section 6 compares.
    """
    if not _COLOUR.match(text):
        raise Malformed(
            f"{where}: {text!r} is not a colour. A colour is written #rrggbbaa, always eight "
            "hexadecimal digits and always lower case"
        )
    return text


def colour_text(value: Any) -> str:
    """A colour the machine holds, in the one spelling a case file writes.

    The alpha becomes a byte here and nowhere else: ``round(alpha * 255)`` with
    the language's own rounding, halves away from zero, which is section 3.1's
    rule and the rounding ``stdlib.md`` section 11.2 gives every colour call.
    """
    if isinstance(value, MachineColour):
        red, green, blue, alpha = value.red, value.green, value.blue, value.alpha
    elif isinstance(value, LibraryColour):
        red, green, blue, alpha = value.r, value.g, value.b, value.a
    else:
        raise Malformed(f"{value!r} is not a colour")
    channels = "".join(hex_byte(one) for one in (red, green, blue))
    return f"#{channels}{hex_byte(round_half_away(alpha * 255.0))}"


def written(value: Any) -> str:
    """A value as a report writes it, which is as an expected file writes it.

    Section 9: "Numbers in a report are written as the shortest round-tripping
    decimal, exactly as in an expected file, so a difference in the last bit is
    visible in the report rather than rounded away by the reporting."
    """
    if value is None:
        return ABSENT_TEXT
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return canonical_number(float(value))
    if isinstance(value, str):
        return value
    if isinstance(value, (MachineColour, LibraryColour)):
        return colour_text(value)
    return repr(value)


def as_reported(value: Any) -> Any:
    """One value of an answered channel, in the JSON shapes section 4 gives.

    Absence is null, a number is a number, a bool is a bool, a string is itself,
    and a colour is its eight digit spelling, because that is what section 6
    compares a colour as and a JSON document has no colour of its own.
    """
    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, (MachineColour, LibraryColour)):
        return colour_text(value)
    return None


def read_cell(text: str, kind: str, where: str) -> Optional[Any]:
    """One field of ``expected.csv``, read as the channel's own type.

    The type comes from the compiled program's channel table
    (``compiled-program.md`` section 2.7) rather than from the shape of the
    text, so a string channel holding ``none`` is a channel that produced
    nothing and not the four letters.

    An empty field and ``none`` are both absence here, and that is a narrowing
    of section 4 rather than a reading of it: the page distinguishes "this
    channel produced nothing on this bar" from an absent number, and a channel
    on this machine has one state for both (section 2.7: a channel's value is
    absent unless something wrote it). An engine that answered two different
    values would be inventing a distinction it cannot observe.
    """
    if text == "" or text == ABSENT_TEXT:
        return None
    if kind == "number":
        return read_number(text, where)
    if kind == "bool":
        return read_bool(text, where)
    if kind == "color":
        return read_colour(text, where)
    if kind == "string":
        return text
    raise Malformed(f"{where}: {kind!r} is not a channel type this adapter reads")
