# math/number-conversion

`toNumber` has no generated numerical vector because it accepts text. This case
checks it through the compiled program boundary with independently specified
binary64 and grammar boundaries.

`9007199254740993` is halfway between adjacent representable integers and rounds
to the even significand at `2^53`. The long decimal is the exact real value of
the binary64 number commonly written `0.1`. `5e-324` rounds to the smallest
positive subnormal; `1e-400` rounds to zero. The maximum finite spelling stays
finite and the overflowing decimal becomes absent.

The language's decimal grammar accepts surrounding whitespace but excludes radix
prefixes, digit separators and non-finite spellings. A permissive host conversion,
truncating parser or rounded integer parser answers at least one column wrongly.
