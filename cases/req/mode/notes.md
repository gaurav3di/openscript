# req/mode

One read, a four hour high of the chart's own hourly bars, written three times
with the mode on the line that causes each reading.

## What it pins

`stdlib.md` 15.3 and `compiled-program.md` 2.16.2: the mode decides what the read
may know. Twelve hourly bars from 02:00 fall in four buckets, 00:00 (two bars,
the chart starts inside it), 04:00, 08:00 and 12:00 (two bars, the chart ends
inside it). `"confirmed"` is the last bucket that closed: absent on bars 0 and 1,
then the 00:00 bucket's high from bar 2, the first bar of the next bucket, held
to its last bar. `"developing"` is the bucket so far, the highest high up to and
including the chart bar. `"lookahead"` is the bucket in full from its first bar,
because a case is settled history and the whole of `bars.csv` is handed to the
fold before bar 0; on the last bucket that is the two bars the chart has.

## What a wrong engine does

A fold that closes a bucket on its last bar puts the 04:00 high on bar 5. One
that dates a bar by its close shifts the whole confirmed column a bar. A
developing read that summed rather than rolled back its bucket on each bar
climbs. A lookahead read fed one bar at a time reads the bucket so far, which is
the developing column, and is the live chart's reading rather than history's.

## Reference

Each column computed by the author of this case from the bars, by a direct
reading of the two sections that neither engine uses: for each chart bar, the
source bars the mode may consume are selected, grouped by the four hour bucket
of their open instant, and the high of the right bucket taken.
