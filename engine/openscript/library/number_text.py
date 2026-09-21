"""How a number becomes text, and how text becomes a number.

`language.md` section 5.5 is one rule for every place a number is written: the
``text`` call, a table cell, an alert's message, a constant in a compiled
program, a case file and an expected column. Two engines compare numbers as bits
and text as text, so a number that two rules could spell two ways is a
disagreement with no number wrong anywhere.

**The digits** are the shortest string of decimal digits that reads back as the
same binary64 value. That is the conversion the host already performs natively
and two hosts have been measured to agree on it, so it is taken rather than
rebuilt. **The layout is where hosts part company**: where the point goes, when
an exponent starts, and what is never written. The host's own writing turns to an
exponent at a different magnitude, spells the exponent with a sign and a leading
zero, and writes a point and a zero after a whole number, and all four of those
are wrong here.

**That layout is written out once, in ``canonical.py``, and this file calls it.**
It was written out twice for one stage, here and there, with the two thresholds
typed into each; both passed the vectors, so the copy cost nothing until the day
one of them moved. What is this file's is what the layout is used for: the value
a script asks for as text, the fixed decimal conversion built on the same digits,
and the reading back of text as a number.

`spec/vectors/number-text.json` holds the boundary cases as bit patterns and as
text, in both directions, so an engine in any language can be held to the rule
without reading either engine's source. ``tests/test_number_text.py`` is this
engine held to it.

**``text(x, decimals)`` is the one call whose layout is always positional**, at
every magnitude, and its digits are this rule's digits for the rounded and scaled
whole number, zero filled. A conversion that changed shape above a threshold
would be a label that read correctly until the day a cumulative volume crossed
it.
"""

import math

from ..canonical import canonical_number, spread
from .code_points import trimmed
from .colour import Colour, hex_byte
from .rounding import round_half_away, scale_of
from .values import ABSENT, Value, is_number, number, result, whole


def _carry(digits: str) -> str:
    """One added to a string of digits, which grows it when every digit is nine."""
    out = list(digits)
    for at in range(len(out) - 1, -1, -1):
        if out[at] != "9":
            out[at] = chr(ord(out[at]) + 1)
            return "".join(out)
        out[at] = "0"
    return "1" + "".join(out)


def _written(digits: str, point: int) -> str:
    """A spread written out, rounded half up where the point falls inside it.

    Half up on a magnitude is half away from zero, because the sign is carried
    separately by every caller.
    """
    if point >= len(digits):
        return digits + "0" * (point - len(digits))
    if point < 0:
        return "0"
    kept = digits[:point]
    if digits[point] < "5":
        return kept if kept != "" else "0"
    return _carry(kept)


def fixed(x: float, decimals: int) -> str:
    """``text(x, decimals)``: a sign, at least one digit, and exactly ``decimals``.

    The rounding is done on the number before it is written rather than left to a
    formatting routine, because a routine's tie rule is the host's and the two
    disagree at exactly the values a price lands on: this is halves away from
    zero over the scaled value, and the host's is halves to even over the exact
    binary expansion.

    **The scale is ``round(x, decimals)``'s**, so the display conversion and the
    rounding call multiply by one value (`stdlib.md` 20.7) and cannot part by an
    ulp at the one count where a floating point power does.

    Where the scaling leaves binary64 altogether there is nothing left to round:
    a binary64 that large is a whole number already and a decimal place that far
    from its leading digit is past every digit it carries, so the digits are the
    unscaled value's and the point is moved instead.
    """
    scaled = round_half_away(x * scale_of(decimals))
    usable = math.isfinite(scaled)
    negative = scaled < 0 if usable else x < 0
    sign = "-" if negative else ""
    if usable:
        digits, point = spread(canonical_number(abs(scaled)))
    else:
        digits, point = spread(canonical_number(abs(x)), decimals)
    written = _written(digits, point).rjust(decimals + 1, "0")
    if decimals == 0:
        return sign + written
    cut = len(written) - decimals
    return sign + written[:cut] + "." + written[cut:]


def fixed_length(x: float, decimals: int) -> int:
    """How long ``text(x, decimals)`` will be, before a character is built.

    A floor rather than the exact count: a carry off the front adds one digit and
    a negative adds the sign, and both are caught by the ceiling the built string
    is checked against. What this is for is the decimal count a script computed,
    which can ask for a string no engine can hold, and building it to find that
    out is how an engine runs out of memory instead of reporting that it would
    have. The ceiling itself is the interpreter's: nothing in this package raises.
    """
    _, point = spread(canonical_number(abs(x)))
    return max(1, point) + decimals + (1 if decimals > 0 else 0)


def text_of(x: Value, decimals: Value) -> Value:
    """``text(x, decimals)`` as the library entry calls it."""
    value = number(x)
    count = whole(decimals)
    if value is None or count is None:
        return ABSENT
    return fixed(value, count)


def text_length(x: Value, decimals: Value) -> int | None:
    """``text(x, decimals)``'s length, as the interpreter asks for it.

    Absence for arguments the call itself answers absence for, because a call
    that builds no string cannot pass a ceiling on strings.
    """
    value = number(x)
    count = whole(decimals)
    if value is None or count is None:
        return None
    return fixed_length(value, count)


_DIGITS = "0123456789"


def to_number(text: Value) -> Value:
    """``toNumber(s)``: a string to a number, absent for what does not parse.

    The grammar is walked here rather than handed to the host's own reader, which
    accepts an infinity, a not-a-number and digit group separators, and which of
    those a host accepts differs between hosts and moves between their releases.
    Absence rather than zero for text that is not a number, so a
    script can tell text that is not a number apart from the number zero. Only
    these ten digits count: the host's own digit test accepts the decimal digits
    of every script Unicode has, which would read a number no writer of the
    script could have typed and no second engine would agree with.

    The whitespace ignored at either end is ``str.trim``'s set and no other.
    """
    if not isinstance(text, str):
        return ABSENT
    bare = trimmed(text)
    at = 0
    end = len(bare)
    if at < end and bare[at] in "+-":
        at += 1
    before = 0
    while at < end and bare[at] in _DIGITS:
        at += 1
        before += 1
    after = 0
    if at < end and bare[at] == ".":
        at += 1
        while at < end and bare[at] in _DIGITS:
            at += 1
            after += 1
    if before == 0 and after == 0:
        return ABSENT
    if at < end and bare[at] in "eE":
        at += 1
        if at < end and bare[at] in "+-":
            at += 1
        power = 0
        while at < end and bare[at] in _DIGITS:
            at += 1
            power += 1
        if power == 0:
            return ABSENT
    if at != end:
        return ABSENT
    return result(float(bare))


def spell(value: Value, of_reference=None) -> str:
    """A value as ``text(x)`` spells it.

    Absence is the word ``none``, a bool is its own word, a string is itself, and
    a number is the rule at the top of this file. A colour is the ``#rrggbbaa``
    spelling the conformance suite compares, where the alpha byte is
    ``round(alpha * 255)`` with the language's own rounding: that conversion is
    one way and is not a round trip, and nothing in the language observes the
    difference, because a script reads an alpha with ``alpha()`` from the machine
    value and never from the wire form.

    A reference is the interpreter's: the heap and the object in it are not this
    package's, so ``of_reference`` is asked for the kind of one and the word
    ``none`` stands where no interpreter answered.
    """
    if value is None:
        return "none"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if is_number(value):
        return canonical_number(float(value))
    if isinstance(value, str):
        return value
    if isinstance(value, Colour):
        alpha = round_half_away(value.a * 255)
        return "#" + hex_byte(value.r) + hex_byte(value.g) + hex_byte(value.b) + hex_byte(alpha)
    if of_reference is None:
        return "none"
    return of_reference(value)
