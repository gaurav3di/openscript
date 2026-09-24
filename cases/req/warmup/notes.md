# req/warmup

A four hour close and a three bar average of four hour closes, each read in the
three modes, over fourteen hourly bars from 02:00: four buckets, the first of
them partial because the chart opens inside it.

## What it pins

`stdlib.md` 15.3's warmup column. `"confirmed"` is absent until the first bucket
has closed, bar 2; `"developing"` until the first bucket has begun, which is bar
0; `"lookahead"` only where the bucket does not exist, which is nowhere here.
`compiled-program.md` 2.16.2: the average is computed on requested bars, so it
needs three buckets, and the partial first bucket is one of them because an
engine folds what it was given. The confirmed average first appears on bar 10,
the first bar after the third bucket closed; the developing and lookahead
averages on bar 6, the first bar of the third bucket.

## What a wrong engine does

One that counted the average's warmup in chart bars draws it from bar 2. One
that discarded the partial first bucket starts every average a bucket late.
One that stated no first bar for a mode leaves alignment to whoever reads it.

## Reference

Computed by the author of this case from the bars, by a direct reading of the
two sections that neither engine uses; the average adds oldest first.
