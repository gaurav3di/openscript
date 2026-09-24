# req/status

Three reads on an instrument whose record states no timezone: a four hour read
of the chart's own bars, a four hour read of `OTHER` served from
`bars.OTHER.csv`, and a daily read of the chart's own bars.

## What it pins

`stdlib.md` 15.1 and 15.5. `req.isReady` is true of a read the engine folds from
the chart's own bars and of one the host answered, and `req.error` is the empty
string for both. The daily read is the read the fold cannot date: a day is a
civil date in the instrument's zone and the record states none, so it is absent
on every bar, `req.isReady` is false because it is not waiting for anything, and
`req.error` carries OS6012, naming the timezone the host did not supply and the
instrument it did not supply it for. The rest of the study keeps drawing.

What it does not pin: a read the host has not answered yet, and a read the host
refused. A case's host is its files, which answer at once, and a file that is
missing is a case failure rather than a refusal (`conformance.md` section 3), so
neither can be written here and the matrix row stays specified. The engines'
own tests reach both. The reason is asserted by what it names rather than by its
words, which are the catalogue's and are allowed to improve.

## What a wrong engine does

One that folded days in a zone nobody chose draws a daily close and says it is
ready. One that left the daily read absent with no reason says nothing a
trader could act on. One that reported a folded read as waiting for a host that
was never asked hides every higher timeframe study behind a loading state.

## Reference

Worked out by the author of this case from `stdlib.md` 15.5 and the record in
`instrument.json`; no arithmetic is involved beyond the chart's own closes.
