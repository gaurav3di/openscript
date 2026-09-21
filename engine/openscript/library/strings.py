"""Strings, `stdlib.md` section 10.

None of these has a warmup: a string operation on a present string produces a
value on bar 0. Every one is absent when an argument it needs is absent, and none
of them raises: the string and array ceilings of `compiled-program.md` section
2.4 are the interpreter's to enforce, and the two measuring functions here exist
so that it can enforce them before a string is built rather than after.

**Every index and every length counts code points**, through ``code_points``. On
this host that is what the string type already is, which makes the rule free and
does not make it optional.

**Case conversion is invariant rather than locale aware.** A script whose output
changed because the machine running it was configured for another locale would
break the determinism rule of `language.md` section 7.6, and the cases where a
locale aware conversion differs are not cases a trading script needs. What the
page does not say is which case conversion, and that is a gap worth naming:
"upper case, invariant" is the host's default mapping here and the host's default
mapping there, and the two agree on every letter a symbol or a label is likely to
hold and are not guaranteed to agree on every code point. An engine is held to
the conformance suite's strings, not to this sentence.
"""

from .code_points import trimmed
from .number_text import spell
from .values import ABSENT, Value, whole


def _string(value: Value) -> str | None:
    """A string argument, or absence for anything that is not one."""
    return value if isinstance(value, str) else None


def length(s: Value) -> Value:
    """``str.length(s)``: count of Unicode code points."""
    text = _string(s)
    return ABSENT if text is None else float(len(text))


def upper(s: Value) -> Value:
    """``str.upper(s)``: upper case, invariant, not locale dependent."""
    text = _string(s)
    return ABSENT if text is None else text.upper()


def lower(s: Value) -> Value:
    """``str.lower(s)``: lower case, on the same terms."""
    text = _string(s)
    return ABSENT if text is None else text.lower()


def trim(s: Value) -> Value:
    """``str.trim(s)``: the whitespace of section 10's table, off both ends."""
    text = _string(s)
    return ABSENT if text is None else trimmed(text)


def contains(s: Value, part: Value) -> Value:
    """``str.contains(s, part)``: whether one string appears in another."""
    text = _string(s)
    piece = _string(part)
    if text is None or piece is None:
        return ABSENT
    return piece in text


def starts_with(s: Value, part: Value) -> Value:
    """``str.startsWith(s, part)``: prefix test."""
    text = _string(s)
    piece = _string(part)
    if text is None or piece is None:
        return ABSENT
    return text.startswith(piece)


def ends_with(s: Value, part: Value) -> Value:
    """``str.endsWith(s, part)``: suffix test."""
    text = _string(s)
    piece = _string(part)
    if text is None or piece is None:
        return ABSENT
    return text.endswith(piece)


def index_of(s: Value, part: Value) -> Value:
    """``str.indexOf(s, part)``: first position of ``part``, or -1.

    The position is in code points, which is what this host's own search already
    reports; an engine whose strings are sixteen bit units converts, or it hands
    a script an index that its own substring call then reads as a different one.
    """
    text = _string(s)
    piece = _string(part)
    if text is None or piece is None:
        return ABSENT
    return float(text.find(piece))


def substring(s: Value, start: Value, stop: Value) -> Value:
    """``str.substring(s, from, to = none)``: from inclusive, to exclusive.

    An absent ``to`` runs to the end, which is the default the page states, and
    is why absence is not propagated from that argument alone.
    """
    text = _string(s)
    first = whole(start)
    if text is None or first is None:
        return ABSENT
    if stop is None:
        return text[first:]
    last = whole(stop)
    if last is None:
        return ABSENT
    return text[first:last]


def replace(s: Value, find: Value, into: Value) -> Value:
    """``str.replace(s, find, with)``: the first occurrence only."""
    text = _string(s)
    needle = _string(find)
    other = _string(into)
    if text is None or needle is None or other is None:
        return ABSENT
    return text.replace(needle, other, 1)


def replace_all(s: Value, find: Value, into: Value) -> Value:
    """``str.replaceAll(s, find, with)``: every occurrence."""
    text = _string(s)
    needle = _string(find)
    other = _string(into)
    if text is None or needle is None or other is None:
        return ABSENT
    return text.replace(needle, other)


def split(s: Value, separator: Value) -> list[str] | None:
    """``str.split(s, separator)``: the parts, for the interpreter to make an array.

    The array is the interpreter's to allocate, because the heap is, so this
    returns the parts and absence stands for a call that produces nothing.

    **An empty separator splits into code points**, which is
    `compiled-program.md` section 3.1's rule and not every host's: a host whose
    strings are sixteen bit units splits a symbol outside the basic plane into
    two halves of a surrogate pair, neither of which is a string the language has
    a value for.
    """
    text = _string(s)
    mark = _string(separator)
    if text is None or mark is None:
        return None
    if mark == "":
        return list(text)
    return text.split(mark)


def join(parts: list[Value], separator: Value) -> Value:
    """``str.join(parts, separator)``: an array back into one string.

    An element that is not a string is spelled as ``text`` spells it, which is
    what makes joining an array of numbers produce the same characters as writing
    each of them.
    """
    mark = _string(separator)
    if parts is None or mark is None:
        return ABSENT
    return mark.join(spell(item) for item in parts)


def _pad(text: str, width: int, fill: str, left: bool) -> str:
    if len(text) >= width:
        return text
    needed = width - len(text)
    padding = "".join(fill[at % len(fill)] for at in range(needed))
    return padding + text if left else text + padding


def pad_left(s: Value, width: Value, fill: Value) -> Value:
    """``str.padLeft(s, width, fill = " ")``: pad to a width, for a column.

    The padding is the fill repeated and cut to length, code point by code point,
    rather than the fill repeated a whole number of times: a two character fill
    padding an odd gap has to stop halfway, and where it stops is what a table
    column lines up on.
    """
    return _padded(s, width, fill, True)


def pad_right(s: Value, width: Value, fill: Value) -> Value:
    """``str.padRight(s, width, fill = " ")``: the same from the other side."""
    return _padded(s, width, fill, False)


def _padded(s: Value, width: Value, fill: Value, left: bool) -> Value:
    text = _string(s)
    if text is None:
        return ABSENT
    size = whole(width)
    filler = _string(fill)
    if filler is None:
        filler = " "
    if size is None or filler == "":
        return text
    return _pad(text, size, filler, left)


def repeat(s: Value, count: Value) -> Value:
    """``str.repeat(s, n)``: ``n`` copies, for a bar drawn out of characters."""
    text = _string(s)
    times = whole(count)
    if text is None or times is None:
        return ABSENT
    return text * times


def repeat_length(s: Value, count: Value) -> int | None:
    """How long ``str.repeat`` will be, before a character of it is built.

    A length times a count is where the string ceiling is actually reached, and
    building the string to find that out is how an engine runs out of memory
    instead of reporting that it would have.
    """
    text = _string(s)
    times = whole(count)
    if text is None or times is None:
        return None
    return len(text) * times
