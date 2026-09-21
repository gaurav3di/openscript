"""How a number becomes text, and how text becomes a number.

`language.md` section 5.5 is one rule for every place a number is written: the
``text`` call, a table cell, an alert's message, a constant in a compiled
program, a case file and an expected column. Two engines compare numbers as bits
and text as text, so a number that two rules could spell two ways is a
disagreement with no number wrong anywhere.

**The digits** are the shortest string of decimal digits that reads back as the
same binary64 value. That is the conversion the host already performs natively
and two hosts have been measured to agree on it, so it is taken rather than
rebuilt. **The layout is where hosts part company**, and the layout is what this
file implements: where the point goes, when an exponent starts, and what is never
written. The host's own writing turns to an exponent at a different magnitude,
spells the exponent with a sign and a leading zero, and writes a point and a zero
after a whole number, and all four of those are wrong here.

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

from .code_points import trimmed
from .colour import Colour, hex_byte
from .rounding import round_half_away, scale_of
from .values import ABSENT, Value, is_number, number, result, whole

# The layout thresholds of 5.5, which decide positional against exponent. The
# positional range runs from ten to the minus seventh, exclusive, to ten to the
# twenty first, exclusive.
_HIGHEST_POSITIONAL = 21
_LOWEST_POSITIONAL = -6


def spread(shown: str, places: int) -> tuple[str, int]:
    """A written magnitude as digits and the position of its point.

    The value is ``0.d1d2...dk`` times ten to the returned position, which is the
    shape 5.5 states the rule in. ``places`` moves the point right, which is how
    the fixed decimal conversion scales without multiplying a second time.

    **This is the only place an exponent is allowed to exist.** The host writes a
    large enough magnitude in exponential form, and that writing reaching a
    routine that splits a whole part from a fraction comes back out as nonsense
    on a label, with no diagnostic anywhere. So the exponent is taken off here,
    once, and everything after this works on digits and a position, where moving
    the point is whole number arithmetic and cannot produce a character that was
    not a digit.

    It takes the writing rather than the number because which digits a magnitude
    has is the host's question, and where they sit is this file's.
    """
    marker = shown.find("e")
    mantissa = shown if marker < 0 else shown[:marker]
    exponent = 0 if marker < 0 else int(shown[marker + 1 :])
    dot = mantissa.find(".")
    before = mantissa if dot < 0 else mantissa[:dot]
    after = "" if dot < 0 else mantissa[dot + 1 :]
    written = before + after
    digits = written.lstrip("0")
    point = len(before) + exponent + places - (len(written) - len(digits))
    return digits.rstrip("0"), point


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


def canonical(x: float) -> str:
    """A number as `language.md` 5.5 spells it.

    Zero is ``0`` and so is a negative zero: the language holds one zero, and a
    rule that could spell a negative zero would let the sign of a zero reach a
    string. A negative is a minus followed by the text of its magnitude. There is
    never a plus on an exponent, never a point and a zero on a whole number, and
    never a leading zero before a digit other than in the ``0.x`` layout.
    """
    if x == 0:
        return "0"
    sign = "-" if x < 0 else ""
    digits, point = spread(repr(abs(x)), 0)
    count = len(digits)
    if count <= point <= _HIGHEST_POSITIONAL:
        return sign + digits + "0" * (point - count)
    if 0 < point <= _HIGHEST_POSITIONAL:
        return sign + digits[:point] + "." + digits[point:]
    if _LOWEST_POSITIONAL < point <= 0:
        return sign + "0." + "0" * (-point) + digits
    lead = digits[0] + ("." + digits[1:] if count > 1 else "")
    return sign + lead + "e" + str(point - 1)


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
        digits, point = spread(canonical(abs(scaled)), 0)
    else:
        digits, point = spread(canonical(abs(x)), decimals)
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
    _, point = spread(canonical(abs(x)), 0)
    return max(1, point) + decimals + (1 if decimals > 0 else 0)


def text_of(x: Value, decimals: Value) -> Value:
    """``text(x, decimals)`` as the library entry calls it."""
    value = number(x)
    count = whole(decimals)
    if value is None or count is None:
        return ABSENT
    return fixed(value, count)


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
        return canonical(float(value))
    if isinstance(value, str):
        return value
    if isinstance(value, Colour):
        alpha = round_half_away(value.a * 255)
        return "#" + hex_byte(value.r) + hex_byte(value.g) + hex_byte(value.b) + hex_byte(alpha)
    if of_reference is None:
        return "none"
    return of_reference(value)
