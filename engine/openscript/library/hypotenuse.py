"""Exact two-argument hypotenuse, `stdlib.md` section 20.10.1."""
import math
import struct

_LEADING = 1 << 52
_FRACTION = _LEADING - 1


def _parts(value: float) -> tuple[int, int]:
    encoded = struct.unpack('>Q', struct.pack('>d', abs(value)))[0]
    exponent = encoded >> 52
    significand = (encoded & _FRACTION) | (_LEADING if exponent else 0)
    return significand, exponent - 1075 if exponent else -1074


def _decode(encoded: int) -> float:
    return struct.unpack('>d', struct.pack('>Q', encoded))[0]


def _integer_sqrt(value: int) -> int:
    """Monotone Newton steps from a power-of-two upper bound reach the floor."""
    if value < 2:
        return value
    before = 1 << ((value.bit_length() + 1) // 2)
    while True:
        following = (before + value // before) // 2
        if following >= before:
            return before
        before = following


def hypotenuse(x: float, y: float) -> float | None:
    """Round the exact squared sum by comparing with a squared midpoint.

    Binary64 input widths bound every temporary integer to fewer than 4,200 bits.
    Encoding only after that decision avoids a second rounding through a scale.
    """
    if not math.isfinite(x) or not math.isfinite(y):
        return None
    if x == 0:
        return abs(y)
    if y == 0:
        return abs(x)
    a, ea = _parts(x)
    b, eb = _parts(y)
    exponent = min(ea, eb)
    square = (a * a << (2 * (ea - exponent))) + (b * b << (2 * (eb - exponent)))
    spacing = max(-1074, exponent + (square.bit_length() - 1) // 2 - 52)
    shift = exponent - spacing
    numerator = square if shift < 0 else square << (2 * shift)
    denominator = 1 << (-2 * shift) if shift < 0 else 1
    significand = _integer_sqrt(numerator // denominator)
    midpoint = 2 * significand + 1
    comparison = 4 * numerator - denominator * midpoint * midpoint
    if comparison > 0 or comparison == 0 and significand % 2:
        significand += 1
    if significand >= 2 * _LEADING:
        significand >>= 1
        spacing += 1
    if significand < _LEADING:
        return _decode(significand)
    encoded_exponent = spacing + 1075
    if encoded_exponent >= 2047:
        return None
    return _decode(encoded_exponent << 52 | (significand - _LEADING))
