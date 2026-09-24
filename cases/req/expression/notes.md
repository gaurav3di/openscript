# req/expression

Five expressions read at four hours over thirteen hourly bars from midnight:
three whole buckets and the first bar of a fourth.

## What it pins

`stdlib.md` 15.4 and `compiled-program.md` 2.16.1: the expression is a separate
program over the requested bars. `close[1]` is the previous four hour close,
absent on the first bucket, not the previous chart bar's. `bar.index` counts
requested bars: the confirmed read shows the index of the bucket that closed,
0 from bar 4, and the developing read the index of the one forming. `volume` is
the bucket's summed volume and `cum` runs once per requested bar, so its total
is the volume of every bucket so far and not a sum taken on every chart bar.
`hl2` is the bucket bar's own midpoint, from its highest high and lowest low.

## What a wrong engine does

One that evaluated the expression once per chart bar counts `bar.index` in
chart bars and adds each bucket's volume to `cum` four times. One that read the
chart's own registers inside the body reads `close[1]` one hour back.

## Reference

Computed by the author of this case from the bars, by a direct reading of the
two sections that neither engine uses.
