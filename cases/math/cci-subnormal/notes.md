# math/cci-subnormal

The first two typical prices are one and three units of the smallest positive
binary64 subnormal. Their mean is two units and mean absolute deviation is one
unit. Multiplying that deviation by 0.015 rounds to zero. The ratio has no finite
value, so section 2.4 of `stdlib.md` requires absence rather than an exception.

The following ordinary bars confirm that a missing reading did not stop or reset
the calculation. In a two-value window the displacement equals the absolute
deviation in magnitude, giving the signed result of the specified division by
0.015. A guard that tests only the unscaled deviation raises on the second bar
and fails to reach the recovery outputs.
