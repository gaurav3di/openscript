# draw/time-anchored

A line from ten hours before the last bar to ten hours after it, which is
before the first bar and after the last.

## What it pins

`stdlib.md` 14.4: an anchor is a time and a price, not a bar index, and neither
is read against the bars, so a projection reaches into the margin rather than
being clamped to the data.

## Reference

Worked out by hand by the author of this case from the script's own arguments,
the defaults `stdlib.md` section 14.4 prints beside each creation call, and the
channel values of `spec/colours.json`, under this repository's licence.
