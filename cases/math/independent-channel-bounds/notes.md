# math/independent-channel-bounds

Each side reads its own two-bar window. At bar 1 the highs contain absence
but both lows are known, so the lower bound is 1. At bars 2 and 3 the highs
are known and the lows contain absence, so only the upper bound is 6. When
the low hole leaves at bar 4, the bounds are 8 and 2 and their midpoint is 5.
A shared all-or-nothing guard incorrectly suppresses the known side.
