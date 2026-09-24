# req/alignment

An hourly read of a fifteen minute chart whose bars do not fill every hour: the
chart opens at 09:30, has no bar at 11:00, and has nothing at all between 11:30
and 13:45.

## What it pins

`compiled-program.md` 2.16.2: a bucket is keyed by a bar's open instant, and a
confirmed read steps on the first chart bar of the next bucket. The 09:00 hour
closes on the bar at 10:00, which opens at the instant the hour ended, and bars
10:00 to 10:45 read it; the 10:00 hour closes on 11:15, the first bar of the
11:00 hour, though no bar opened at 11:00; and the 11:00 hour closes on 13:45,
two hours later, because the 12:00 hour has no bars and so no bucket. `Opened`
is the bucket bar's time, which is its first source bar's open instant and not
the boundary: 09:30 for the first hour, 11:15 for the third.

## What a wrong engine does

A fold that closed a bucket by the clock, at its boundary, would have stepped
at 11:00 and 12:00 on bars that do not exist, or invented an empty 12:00 bucket;
one that dated a bucket by its boundary would put 09:00 and 11:00 in `Opened`.
A fold that closed a bucket on its last bar reads each hour one bar early.

## Reference

Computed by the author of this case from the bar times, by a direct reading of
section 2.16.2 that neither engine uses.
