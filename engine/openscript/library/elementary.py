"""Elementary numeric functions and their remaining arithmetic gaps.

Hypotenuse and exp/log use the exact integer recipes in sections 20.10.1 and
20.10.2. Square root uses its correctly rounded host operation. Power and
trigonometry still use host approximations under gap 1.
"""

import math

from .hypotenuse import hypotenuse
from .transcendental import transcendental
from .values import ABSENT, Value, number, result

# The circle constant and the base of the natural logarithm, as `stdlib.md`
# section 8.2 names them. Both are the nearest binary64 to the constant and are
# the same bits on every platform, so neither reaches the gap above.
PI: float = math.pi
E: float = math.e


def _guarded(x: float, of) -> Value:
    """A host maths call whose refusals become absence.

    The host raises where the argument is outside the function's domain and
    where the answer overflows. `stdlib.md` section 2.4 makes both of those
    absence: a function whose result has no finite real value returns ``none``
    rather than raising, and it is a function whose *arguments* are wrong that
    raises, which is a diagnostic the checker or the interpreter produces long
    before the call gets here.
    """
    try:
        return result(of(x))
    except (ValueError, OverflowError, ZeroDivisionError):
        return ABSENT


def sqrt(x: Value) -> Value:
    """``sqrt(x)``: square root, absent below zero."""
    value = number(x)
    if value is None or value < 0:
        return ABSENT
    return result(math.sqrt(value))


def exp(x: Value) -> Value:
    """``exp(x)``: e to the power x, using section 20.10.2."""
    value = number(x)
    return ABSENT if value is None else transcendental('exp', value)


def log(x: Value) -> Value:
    """``log(x)``: portable natural logarithm, absent at or below zero."""
    value = number(x)
    if value is None or value <= 0:
        return ABSENT
    return transcendental('log', value)


def log10(x: Value) -> Value:
    """``log10(x)``: portable base ten logarithm, same absence rule."""
    value = number(x)
    if value is None or value <= 0:
        return ABSENT
    return transcendental('log10', value)


def log2(x: Value) -> Value:
    """``math.log2(x)``: portable base two logarithm, same absence rule."""
    value = number(x)
    if value is None or value <= 0:
        return ABSENT
    return transcendental('log2', value)


def power(x: Value, y: Value) -> Value:
    """``pow(x, y)``: absent where the result is not a finite real.

    Reaches gap 1. A negative base raised to a fractional exponent has no real
    answer and a zero base raised to a negative one has no finite answer, and
    both are absence here rather than the refusal the host makes of them.
    """
    base = number(x)
    exponent = number(y)
    if base is None or exponent is None:
        return ABSENT
    try:
        return result(math.pow(base, exponent))
    except (ValueError, OverflowError, ZeroDivisionError):
        return ABSENT


def hypot(x: Value, y: Value) -> Value:
    """``math.hypot(x, y)``: the correctly rounded exact diagonal, section 20.10.1."""
    left = number(x)
    right = number(y)
    if left is None or right is None:
        return ABSENT
    return hypotenuse(left, right)


def to_degrees(x: Value) -> Value:
    """``math.toDegrees(x)``: ``(x * 180) / pi``, multiply first.

    Not a gap: it is two operations over binary64 and `stdlib.md` section 20.7
    fixes their order. Folding the constant into one factor is a different number
    at about a quarter of the arguments, so the association is written out rather
    than handed to a conversion the host provides.
    """
    value = number(x)
    return ABSENT if value is None else result((value * 180) / math.pi)


def to_radians(x: Value) -> Value:
    """``math.toRadians(x)``: ``(x * pi) / 180``, multiply first. Not a gap."""
    value = number(x)
    return ABSENT if value is None else result((value * math.pi) / 180)


def sin(x: Value) -> Value:
    """``math.sin(x)``: sine of an angle in radians. Reaches gap 1."""
    value = number(x)
    return ABSENT if value is None else _guarded(value, math.sin)


def cos(x: Value) -> Value:
    """``math.cos(x)``: cosine. Reaches gap 1."""
    value = number(x)
    return ABSENT if value is None else _guarded(value, math.cos)


def tan(x: Value) -> Value:
    """``math.tan(x)``: tangent. Reaches gap 1."""
    value = number(x)
    return ABSENT if value is None else _guarded(value, math.tan)


def asin(x: Value) -> Value:
    """``math.asin(x)``: inverse sine, absent outside -1 to 1. Reaches gap 1."""
    value = number(x)
    if value is None or value < -1 or value > 1:
        return ABSENT
    return _guarded(value, math.asin)


def acos(x: Value) -> Value:
    """``math.acos(x)``: inverse cosine, same range rule. Reaches gap 1."""
    value = number(x)
    if value is None or value < -1 or value > 1:
        return ABSENT
    return _guarded(value, math.acos)


def atan(x: Value) -> Value:
    """``math.atan(x)``: inverse tangent. Reaches gap 1."""
    value = number(x)
    return ABSENT if value is None else _guarded(value, math.atan)


def atan2(y: Value, x: Value) -> Value:
    """``math.atan2(y, x)``: angle of a vector, in all four quadrants.

    Reaches gap 1. The argument order is the page's, which is the one every
    library states: the vertical component first.
    """
    vertical = number(y)
    horizontal = number(x)
    if vertical is None or horizontal is None:
        return ABSENT
    try:
        return result(math.atan2(vertical, horizontal))
    except (ValueError, OverflowError):
        return ABSENT
