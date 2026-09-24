# chart/interval

An instrument stated at an interval of `15`.

## What it pins

`stdlib.md` 3.4: `chart.interval` is the canonical string the host states, and
`chart.intervalMinutes` and `chart.isIntraday` are derived from it rather than
read, so they cannot disagree with it: fifteen minutes, which is intraday.
