# array/numeric-reductions

The five numeric array reductions are outside the current generated library
vectors. This case executes them through real compiled programs in both engines.

## Independent expectations

The first array is `[3, 6, 0]`: sum 9, mean 3, and population variance
`(0 + 9 + 9) / 3 = 6`. Its deviation is the correctly rounded binary64 square
root of 6. Equal-value and all-zero arrays have zero deviation.

Index order is observable in the two remaining arrays. Adding the first two
`1e308` values overflows before the negative final value arrives, so sum, mean
and deviation are absent. For `[2^53, 1, -2^53]`, the middle addition rounds back
to `2^53`, making the sum and mean zero. Its deviation is the correctly rounded
square root of the index-order binary64 sum of squares divided by three.

An empty array has sum zero and no other reduction. Every array with an absent
element has an absent reduction, including its sum.

## Wrong implementations caught

Compensated or reordered addition changes the cancellation result. A sample
deviation uses the wrong divisor. Skipping absent elements produces finite values
in the last five columns. Treating an empty mean or extreme as zero changes its
absence. Sharing mutable arrays between calls changes the ordinary reductions
when the separate empty array is cleared.
