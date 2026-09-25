"""The bare arithmetic of `stdlib.md` section 8.1.

None of these has a warmup: each reads this bar's values only, so it produces a
value on bar 0 whenever its arguments do. Every one is absent when any argument
is absent, and every numeric result goes through ``result``, so a value with no
finite real answer is absence rather than an infinity.

`stdlib.md` section 20.10 names most of this file as arithmetic with no
accumulation order to fix: ``abs`` and ``sign`` are one operation each, and
``min``, ``max`` and ``clamp`` select a value and compute nothing. ``mod`` is the
exception and its order is written out in section 8.1 and confirmed in 20.7: the
division, then the floor, then the multiplication, then the subtraction.
"""

from .values import ABSENT, Value, floor_of, is_number, number, result


def abs_of(x: Value) -> Value:
    """``abs(x)``: magnitude without sign."""
    value = number(x)
    return ABSENT if value is None else result(abs(value))


def sign(x: Value) -> Value:
    """``sign(x)``: -1, 0 or 1.

    Three comparisons rather than a division: the sign of a zero is not
    observable in this language (`compiled-program.md` section 3.1), so a zero
    of either sign answers 0 here.
    """
    value = number(x)
    if value is None:
        return ABSENT
    if value > 0:
        return 1.0
    if value < 0:
        return -1.0
    return 0.0


def minimum(a: Value, b: Value) -> Value:
    """``min(a, b)``: the smaller of two."""
    left = number(a)
    right = number(b)
    if left is None or right is None:
        return ABSENT
    return result(left if left < right else right)


def maximum(a: Value, b: Value) -> Value:
    """``max(a, b)``: the larger of two."""
    left = number(a)
    right = number(b)
    if left is None or right is None:
        return ABSENT
    return result(left if left > right else right)


def clamp(x: Value, low: Value, high: Value) -> Value:
    """``clamp(x, lo, hi)``: ``x`` held inside a range.

    Written as two comparisons in this order rather than as ``min(max(...))``,
    because the two disagree when the bounds are crossed and this one answers
    with the lower bound there, which is what a reader of the name expects.
    """
    value = number(x)
    lower = number(low)
    upper = number(high)
    if value is None or lower is None or upper is None:
        return ABSENT
    if value < lower:
        return result(lower)
    if value > upper:
        return result(upper)
    return result(value)


def mod(a: Value, b: Value) -> Value:
    """``mod(a, b)``: ``a - b * floor(a / b)``, the floored remainder.

    Its sign follows ``b``. The formula is written out rather than handed to the
    interpreter's own remainder because "the modulo" names two different
    functions in common use: this is the floored one and ``%`` is the truncated
    one, so ``mod(-7, 3)`` is 2 where ``-7 % 3`` is -1 in this language. The two
    agree for every positive ``b``, which is every use that wraps an index, a bar
    count or a session offset.

    **The host language's own floored remainder is not this function either.**
    It agrees at every argument a script is likely to write and parts from it
    where the division overflows, because it is exact rather than a division
    followed by a floor: at ``mod(0.1, 1e-310)`` the quotient is an infinity and
    this function is absent there, where the host's remainder answers
    3.135287412051e-311.

    ``mod(a, 0)`` is absent, on the rule of `stdlib.md` section 2.4 that a result
    with no finite real value is absent.
    """
    left = number(a)
    right = number(b)
    if left is None or right is None or right == 0:
        return ABSENT
    return result(left - right * floor_of(left / right))


def is_none(x: Value) -> bool:
    """``isNone(x)``: true when the value is absent."""
    return x is None


def or_else(x: Value, fallback: Value) -> Value:
    """``orElse(x, fallback)``: ``x`` when present, ``fallback`` when absent.

    Absence and every nonnumeric tag keep their identity; numeric zero follows
    the same positive-zero rule as other library results.
    """
    value = fallback if x is None else x
    return 0.0 if is_number(value) and value == 0 else value


def to_bool(x: Value) -> bool:
    """``toBool(x)``: absence to false, a bool to itself.

    A number is a type error the checker refuses, so an engine that reaches one
    is looking at a program its verifier should not have accepted, and false is
    the safe reading. Identity against ``True`` rather than truthiness, because
    every non-zero number is truthy in this interpreter and one reaching here
    would come back as a bool the language never made.
    """
    return x is True
