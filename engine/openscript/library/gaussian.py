"""Bounded immutable Gaussian coefficients, independent of checkpoint state."""
import math
import struct

from .elementary import exp


class GaussianCache:
    """FIFO with eight parameter tuples and at most 4096 coefficients."""
    def __init__(self):
        self.entries = {}
        self.coefficients = 0

    def get(self, length, offset, sigma):
        if not math.isfinite(offset) or not math.isfinite(sigma) or sigma <= 0:
            return None
        key = (length, struct.pack('>d', offset), struct.pack('>d', sigma))
        if key in self.entries:
            return self.entries[key]
        peak, spread = offset * (length - 1), length / sigma
        denominator = (2 * spread) * spread
        if denominator == 0:
            return None
        weights = []
        norm = 0.0
        for position in range(length):
            gap = position - peak
            exponent = -(gap * gap) / denominator
            weight = 0.0 if exponent == -math.inf else exp(exponent)
            if weight is None:
                return None
            weights.append(weight)
            norm += weight
        if norm == 0:
            return None
        computed = (tuple(weights), norm)
        if length <= 4096:
            while len(self.entries) >= 8 or self.coefficients + length > 4096:
                oldest = next(iter(self.entries))
                self.coefficients -= len(self.entries[oldest][0])
                del self.entries[oldest]
            self.entries[key] = computed
            self.coefficients += length
        return computed


_CACHE = GaussianCache()


def gaussian_weights(length, offset, sigma):
    return _CACHE.get(length, offset, sigma)
