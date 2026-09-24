# table/clear-overload

`clear` on a grid and on an array in the same script.

## What it pins

`stdlib.md` 14.3 and 2.2: the grid's clear empties its cells and leaves the
array alone, so the array holds this bar's close when the second cell is
written; the array's clear then empties the array and leaves the grid alone.

## Reference

Worked out by hand by the author of this case from the script's own arguments,
the defaults `stdlib.md` section 14.3 prints beside `cell`, and the
channel values of `spec/colours.json`, under this repository's licence.
