# draw/delete

A label on every bar, every object deleted on bar 3, and bar 5's label deleted
twice on the bar that made it.

## What it pins

`stdlib.md` 14.4: `draw.count()` is the number of objects the script holds,
`draw.deleteAll()` deletes every one of them, and deleting an object twice is
not an error. The count reads 1, 2, 3, then 0 after bar 3's label and every
earlier one are gone, then 1, 1, 2 and 3; the objects left are the labels of
bars 4, 6 and 7.

## Reference

Worked out by hand by the author of this case from the script's own arguments,
the defaults `stdlib.md` section 14.4 prints beside each creation call, and the
channel values of `spec/colours.json`, under this repository's licence.
