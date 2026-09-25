"""Study recipes with independently certified elementary calls, no library calls."""
import math
from .transcendental_oracle import rounded


def finite(value):
    return value if value is not None and math.isfinite(value) else None


def ordered_sum(values):
    total = 0.0
    for value in values:
        total += value
    return total


def gaussian(values, length, offset, sigma):
    if length is None or len(values) < length or offset is None or sigma is None or sigma <= 0:
        return None
    held = values[-length:]
    if any(value is None for value in held):
        return None
    peak, spread = offset*(length-1), length/sigma
    denominator = (2*spread)*spread
    if denominator == 0:
        return None
    weights = []
    for position in range(length):
        gap = position-peak
        exponent = -(gap*gap)/denominator
        weight = 0.0 if exponent == -math.inf else rounded('exp', exponent)
        if weight is None:
            return None
        weights.append(weight)
    norm = ordered_sum(weights)
    return None if norm == 0 else finite(ordered_sum([v*w for v,w in zip(held,weights)])/norm)


def volatility(values, length, periods):
    if length is None or periods is None or periods <= 0 or len(values) <= length:
        return None
    changes = []
    for before,now in zip(values[-length-1:-1],values[-length:]):
        if before is None or now is None or before <= 0 or now <= 0:
            return None
        value = rounded('log', now/before)
        if value is None:
            return None
        changes.append(value)
    mean = ordered_sum(changes)/length
    squares = ordered_sum([(value-mean)*(value-mean) for value in changes])
    return finite(math.sqrt(squares/length)*math.sqrt(periods))


def travel(bars, length):
    if length is None or length <= 1 or len(bars) <= length:
        return None
    ranges = []
    for before,now in zip(bars[-length-1:-1],bars[-length:]):
        h,l,c = now['high'],now['low'],before['close']
        if h is None or l is None or c is None:
            return None
        ranges.append(max(h-l,abs(h-c),abs(l-c)))
    distance = ordered_sum(ranges)
    span = max(bar['high'] for bar in bars[-length:])-min(bar['low'] for bar in bars[-length:])
    if span <= 0 or distance <= 0:
        return None
    numerator,denominator = rounded('log10',distance/span),rounded('log10',float(length))
    return None if numerator is None or denominator is None or denominator == 0 else finite((100*numerator)/denominator)
