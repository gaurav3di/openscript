# math/flow-overflow

All closes are at the midpoint, so every flow term is exactly zero. The
first complete volume sum overflows binary64 and its named result is absent.
Absence propagates to the ratio; division of zero by an unnormalized infinity
would wrongly emit zero. The following two windows have finite nonzero
volume sums and return exactly zero.
