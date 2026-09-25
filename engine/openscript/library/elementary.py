"""Elementary numeric functions with reproducible rounding.

Hypotenuse and exp/log use the exact integer recipes in sections 20.10.1 and
20.10.2; power and trigonometry use sections 20.10.3 and 20.10.4.
Square root uses its correctly rounded host operation.
"""

import math

from .hypotenuse import hypotenuse
from .transcendental import transcendental
from .power import power as real_power
from .trigonometric import trigonometric
from .values import ABSENT, Value, number, result

# The circle constant and the base of the natural logarithm, as `stdlib.md`
# section 8.2 names them. Both are the nearest binary64 to the constant and are
# the same bits on every platform.
PI: float = math.pi
E: float = math.e


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
    """``pow(x, y)``: portable real power, using section 20.10.3."""
    base = number(x)
    exponent = number(y)
    if base is None or exponent is None:
        return ABSENT
    return real_power(base, exponent)


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
    """``math.sin(x)``: sine of an angle in radians, using section 20.10.4."""
    value = number(x)
    return ABSENT if value is None else trigonometric('sin', value)


def cos(x: Value) -> Value:
    """``math.cos(x)``: cosine, using section 20.10.4."""
    value = number(x)
    return ABSENT if value is None else trigonometric('cos', value)


def tan(x: Value) -> Value:
    """``math.tan(x)``: tangent, using section 20.10.4."""
    value = number(x)
    return ABSENT if value is None else trigonometric('tan', value)


def asin(x: Value) -> Value:
    """``math.asin(x)``: inverse sine, absent outside -1 to 1."""
    value = number(x)
    if value is None or value < -1 or value > 1:
        return ABSENT
    return trigonometric('asin', value)


def acos(x: Value) -> Value:
    """``math.acos(x)``: inverse cosine, same range rule."""
    value = number(x)
    if value is None or value < -1 or value > 1:
        return ABSENT
    return trigonometric('acos', value)


def atan(x: Value) -> Value:
    """``math.atan(x)``: inverse tangent, using section 20.10.4."""
    value = number(x)
    return ABSENT if value is None else trigonometric('atan', value)


def atan2(y: Value, x: Value) -> Value:
    """``math.atan2(y, x)``: angle of a vector, in all four quadrants.

    The vertical component comes first, as section 20.10.4 specifies.
    """
    vertical = number(y)
    horizontal = number(x)
    if vertical is None or horizontal is None:
        return ABSENT
    return trigonometric('atan2', vertical, horizontal)
