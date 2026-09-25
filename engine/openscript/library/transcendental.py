"""Integer interval arithmetic for the elementary recipe in section 20.10.2."""
import math
import struct

DEFAULT_CONSTANTS = {}
MASK = (1 << 52) - 1

def up(n, d):
    return -((-n) // d)

def parts(x):
    b = int.from_bytes(struct.pack('>d', abs(x)), 'big')
    e = b >> 52
    return (b if e == 0 else (b & MASK) | (1 << 52), -1074 if e == 0 else e - 1075)

def fixed(x, p):
    m, e = parts(x)
    shift = e + p
    return (m << shift, m << shift) if shift >= 0 else (m >> -shift, up(m, 1 << -shift))

def round_dyadic(n, e):
    if not n:
        return 0.0
    negative = n < 0
    n = abs(n)
    q = max(-1074, n.bit_length() - 1 + e - 52)
    shift = q - e
    if shift <= 0:
        m = n << -shift
    else:
        d = 1 << shift
        m, r = divmod(n, d)
        if r * 2 > d or (r * 2 == d and m & 1):
            m += 1
    if not m:
        return 0.0
    if m >= 1 << 53:
        m >>= 1
        q += 1
    if q > 971:
        return None
    b = m if m < 1 << 52 else ((q + 1075) << 52) | (m & MASK)
    if negative:
        b |= 1 << 63
    return struct.unpack('>d', b.to_bytes(8, 'big'))[0]

def atanh(a, b, p):
    if not a:
        return 0, 0
    s = 1 << p
    zl, zh = a*s//b, up(a*s, b)
    sl, sh = zl*zl//s, up(zh*zh, s)
    pl, ph, lo, hi, odd = zl, zh, 0, 0, 1
    while True:
        lo += pl // odd
        hi += up(ph, odd)
        pl, ph, odd = pl*sl//s, up(ph*sh, s), odd+2
        if ph <= 2:
            return 2*lo, 2*(hi+up(9*ph, 8*odd))

def ln2(p):
    if p != 160:
        return atanh(1, 3, p)
    if 'two' not in DEFAULT_CONSTANTS:
        DEFAULT_CONSTANTS['two'] = atanh(1, 3, p)
    return DEFAULT_CONSTANTS['two']

def log_interval(x, p):
    m, e = parts(x)
    d, k = 1 << (m.bit_length()-1), e+m.bit_length()-1
    lo, hi = atanh(m-d, m+d, p)
    cl, ch = ln2(p)
    return (lo+k*cl, hi+k*ch) if k >= 0 else (lo+k*ch, hi+k*cl)

def ln10(p):
    if p != 160:
        return log_interval(10,p)
    if 'ten' not in DEFAULT_CONSTANTS:
        DEFAULT_CONSTANTS['ten'] = log_interval(10,p)
    return DEFAULT_CONSTANTS['ten']

def quotient(n, d, p):
    pairs = [(a*(1 << p), b) for a in n for b in d]
    return min(a//b for a,b in pairs), max(up(a,b) for a,b in pairs)

def exp_range(xl, xh, positive, p):
    s = 1 << p
    cl, ch = ln2(p)
    k = xl // ch
    rl, rh = xl-k*ch, xh-k*cl
    if rl < 0 or rh >= s:
        return None
    tl = th = lo = hi = s
    n = 0
    while True:
        n += 1
        tl, th = tl*rl//(s*n), up(th*rh,s*n)
        if th <= 1:
            hi += 2*th
            break
        lo += tl
        hi += th
    return (lo,hi,k-p) if positive else (s*s//hi,up(s*s,lo),-k-p)

def exp_interval(x, p):
    xl, xh = fixed(x, p)
    return exp_range(xl, xh, x >= 0, p)

def exp_endpoint(integer, p):
    """Enclose exp(integer / 2**p), with no binary64 intermediate."""
    cutoff = 1024 << p
    if integer >= cutoff:
        return None, None
    if integer <= -cutoff:
        return 0.0, 0.0
    if integer == 0:
        return 1.0, 1.0
    magnitude = abs(integer)
    interval = exp_range(magnitude, magnitude, integer > 0, p)
    if interval is None:
        return None
    lo, hi, exponent = interval
    return round_dyadic(lo, exponent), round_dyadic(hi, exponent)

def transcendental(kind, x, start_precision=160):
    if x is None or not math.isfinite(x) or (kind != 'exp' and x <= 0):
        return None
    if kind == 'exp':
        if x >= 1024:
            return None
        if x <= -1024:
            return 0.0
        if abs(x) < 2**-60:
            return 1.0
    else:
        if x == 1:
            return 0.0
        if kind == 'log2':
            m,e = parts(x)
            if not m & (m-1):
                return float(e+m.bit_length()-1)
        if kind == 'log10':
            m,e = parts(x)
            integer = m << e if e >= 0 else m >> -e if m % (1 << -e) == 0 else 0
            count = 0
            while integer > 1 and integer % 10 == 0:
                integer //= 10
                count += 1
            if integer == 1:
                return float(count)
    p = max(64, start_precision)
    while True:
        if kind == 'exp':
            interval = exp_interval(x,p)
            if interval is None:
                p += 80
                continue
            lo,hi,e = interval
        else:
            raw = log_interval(x,p)
            lo,hi = raw if kind == 'log' else quotient(raw,ln2(p) if kind == 'log2' else ln10(p),p)
            e = -p
        left,right = round_dyadic(lo,e),round_dyadic(hi,e)
        if left == right:
            return left
        p += 80
