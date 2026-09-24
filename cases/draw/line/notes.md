# draw/line

Two lines: one with every default, one with every argument written.

## What it pins

`stdlib.md` 14.4: `draw.line` anchors a line at two times and prices, and its
defaults are `gray`, a width of 1, `"solid"` and no extension. `conformance.md`
section 4: an element holds the kind, the anchors in order, and every other
property under the name of its argument.

## What a wrong engine does differently

- A default left absent rather than applied: the first line's colour reads null.
- The anchors swapped or read against the bar index rather than the time.

## Reference

Worked out by hand by the author of this case from the script's own arguments,
the defaults `stdlib.md` section 14.4 prints beside each creation call, and the
channel values of `spec/colours.json`, under this repository's licence.
