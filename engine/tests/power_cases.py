"""Exact rational and algebraic witnesses for permanent power regression cases."""
from fractions import Fraction
import math
import random
import struct
from .power_oracle import HALF_SUBNORMAL, OVERFLOW, round_fraction


def exact_rational_cases():
    for odd in range(3,256,2):
        for exponent in [-537,-215,-43,-2,0,200,500]:
            x = math.ldexp(float(odd),exponent)
            for n in [1,2,3,5,7,13,25,34,53,-1,-2,-3,-5,-25,54,-54]:
                yield x,float(n),Fraction.from_float(x)**n
    for degree_power in [1,2,3]:
        degree = 2**degree_power
        for root in [3,5,11]:
            for exponent in [-80,0,40]:
                x = math.ldexp(float(root**degree),exponent*degree)
                for n in [1,3,5,7,25,53,-1,-3,-25]:
                    yield x,n/degree,(Fraction(root)*Fraction(2)**exponent)**n


def algebraic_cases():
    bases = [float.fromhex('0x1p-1074'),1e-308,math.nextafter(1,0),math.nextafter(1,math.inf),
             2.0,3.0,1e308,float.fromhex('0x1.fffffffffffffp1023')]
    for x in bases:
        for degree_power in [1,2,3,4,5]:
            degree = 2**degree_power
            for n in [1,3,5,7,13,53,-1,-3,-53]:
                yield x,n/degree,Fraction.from_float(x)**n,degree


def midpoint(value, candidate):
    if candidate is None:
        return value == OVERFLOW
    if candidate == 0:
        return value == HALF_SUBNORMAL
    current = Fraction.from_float(candidate)
    neighbors = [math.nextafter(candidate,0),math.nextafter(candidate,math.inf)]
    return any(math.isfinite(other) and value == (current+Fraction.from_float(other))/2 for other in neighbors)


def certify_algebraic(target, degree, candidate):
    """Check exact cell inequalities after raising positive endpoints to degree."""
    if candidate is None:
        return target >= OVERFLOW**degree
    if candidate == 0:
        return target <= HALF_SUBNORMAL**degree
    if candidate < 0 or not math.isfinite(candidate):
        return False
    current = Fraction.from_float(candidate)
    lower = (current+Fraction.from_float(math.nextafter(candidate,0)))/2
    next_value = math.nextafter(candidate,math.inf)
    upper = (current+Fraction.from_float(next_value))/2 if math.isfinite(next_value) else OVERFLOW
    low,high = lower**degree,upper**degree
    even = int.from_bytes(struct.pack('>d',candidate),'big')%2 == 0
    return low <= target <= high if even else low < target < high


def rational_expected():
    for x,y,value in exact_rational_cases():
        expected = round_fraction(value)
        yield x,y,expected,midpoint(value,expected)


def general_cases():
    """Domain edges, nearby powers of one, huge products, and varied mantissas."""
    tiny = float.fromhex('0x1p-1074')
    bases = [None,math.nan,math.inf,-math.inf,-0.0,0.0,tiny,-tiny,2.0**-1022,
             0.5,-0.5,1.0,-1.0,math.nextafter(1,0),math.nextafter(1,math.inf),
             2.0,-2.0,3.0,-3.0,81.0,625.0,1e-100,1e100,1e308,
             float.fromhex('0x1.fffffffffffffp1023')]
    exponents = [None,math.nan,math.inf,-math.inf,0.0,-0.0,tiny,-tiny,1e-100,-1e-100,
                 0.25,-0.25,0.5,-0.5,0.75,1.0,-1.0,1.5,-1.5,2.0,-2.0,3.0,-3.0,
                 53.0,54.0,1023.0,1024.0,-1074.0,-1075.0,-1076.0,1e100,-1e100,1e308,-1e308]
    for x in bases:
        for y in exponents:
            yield x,y
    rng = random.Random(27092026)
    for _ in range(1500):
        x = struct.unpack('>d',rng.getrandbits(64).to_bytes(8,'big'))[0]
        if math.isfinite(x):
            yield abs(x),rng.uniform(-64,64)
    for _ in range(1000):
        yield rng.uniform(0.25,4),rng.uniform(-1024,1024)
