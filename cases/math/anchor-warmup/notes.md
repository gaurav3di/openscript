# math/anchor-warmup

Before bar 2 no anchor exists, so both readings are absent. Bar 2 starts at 30.
Bar 3 starts a new accumulation even though its source is absent; bar 4 must
therefore start at 40, with no contribution from either prior accumulation.
Two equal-volume prices, 40 and 50, then give 45. Returning early before a
missing-source reset or accumulating before the first reset fails this case.
