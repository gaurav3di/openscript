"""The six things a value on this machine can be, and what absence does to each.

``compiled-program.md`` section 3.1 fixes the set and the rules that hold
everywhere, and section 7 says the whole of warmup is the absent value. So this
module is the one place absence is decided, and every instruction in
``machine.py`` reaches it through the operations below rather than testing for
absence itself. An engine that special cases absence anywhere else has a bug.

**Absence is a tag and never a number.** A sentinel such as not-a-number would
make absence propagate through arithmetic by accident, which is the right answer
for four operators and the wrong answer for six, and it would turn equality into
a floating point comparison. Here it is this interpreter's own null: the pool
entry ``["z", null]`` on the way in, and the ``null`` section 3.4 requires on the
way out to a host, with nothing to convert at either boundary.

**A number is a float and always finite.** Every arithmetic result goes through
``finite``, which answers absence for anything that is not, checked after each
individual operation rather than at the end of an expression: ``(1e308 * 10) /
10`` is absent and not ``1e307``. The same function normalises a negative zero
away, at every result and every store, because nothing in the language can
observe the sign of a zero and a difference nobody can act on is still a
difference two engines could reach text with.

**A boolean is not a number here.** This interpreter's own ``True`` is equal to
``1`` and orders against it, so every comparison below reads the tag first. That
single habit is what keeps ``true == 1`` false, as ``language.md`` section 9.3
requires, and it is the mistake this module exists to make unavailable.
"""

import math
from dataclasses import dataclass, field
from typing import Any, List

#: The absent value, written ``none`` in a script.
#:
#: The library package spells it the same way, and the two have to agree: a
#: value crosses that boundary on every ``CALL_LIB``, in both directions.
ABSENT = None


@dataclass(frozen=True)
class Colour:
    """Red, green and blue as whole numbers from 0 to 255, alpha from 0 to 1."""

    red: float
    green: float
    blue: float
    alpha: float


class Reference:
    """Something in the object heap. Equality on two of them is identity."""

    __slots__ = ()


@dataclass(eq=False)
class ArrayValue(Reference):
    """An array. ``ARRAY`` allocates a new one every time it executes."""

    elements: List[Any] = field(default_factory=list)


def is_absent(value: Any) -> bool:
    return value is ABSENT


def tag(value: Any) -> str:
    """The value's tag, in the spelling section 3.1's table uses."""
    if value is ABSENT:
        return "absent"
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, Colour):
        return "color"
    if isinstance(value, Reference):
        return "reference"
    return "unknown"


def finite(result: float) -> Any:
    """An arithmetic result: absent when it is not finite, and never a minus zero."""
    if not math.isfinite(result):
        return ABSENT
    return 0.0 if result == 0.0 else float(result)


def stored(value: Any) -> Any:
    """A value on its way into a slot, a cell, a register or a channel.

    Section 8.1 normalises a negative zero at every store as well as at every
    result, because a value can reach a store without an arithmetic instruction
    having touched it: a library function's answer, or a constant.
    """
    if is_number(value) and value == 0.0:
        return 0.0
    return value


def is_number(value: Any) -> bool:
    """Whether a value is a number, which a bool is not."""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def is_whole(value: Any) -> bool:
    """A number with nothing after the point, which is what a history index must be."""
    return is_number(value) and math.isfinite(value) and float(value) == math.floor(value)


def equal(left: Any, right: Any) -> bool:
    """``EQ``: total, and always a boolean.

    Absent equals absent and equals nothing else. Two colours are equal when all
    four channels match. Two references are equal when they are the same object,
    which is why the library has a call for comparing an array's contents.
    """
    left_tag, right_tag = tag(left), tag(right)
    if left_tag != right_tag:
        return False
    if left_tag == "absent":
        return True
    if left_tag == "reference":
        return left is right
    return bool(left == right)


def ordered(left: Any, right: Any) -> Any:
    """The comparison the four ordering instructions share: -1, 0, 1, or absent.

    Absence propagates rather than answering false, which is ``language.md``
    section 6.4 and the one thing that keeps a warming up study from drawing a
    confident line. Two numbers compare numerically and two strings by code
    point; anything else is a program the checker should have rejected, and an
    engine answers it with absence rather than inventing a conversion.
    """
    if left is ABSENT or right is ABSENT:
        return ABSENT
    both_numbers = is_number(left) and is_number(right)
    both_strings = isinstance(left, str) and isinstance(right, str)
    if not both_numbers and not both_strings:
        return ABSENT
    if left < right:
        return -1.0
    return 1.0 if left > right else 0.0


#: The three valued conjunction of ``language.md`` section 6.6, as a table.
#:
#: Written out rather than computed so that the page and the code are read side
#: by side. Each table holds only the cases its short circuit leaves to it:
#: ``AND_SHORT`` has already decided a false left operand, ``OR_SHORT`` a true
#: one, and absence on the left short circuits neither because the other side
#: can still decide the answer by itself. A pair neither table holds cannot
#: arise once the short circuit has run, and a program that produced one is
#: corrupt rather than unusual, so it is answered with absence rather than with
#: a row this page never wrote.
_ABSENT_KEY = "absent"

_AND = {
    (True, True): True,
    (True, False): False,
    (True, _ABSENT_KEY): ABSENT,
    (_ABSENT_KEY, True): ABSENT,
    (_ABSENT_KEY, False): False,
    (_ABSENT_KEY, _ABSENT_KEY): ABSENT,
}

_OR = {
    (False, True): True,
    (False, False): False,
    (False, _ABSENT_KEY): ABSENT,
    (_ABSENT_KEY, True): True,
    (_ABSENT_KEY, False): ABSENT,
    (_ABSENT_KEY, _ABSENT_KEY): ABSENT,
}


def _key(value: Any) -> Any:
    """A boolean, or the stand-in the two tables are keyed by for anything else."""
    return value if isinstance(value, bool) else _ABSENT_KEY


def conjunction(left: Any, right: Any) -> Any:
    return _AND.get((_key(left), _key(right)), ABSENT)


def disjunction(left: Any, right: Any) -> Any:
    return _OR.get((_key(left), _key(right)), ABSENT)


def negation(value: Any) -> Any:
    """``NOT``: true becomes false, false becomes true, absent stays absent."""
    if isinstance(value, bool):
        return not value
    return ABSENT


def truthy(value: Any) -> bool:
    """What ``JUMP_FALSE`` asks.

    The one place absence is absorbed rather than propagated, and it is
    unavoidable: execution has to go somewhere. It serves ``if``, ``else if``,
    ``while``, the ternary and a ``switch`` arm, so the rule is written once
    here and once in the instruction that reads it.
    """
    return value is True
