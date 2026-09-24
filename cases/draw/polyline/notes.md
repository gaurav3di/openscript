# draw/polyline

Two polylines built from the same two arrays, which the script keeps pushing to.

## What it pins

`stdlib.md` 14.4: the path is read once, at the call, so the first polyline has
the four points the arrays held on bar 3 and not the eight they hold at the end.
Its defaults are `gray`, a width of 1, open, no fill and an opacity of 0.12.

## What a wrong engine does differently

- The arrays kept rather than copied: both paths read eight points.

## Reference

Worked out by hand by the author of this case from the script's own arguments,
the defaults `stdlib.md` section 14.4 prints beside each creation call, and the
channel values of `spec/colours.json`, under this repository's licence.
