"""Exact real power rounded once, following section 20.10.3."""
import math
from .transcendental import exp_endpoint, log_interval, parts, round_dyadic, up


def odd_parts(value):
    integer, exponent = parts(value)
    shift = (integer & -integer).bit_length() - 1
    return integer >> shift, exponent + shift


def rational_result(base, exponent):
    """The flag distinguishes unresolved values from determined overflow."""
    odd, scale = odd_parts(base)
    numerator, shift = odd_parts(exponent)
    if shift >= 0:
        numerator <<= shift
    else:
        for _ in range(-shift):
            if scale % 2:
                return False, None
            root = math.isqrt(odd)
            if root * root != odd:
                return False, None
            odd, scale = root, scale // 2
    if odd == 1:
        power = scale * numerator * (-1 if exponent < 0 else 1)
        if power > 1023:
            return True, None
        if power < -1075:
            return True, 0.0
        return True, round_dyadic(1, power)
    # These exact odd powers include every possible dyadic rounding midpoint.
    if exponent > 0 and numerator <= 53:
        return True, round_dyadic(odd ** numerator, scale * numerator)
    return False, None


def power(base, exponent, start_precision=160):
    """A lower starting precision exposes interval refinement to tests."""
    if not math.isfinite(base) or not math.isfinite(exponent):
        return None
    if exponent == 0:
        return 1.0
    if base == 0:
        return 0.0 if exponent > 0 else None
    if base < 0 and not exponent.is_integer():
        return None
    sign = -1 if base < 0 and exponent % 2 else 1
    magnitude = abs(base)
    if magnitude == 1:
        return float(sign)

    def signed(value):
        return None if value is None else 0.0 if value == 0 else sign * value

    exact, value = rational_result(magnitude, exponent)
    if exact:
        return signed(value)
    multiplier, shift = parts(exponent)
    precision = max(64, start_precision)
    while True:
        low, high = log_interval(magnitude, precision)
        low, high = low * multiplier, high * multiplier
        if shift >= 0:
            low, high = low << shift, high << shift
        else:
            divisor = 1 << -shift
            low, high = low // divisor, up(high, divisor)
        if exponent < 0:
            low, high = -high, -low
        below, above = exp_endpoint(low, precision), exp_endpoint(high, precision)
        if below is None or above is None:
            precision += 80
            continue
        left, right = below[0], above[1]
        if left == right:
            return signed(left)
        precision += 80
