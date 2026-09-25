"""Independent directed Decimal/Fraction certificates for binary64 real power.

No production helper or binary interval algorithm is imported. Decimal.ln and
Decimal.exp are correctly rounded at the requested decimal precision. One
decimal ulp on each side therefore encloses their real result. Fraction keeps
the signed exponent multiplication exact between those two operations.
"""
from decimal import Decimal, ROUND_CEILING, ROUND_FLOOR, localcontext
from fractions import Fraction
import math
import struct

OVERFLOW = Fraction(2) ** 1024 - Fraction(2) ** 970
HALF_SUBNORMAL = Fraction(2) ** -1075


def rounding_cell_contains(lo, hi, candidate):
    """Exact nearest-even cell inclusion, including overflow and zero ties."""
    if lo < 0 or hi is not None and hi < lo:
        return False
    if candidate is None:
        return lo >= OVERFLOW
    if not math.isfinite(candidate) or candidate < 0 or hi is None:
        return False
    if candidate == 0:
        return hi <= HALF_SUBNORMAL
    value = Fraction.from_float(candidate)
    before = Fraction.from_float(math.nextafter(candidate, 0))
    after = math.nextafter(candidate, math.inf)
    lower = (before + value) / 2
    upper = (value + Fraction.from_float(after)) / 2 if math.isfinite(after) else OVERFLOW
    even = int.from_bytes(struct.pack('>d', candidate), 'big') % 2 == 0
    return (lo >= lower and hi <= upper) if even else (lo > lower and hi < upper)


def round_fraction(value):
    """Use conversion only to suggest a candidate; exact cell arithmetic proves it."""
    if value < 0:
        raise ValueError('Positive magnitude required')
    try:
        candidate = float(value)
    except OverflowError:
        candidate = None
    if candidate == 0:
        candidate = 0.0
    if not rounding_cell_contains(value, value, candidate):
        raise AssertionError('Fraction conversion did not satisfy nearest-even cell')
    return candidate


def integer_root(value, degree):
    """An exact integer root by binary search, without a floating root estimate."""
    if value == 1 or degree == 1:
        return value
    if degree >= value.bit_length():
        return None
    lower, upper = 1, 1 << ((value.bit_length() + degree - 1) // degree)
    while lower <= upper:
        middle = (lower + upper) // 2
        trial = middle ** degree
        if trial == value:
            return middle
        if trial < value:
            lower = middle + 1
        else:
            upper = middle - 1
    return None


def rational_power(x, y):
    """Exact rational route covering all dyadic rounding midpoints.

For reduced y=n/d, rationality requires exact d-th roots of the numerator and
denominator of x. A remaining odd factor raised to more than 64 cannot fit the
at-most-54-bit odd significand of a binary64 midpoint. Negative powers with an
odd denominator factor are not dyadic. Larger non-ties use Decimal refinement.
"""
    base, exponent = Fraction.from_float(x), Fraction.from_float(y)
    a = integer_root(base.numerator, exponent.denominator)
    b = integer_root(base.denominator, exponent.denominator)
    if a is None or b is None:
        return False, None
    n = exponent.numerator
    if a & (a - 1) == 0 and b & (b - 1) == 0:
        e = (a.bit_length() - b.bit_length()) * n
        if e > 1024:
            return True, None
        if e < -1075:
            return True, 0.0
        return True, round_fraction(Fraction(2) ** e)
    if abs(n) <= 64:
        return True, round_fraction(Fraction(a, b) ** n)
    return False, None


def decimal_ulp(value, precision):
    return Fraction(Decimal((0, (1,), value.adjusted() - precision + 1)))


def decimal_bounds(x, y, precision):
    """Enclose positive x**y; a None upper bound denotes positive infinity."""
    if not isinstance(precision, int) or isinstance(precision, bool) or precision < 2:
        raise ValueError('Decimal precision must be an integer of at least two')
    with localcontext() as ctx:
        ctx.prec, ctx.Emin, ctx.Emax = precision, -999999, 999999
        logarithm = Decimal.from_float(x).ln()
        ulp = decimal_ulp(logarithm, precision)
        low, high = Fraction(logarithm) - ulp, Fraction(logarithm) + ulp
        exponent = Fraction.from_float(y)
        low, high = sorted((low * exponent, high * exponent))
        # These conservative analytic bounds precede Decimal.exp, so even a
        # finite binary64 exponent near the largest magnitude is inexpensive.
        if low >= 1024:
            return OVERFLOW, None
        if high <= -1024:
            return Fraction(0), HALF_SUBNORMAL
        if low <= -1024:
            lower = Fraction(0)
        else:
            ctx.rounding = ROUND_FLOOR
            endpoint = Decimal(low.numerator) / Decimal(low.denominator)
            value = endpoint.exp()
            lower = max(Fraction(0), Fraction(value) - decimal_ulp(value, precision))
        if high >= 1024:
            upper = None
        else:
            ctx.rounding = ROUND_CEILING
            endpoint = Decimal(high.numerator) / Decimal(high.denominator)
            value = endpoint.exp()
            upper = Fraction(value) + decimal_ulp(value, precision)
        return lower, upper


def oracle(x, y, precision):
    """Return a certified float/None, or 'refine' when bounds cannot decide."""
    if x is None or y is None or not math.isfinite(x) or not math.isfinite(y):
        return None
    x, y = float(x), float(y)
    if y == 0 or x == 1:
        return 1.0
    if x == 0:
        return 0.0 if y > 0 else None
    if x < 0 and not y.is_integer():
        return None
    sign = -1 if x < 0 and y % 2 else 1
    magnitude = abs(x)
    if magnitude == 1:
        return float(sign)
    exact, candidate = rational_power(magnitude, y)
    if not exact:
        low, high = decimal_bounds(magnitude, y, precision)
        candidate = None if high is None else round_fraction((low + high) / 2)
        if not rounding_cell_contains(low, high, candidate):
            return 'refine'
    return None if candidate is None else candidate * sign if candidate else 0.0


def certify(x, y, start_precision=80):
    """Increase precision until proof, with no numerical tolerance or cutoff."""
    precision = start_precision
    while True:
        result = oracle(x, y, precision)
        if result != 'refine':
            return result, precision
        precision += 80
