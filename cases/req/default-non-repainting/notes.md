# req/default-non-repainting

A four hour close read three ways: with no mode written, with `"confirmed"`
written, and with `"developing"` written.

## What it pins

`stdlib.md` 15.3: `"confirmed"` is the default, so a script that says nothing
reads only buckets that have closed and cannot repaint. The `Default` column is
the `Confirmed` column bar for bar, absent until the first bucket closes on bar
2 and stepping only on the first bar of a bucket, while `Developing` moves on
every bar. The bars are `req/mode`'s.

## What a wrong engine does

An engine whose default was either of the other modes, or that read a missing
mode as the bucket still forming, draws the `Developing` column in the
`Default` one: a script that said nothing would repaint.

## Reference

Computed by the author of this case from the bars, by the same direct reading of
`stdlib.md` 15.3 as `req/mode`, which neither engine uses.
