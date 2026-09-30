# req/positional-mode

The reads of `req/mode`, over the same twelve hourly bars from 02:00, with each
mode written in its place rather than after `mode =`, and a fourth read of an
instrument the chart does not hold, `OTHER`, whose four hour bars are
`bars.OTHER.csv`: one each at 00:00, 04:00, 08:00 and 12:00, highs 50.5, 52.25,
52.5 and 53, and whose exchange is written in its place before the mode.

## What it pins

`language.md` 11.2 and `stdlib.md` 15.1: arguments fill parameters from the
left, and `mode` is the third parameter of `req.timeframe` and the fifth of
`req.symbol`, so a mode written without its label is the same argument and the
read runs in it. The first three columns are therefore `req/mode`'s, bar for
bar: `"confirmed"` absent on bars 0 and 1 and then the last bucket that closed,
`"developing"` the bucket so far, `"lookahead"` the bucket in full from its first
bar. The fourth is the other instrument's four hour high in full from the first
chart bar of its bucket, 50.5 on bars 0 and 1, 52.25 on bars 2 to 5, 52.5 on
bars 6 to 9 and 53 on bars 10 and 11, because the whole file is the history the
host hands over and a lookahead read keys by the chart bar's own bucket.

## What a wrong engine does

A compiler that recognised the mode only by its label compiled every read here
as `"confirmed"`, with no warning, so the second and third columns equalled the
first and the fourth was absent on bars 0 and 1 and a bucket late from there.
One that took the fourth argument of `req.symbol` for its mode would read the
exchange, a string that names no mode.

## Reference

The first three columns are `req/mode`'s expected columns, computed by the
author of that case and checked again by the author of this one from the bars.
The fourth was computed by the author of this case from `bars.OTHER.csv`, by a
direct reading of `stdlib.md` 15.3 and `compiled-program.md` 2.16.2 that neither
engine uses: for each chart bar, the other instrument's bars keyed by that bar's
four hour bucket or lower, and the high of the bucket keyed by it.
