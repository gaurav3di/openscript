# req/symbol

A read of an instrument the chart does not hold, `OTHER`, whose four hour bars
are `bars.OTHER.csv`: one bar from the evening before the chart opens, bars at
00:00 and 04:00, none at 08:00, and one at 12:00 after the chart ends.

## What it pins

`stdlib.md` 15.1 and `conformance.md` section 3: the read is answered from the
file named after the instrument, at the timeframe it requests, and folded onto
the chart's hourly bars by time exactly as a read of the chart's own bars is.
The confirmed close is present from bar 0, because the bar from the evening
before is history the host handed over and it closes when the 00:00 bar is
folded; it steps to the 00:00 close on bar 4 and holds there to the end, because
no bar at 08:00 ever closes the 04:00 one. The developing range is each four
hour bar's own range while the chart is inside it, and absent from bar 8, where
the instrument has no bar for the chart's bucket. The read is ready on every
bar, because the host answered.

`req.symbol` also has its own request and attach lifecycle in the contract,
which a case served from a file cannot show, so the matrix row stays specified.

## What a wrong engine does

One that aligned the two series by position rather than by time reads the wrong
bar everywhere. One that treated the missing 08:00 bar as the previous one
carried forward draws a developing range the instrument never had. One that
discarded history before the chart's first bar is absent until bar 4.

## Reference

Computed by the author of this case from the two files, by a direct reading of
`stdlib.md` 15.3 and `compiled-program.md` 2.16.2 that neither engine uses.
