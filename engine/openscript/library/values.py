"""Absence, and the two rules every number this library returns has passed.

`compiled-program.md` section 3.1 states both, and they are here rather than in
each function because a rule written out thirty times is a rule with thirty
places to get it wrong:

- **A number is always finite.** Any result that is not is absent, checked after
  each individual operation rather than at the end of an expression, so that two
  engines cannot differ over where one of them happened to round.
- **Negative zero is normalised to positive zero.** Nothing in the language can
  observe the sign of a zero, and a rule that could spell one would let it reach
  a string through ``text`` and differ between two engines for no reason a
  reader could act on.

Absence is ``None`` and never a not-a-number. `compiled-program.md` section 3.4
gives the reason: a not-a-number propagates through arithmetic by accident,
which is the right answer for some operators and the wrong one for others, and
it would turn an absence test into a floating point comparison.

**Nothing here raises.** A wrong argument is a diagnostic the checker or the
interpreter produces, with a code and a span, before a call reaches a function
in this package (`stdlib.md` section 2.4). The backstops below return absence
instead, because a wrong number drawn on a chart is worse than a gap.
"""

import math

# A value the machine holds, minus the reference: the interpreter owns the heap
# and the object that lives in it, so a type written here would be that type
# stated twice. What this package promises about one is narrower than the tag
# list: a function takes what its entry in `stdlib.md` says it takes.
Value = float | bool | str | None

# Absence, written `none` in a script.
ABSENT: None = None


def is_number(value: Value) -> bool:
    """Whether a value is a number, which a bool is not.

    ``isinstance(True, float)`` is false in this language and true in several
    others, but a bool is an integer here, so ``value == 1`` is true of ``True``
    and a numeric guard written that way would let a bool through into
    arithmetic. The tag is asked for instead.
    """
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def result(x: float) -> Value:
    """A computed number, made safe to return: finite, with one zero."""
    if not math.isfinite(x):
        return ABSENT
    return 0.0 if x == 0 else float(x)


def number(value: Value) -> float | None:
    """A numeric argument as a number, or absence for anything that is not one.

    The absence covers two cases that are one case here: the argument the script
    wrote was absent on this bar, and the argument was of another type, which is
    a program the checker should not have accepted. Both are absence rather than
    a raise, per the module's opening note.
    """
    return float(value) if is_number(value) else None


def whole(value: Value) -> int | None:
    """A count argument as a whole number of zero or more, or absence.

    A digit count and a width are counts, not measurements: `stdlib.md` section
    2.5 refuses a fractional one at compile time when it is a literal and at run
    time when it is not, with a fix naming ``round``, because a length of 14.5 is
    a bug in the script and rounding it on the script's behalf hides the bug.
    This is the backstop under those diagnostics and not a second rule.
    """
    x = number(value)
    if x is None or not math.isfinite(x) or x != int(x) or x < 0:
        return None
    return int(x)


def floor_of(x: float) -> float:
    """``floor`` over binary64, including the values it has no whole number for.

    The interpreter's own floor raises on an infinity rather than returning one,
    and an infinity is exactly what the argument is when a division inside
    ``mod`` or a scaling inside a rounding overflows. Returning it unchanged
    lets the arithmetic carry on and ``result`` turn the overflow into absence
    at the end, which is where `compiled-program.md` section 3.1 puts it.
    """
    return x if not math.isfinite(x) else float(math.floor(x))
