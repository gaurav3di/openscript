"""Square root, the logarithms, the powers and the trigonometry.

**The transcendental functions reach gap 1 of `stdlib.md` section 20.11,
and are not held to the vectors.** That section states the gap and
`compiled-program.md` section 8.3 states the requirement it cannot meet: a
transcendental function is to be computed by a portable reference algorithm
rather than by the platform's own maths library, because a platform's is correct
to within about an ulp and differs between platforms in the last bit. **No such
algorithm is written down anywhere**, so there is nothing to implement against,
and inventing one here would be a third answer rather than a second engine.

So these call the host's maths module and say so. `conformance.md` section 8
scopes the difference out: no case may assert a value that reaches this row, not
even with a tolerance, because an engine that is correct can fail such a case and
the release gate would then stop a release over a hole in the specification. The
calls still work and still compute what they always did; what they do not carry
is a cross-engine guarantee.

Measured against `spec/vectors/library/`, which is the first engine's arithmetic,
this file's answers differ on a minority of cells and never by more than one ulp.
``exp``, ``log``, ``log10``, ``pow``, ``sin``, ``cos``, ``tan`` and
``atan2`` each have some; ``log2``, ``asin``, ``acos`` and ``atan`` had none on
the interpreter this was written under, which is a fact about two maths libraries
on one machine and not a guarantee about a third.

**``sqrt`` is held to the vectors.** IEEE-754 requires it to
be correctly rounded, so every conforming platform returns the same bits, and
section 20.10 says so rather than leaving it to be assumed.
``hypot`` now uses the exact integer algorithm of section 20.10.1 and is held
to exact vectors as well, without calling the host's approximation.

The domain rules are `stdlib.md` section 8.1's, and are checked before the call
rather than read off the answer: the host raises where this language is absent,
and an engine that let the raise out would turn "no finite real value" into a
stopped run.
"""

import math

from .hypotenuse import hypotenuse
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
    """``exp(x)``: e to the power x. Reaches gap 1."""
    value = number(x)
    return ABSENT if value is None else _guarded(value, math.exp)


def log(x: Value) -> Value:
    """``log(x)``: natural logarithm, absent at or below zero. Reaches gap 1."""
    value = number(x)
    if value is None or value <= 0:
        return ABSENT
    return _guarded(value, math.log)


def log10(x: Value) -> Value:
    """``log10(x)``: base ten logarithm, same absence rule. Reaches gap 1."""
    value = number(x)
    if value is None or value <= 0:
        return ABSENT
    return _guarded(value, math.log10)


def log2(x: Value) -> Value:
    """``math.log2(x)``: base two logarithm, same absence rule. Reaches gap 1."""
    value = number(x)
    if value is None or value <= 0:
        return ABSENT
    return _guarded(value, math.log2)


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
