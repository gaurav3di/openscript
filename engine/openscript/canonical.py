"""The canonical encoding, ``compiled-program.md`` section 2.14, and the door text comes in by.

A hash is taken over canonical bytes and a host records it against a chart, a
backtest run and a live process. So text that parses to a program but is spelled
some other way is text that hash does not name, and an engine that accepted it
would report a run under a name identifying different bytes. That is why
``load_text`` below parses, writes the result out again through the writer here,
and refuses any difference, naming the character the two part at.

**Canonicity is required of text and not of an object.** ``spec/decisions.md``
minute 57 settled it and section 9.4 step 1 carries the sentence: an object
built in the same process was never text, has nothing to be canonical about, and
enters the refusal order at step 2. The check lives at the text boundary and
nowhere else, so the in-process case is free of a rule it could not break.

The rules, none of them cosmetic and none of them this file's invention:

- UTF-8, no byte order mark, no whitespace between tokens.
- Object keys sorted ascending by Unicode code point, because a sort is a rule
  an emitter in any language can follow without a table.
- A number written by the one rule ``language.md`` section 5.5 gives, which is
  the same rule for every number that becomes text anywhere in the language.
- A string escaping only the quote, the backslash and the code points below
  0x20, the last as ``\\u00XX`` except for the three that have a letter.

**The digits are the interpreter's and the layout is not.** The shortest decimal
digit string that reads back as the same binary64 is what every host worth
shipping on produces, so that half is taken from this one. Where two hosts part
company is the layout: when a value is written positionally and when with an
exponent, and how the exponent is spelled. That half is written out here from
the rule, once: the library's ``number_text`` calls this writer rather than
restating it, and ``spec/vectors/number-text.json`` holds the boundary cases
every engine checks itself against.
"""

import json
import math
from typing import Any, Tuple

from .diagnostics import Diagnostic, malformed

#: The two thresholds section 5.5 puts the positional form between.
_HIGHEST_POSITIONAL = 21
_LOWEST_POSITIONAL = -6


def spread(shown: str, places: int = 0) -> Tuple[str, int]:
    """A written magnitude as digits, and where the point falls.

    The value is ``0.d1d2...dk`` times ten to the returned power, which is the
    shape 5.5 states the rule in. Whatever layout the writing arrived in is
    undone here: the digits and the point are all that is kept, so the layout
    below is free to be the language's rather than the host's. ``places`` moves
    the point right, which is how the fixed decimal conversion scales without
    multiplying a second time.

    It takes the writing rather than the number because the two callers need two
    different ones: which digits a magnitude has is the host's question, and
    where they sit is this one's.
    """
    marker = shown.find("e")
    mantissa = shown if marker < 0 else shown[:marker]
    exponent = 0 if marker < 0 else int(shown[marker + 1 :])
    dot = mantissa.find(".")
    whole = mantissa if dot < 0 else mantissa[:dot]
    fraction = "" if dot < 0 else mantissa[dot + 1 :]
    digits = whole + fraction
    point = len(whole) + exponent + places
    # A positional form below one carries leading zeros that are not digits of
    # the value, and a whole number carries trailing zeros that are its layout.
    while digits.startswith("0"):
        digits = digits[1:]
        point -= 1
    while digits.endswith("0"):
        digits = digits[:-1]
    return digits, point


def _layout(digits: str, point: int) -> str:
    """Positional between the two thresholds, an exponent outside them."""
    count = len(digits)
    if count <= point <= _HIGHEST_POSITIONAL:
        return digits + "0" * (point - count)
    if 0 < point <= _HIGHEST_POSITIONAL:
        return f"{digits[:point]}.{digits[point:]}"
    if _LOWEST_POSITIONAL < point <= 0:
        return f"0.{'0' * -point}{digits}"
    exponent = point - 1
    lead = digits if count == 1 else f"{digits[0]}.{digits[1:]}"
    return f"{lead}e{'-' if exponent < 0 else ''}{abs(exponent)}"


def canonical_number(value: float) -> str:
    """A number as text: the one writer.

    Two engines compare numbers as bits, and they compare text in a case file,
    an expected column, a table cell and ``text(x)``, so how a number becomes
    text has to be one rule both implement and, here, one function both call.

    The two callers are ``canonicalise`` below, which writes a constant into the
    text a recorded hash is taken over, and ``library/number_text.py``, which is
    ``text(x)`` and the digits of ``text(x, decimals)``. The sentence above was
    a claim rather than a fact for one stage: the rule was implemented twice,
    with the two layout thresholds typed out in each, and the vectors held both
    to the same answers, so nothing failed. What would have failed is the day
    one of the two moved and a label stopped agreeing with a recorded hash.
    """
    number = float(value)
    if not math.isfinite(number):
        raise ValueError("a compiled program holds finite numbers only")
    # Zero and negative zero are one value to the language and one spelling here.
    if number == 0:
        return "0"
    digits, point = spread(repr(abs(number)))
    return ("-" if number < 0 else "") + _layout(digits, point)


_LETTERED = {"\n": "\\n", "\r": "\\r", "\t": "\\t", '"': '\\"', "\\": "\\\\"}


def canonical_string(value: str) -> str:
    out = ['"']
    for character in value:
        lettered = _LETTERED.get(character)
        if lettered is not None:
            out.append(lettered)
        elif ord(character) < 0x20:
            out.append(f"\\u{ord(character):04x}")
        else:
            out.append(character)
    out.append('"')
    return "".join(out)


def canonicalise(value: Any) -> str:
    """One value of a parsed program, written the one way it may be written."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return canonical_number(value)
    if isinstance(value, str):
        return canonical_string(value)
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(canonicalise(one) for one in value) + "]"
    if isinstance(value, dict):
        pairs = sorted(value.items(), key=lambda pair: pair[0])
        body = ",".join(f"{canonical_string(key)}:{canonicalise(one)}" for key, one in pairs)
        return "{" + body + "}"
    raise ValueError(f"a compiled program holds no value of this kind: {type(value).__name__}")


def _refuse_constant(text: str) -> Any:
    """What a reader must not build: the three spellings outside binary64's finite range."""
    raise ValueError(f"{text} is not a value a compiled program holds")


def _parted_at(text: str, written: str) -> int:
    """The index the two spellings part at, which is where the message points."""
    shortest = min(len(text), len(written))
    for index in range(shortest):
        if text[index] != written[index]:
            return index
    return shortest


def parse(text: str) -> Tuple[Any, Diagnostic]:
    """Step 1 of section 9.4: parse the text, and require it to be canonical.

    Returns the parsed program and no diagnostic, or nothing and the refusal.
    Both halves are OS6018 and each names where the text stopped being readable
    or stopped being canonical, because neither is repairable by hand: a program
    is written by a compiler and a malformed one is that compiler's defect.
    """
    if text.startswith("﻿"):
        return None, malformed("character 0", "the text carries a byte order mark")
    try:
        parsed = json.loads(text, parse_constant=_refuse_constant)
    except ValueError as reason:
        return None, malformed("the encoding", f"the text is not readable: {reason}")
    try:
        written = canonicalise(parsed)
    except ValueError as reason:
        return None, malformed("the encoding", str(reason))
    if written != text:
        return None, malformed(
            f"character {_parted_at(text, written)}",
            "the text is not the canonical encoding of what it parses to, and the hash a host "
            "records against a run is taken over canonical bytes",
        )
    return parsed, None
