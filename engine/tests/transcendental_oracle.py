"""Independent decimal enclosures and rational binary64 rounding cells."""
from decimal import Decimal, localcontext
from fractions import Fraction
import math
import struct


def encode(value):
    return None if value is None else struct.pack('>d', value).hex()


def decode(value):
    return None if value is None else struct.unpack('>d', bytes.fromhex(value))[0]


def bounds(kind, value, precision):
    with localcontext() as context:
        context.prec = precision
        exact = Decimal.from_float(value)

        def enclose(result):
            # These elementary decimal operations are correctly rounded. One
            # decimal ulp is a conservative bound, independent of binary series.
            unit = Decimal(10) ** (result.adjusted() - precision + 1)
            return Fraction(result) - Fraction(unit), Fraction(result) + Fraction(unit)

        if kind == 'exp':
            return enclose(exact.exp())
        if kind == 'log':
            return enclose(exact.ln())
        if kind == 'log10':
            return enclose(exact.log10())
        numerator, denominator = enclose(exact.ln()), enclose(Decimal(2).ln())
        corners = [a / b for a in numerator for b in denominator]
        return min(corners), max(corners)


def certified(kind, value, actual, precision=100):
    if value is None or not math.isfinite(value) or kind != 'exp' and value <= 0:
        return actual is None
    if kind == 'exp' and value >= 1024:
        return actual is None
    if kind == 'exp' and value <= -1024:
        return encode(actual) == encode(0.0)
    if kind == 'exp' and value == 0 or kind != 'exp' and value == 1:
        return encode(actual) == encode(1.0 if kind == 'exp' else 0.0)
    low, high = bounds(kind, value, precision)
    overflow = Fraction(2**1024 - 2**970)
    if actual is None:
        return low >= overflow
    if not math.isfinite(actual) or encode(actual) == encode(-0.0):
        return False
    if actual == 0:
        return -Fraction(1, 2**1075) <= low <= high <= Fraction(1, 2**1075)
    previous, following = math.nextafter(actual, -math.inf), math.nextafter(actual, math.inf)
    lower = -overflow if previous == -math.inf else (Fraction(previous) + Fraction(actual)) / 2
    upper = overflow if following == math.inf else (Fraction(actual) + Fraction(following)) / 2
    return lower < low <= high < upper


def rounded(kind, value):
    """An expected binary64 answer accepted only with two certificates."""
    if value is None or not math.isfinite(value) or kind != 'exp' and value <= 0:
        return None
    if kind == 'exp' and value >= 1024:
        return None
    if kind == 'exp' and value <= -1024:
        return 0.0
    with localcontext() as context:
        context.prec = 110
        exact = Decimal.from_float(value)
        decimal = exact.exp() if kind == 'exp' else exact.ln() if kind == 'log' else exact.log10() if kind == 'log10' else exact.ln() / Decimal(2).ln()
        result = float(decimal)
    result = None if not math.isfinite(result) else 0.0 if result == 0 else result
    assert certified(kind, value, result, 100) and certified(kind, value, result, 170)
    return result
