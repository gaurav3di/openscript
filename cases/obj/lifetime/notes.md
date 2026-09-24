# obj/lifetime

A line created on bar 2 and deleted on bar 5, with its name set to `none` as
the fix for OS4005 says.

## What it pins

`language.md` 5.4: the count is 0 before bar 2, 1 on bars 2 to 4, and 0 from
bar 5, when the line is gone and the set is empty.

## Reference

Worked out by hand by the author of this case from the script's own arguments,
the defaults `stdlib.md` section 14.4 prints beside each creation call, and the
channel values of `spec/colours.json`, under this repository's licence.
