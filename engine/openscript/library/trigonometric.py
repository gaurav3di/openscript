"""Directed integer enclosures for the real-result recipe in section 20.10.4."""
import math

from .transcendental import parts, round_dyadic, up

_PI = (0, (0, 0))


def _negative(a):
    return -a[1], -a[0]


def _add(a, b):
    return a[0]+b[0], a[1]+b[1]


def _subtract(a, b):
    return a[0]-b[1], a[1]-b[0]


def _ratio(x):
    mantissa, exponent = parts(x)
    return (mantissa << exponent, 1) if exponent >= 0 else (mantissa, 1 << -exponent)


def _coarsen(a, shift):
    divisor = 1 << shift
    return a[0]//divisor, up(a[1], divisor)


def _quotient(a, b, precision):
    if b[0] <= 0 <= b[1]:
        return None
    scale = 1 << precision
    low, high = [], []
    for numerator in a:
        for denominator in b:
            n = -numerator if denominator < 0 else numerator
            d = abs(denominator)
            low.append(n*scale//d)
            high.append(up(n*scale, d))
    return min(low), max(high)


def _small_atan(n, d, precision):
    """Alternating odd powers with an outward first-omitted-term remainder."""
    if n == 0:
        return 0, 0
    if n < 0:
        return _negative(_small_atan(-n, d, precision))
    scale = 1 << precision
    zl, zh = n*scale//d, up(n*scale, d)
    squared_low, squared_high = zl*zl//scale, up(zh*zh, scale)
    power_low, power_high, low, high, odd, positive = zl, zh, 0, 0, 1, True
    while True:
        lower, upper = power_low//odd, up(power_high, odd)
        if positive:
            low, high = low+lower, high+upper
        else:
            low, high = low-upper, high-lower
        power_low = power_low*squared_low//scale
        power_high = up(power_high*squared_high, scale)
        odd += 2
        positive = not positive
        if power_high <= 1:
            tail = up(power_high, odd)
            return (low, high+tail) if positive else (low-tail, high)


def _pi(precision):
    global _PI
    if _PI[0] >= precision:
        return _coarsen(_PI[1], _PI[0]-precision)
    a, b = _small_atan(1, 5, precision), _small_atan(1, 239, precision)
    value = 16*a[0]-4*b[1], 16*a[1]-4*b[0]
    _PI = precision, value
    return value


def _positive_atan(n, d, precision):
    if n == 0:
        return 0, 0
    if d == 0:
        return _coarsen(_pi(precision), 1)
    if n > d:
        return _subtract(_coarsen(_pi(precision), 1), _positive_atan(d, n, precision))
    if 2*n > d:
        return _add(_coarsen(_pi(precision), 2), _small_atan(n-d, n+d, precision))
    return _small_atan(n, d, precision)


def _point_series(z, precision, cosine):
    if z < 0:
        out = _point_series(-z, precision, cosine)
        return out if cosine else _negative(out)
    scale = 1 << precision
    if z == 0:
        return (scale, scale) if cosine else (0, 0)
    squared_low, squared_high = z*z//scale, up(z*z, scale)
    low = high = term_low = term_high = scale if cosine else z
    degree, positive = (0 if cosine else 1), False
    while True:
        divisor = scale*(degree+1)*(degree+2)
        term_low = term_low*squared_low//divisor
        term_high = up(term_high*squared_high, divisor)
        degree += 2
        if term_high <= 1:
            return (low, high+term_high) if positive else (low-term_high, high)
        if positive:
            low, high = low+term_low, high+term_high
        else:
            low, high = low-term_high, high-term_low
        positive = not positive


def _reduced_sin_cos(x, precision):
    n, d = _ratio(x)
    reduction_precision = precision+max(0, n.bit_length()-d.bit_length())+32
    scale = 1 << reduction_precision
    pl, ph = _pi(reduction_precision)
    ql = (4*n*scale+d*ph)//(2*d*ph)
    qh = (4*n*scale+d*pl)//(2*d*pl)
    if ql != qh:
        return None
    residual = n*scale//d-up(ql*ph, 2), up(n*scale, d)-ql*pl//2
    lower, upper = _coarsen(residual, reduction_precision-precision)
    unit = 1 << precision
    if lower < -unit or upper > unit:
        return None
    sine = _point_series(lower, precision, False)[0], _point_series(upper, precision, False)[1]
    near = 0 if lower <= 0 <= upper else min(abs(lower), abs(upper))
    far = max(abs(lower), abs(upper))
    cosine = _point_series(far, precision, True)[0], _point_series(near, precision, True)[1]
    quadrant = ql % 4
    if quadrant == 1:
        sine, cosine = cosine, _negative(sine)
    elif quadrant == 2:
        sine, cosine = _negative(sine), _negative(cosine)
    elif quadrant == 3:
        sine, cosine = _negative(cosine), sine
    return (_negative(sine) if x < 0 else sine), cosine


def _inverse(kind, x, y, precision):
    if kind == 'atan':
        n, d = _ratio(x)
        out = _positive_atan(n, d, precision)
        return _negative(out) if x < 0 else out
    if kind == 'atan2':
        if x == 0:
            out = _coarsen(_pi(precision), 1)
            return out if y > 0 else _negative(out)
        yn, yd = _ratio(y)
        xn, xd = _ratio(x)
        out = _positive_atan(yn*xd, xn*yd, precision)
        if x < 0:
            out = _subtract(_pi(precision), out)
        return _negative(out) if y < 0 else out
    n, d = _ratio(x)
    scale = 1 << precision
    radicand = (d*d-n*n)*scale*scale
    root = math.isqrt(radicand//(d*d))
    upper = root+(root*root*d*d != radicand)
    if kind == 'asin':
        out = _positive_atan(n*scale, d*upper, precision)[0], _positive_atan(n*scale, d*root, precision)[1]
        return _negative(out) if x < 0 else out
    out = _positive_atan(root*d, n*scale, precision)[0], _positive_atan(upper*d, n*scale, precision)[1]
    return _subtract(_pi(precision), out) if x < 0 else out


def trigonometric(kind, first, second=None, start=160):
    """Preserve ordinary argument order, including atan2(y,x)."""
    if first is None or not math.isfinite(first):
        return None
    if kind == 'atan2' and (second is None or not math.isfinite(second)):
        return None
    x, y = (second, first) if kind == 'atan2' else (first, 0.0)
    if kind in ('asin', 'acos') and abs(x) > 1:
        return None
    if kind == 'atan2' and y == 0 and x >= 0:
        return 0.0
    if x == 0 and kind != 'atan2':
        if kind == 'cos':
            return 1.0
        if kind != 'acos':
            return 0.0
    if kind == 'acos' and x == 1:
        return 0.0
    precision = max(64, start)
    while True:
        if kind in ('sin', 'cos', 'tan'):
            both = _reduced_sin_cos(x, precision)
            interval = None if both is None else both[0] if kind == 'sin' else both[1] if kind == 'cos' else _quotient(*both, precision)
        else:
            interval = _inverse(kind, x, y, precision)
        if interval is not None:
            left, right = round_dyadic(interval[0], -precision), round_dyadic(interval[1], -precision)
            if left == right:
                return left
        precision += 80
