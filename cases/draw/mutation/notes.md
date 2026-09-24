# draw/mutation

Four objects created on bar 0 and changed on bars 2 and 4.

## What it pins

`stdlib.md` 14.4: each setter writes the property it names and nothing else, so
the line's first anchor is bar 2's and its second is bar 4's, and every property
no setter touched keeps the value it was created with.

## Reference

Worked out by hand by the author of this case from the script's own arguments,
the defaults `stdlib.md` section 14.4 prints beside each creation call, and the
channel values of `spec/colours.json`, under this repository's licence.
