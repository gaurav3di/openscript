# fn/state-per-call-site

One user function holding an `sma`, called from two sites over two sources.

## What it pins

`language.md` 11.4: a stateful call inside a user function has one state per
call site of that function, so the two plots are each the two bar mean of their
own source. An engine sharing one window between the two calls would mix the
closes and the highs.

## What a wrong engine does differently

- One shared state: both columns carry the mean of alternating closes and highs.

## Reference

The window mean of `stdlib.md` 20.2.1, computed in Python, by the author of this
case, under this repository's licence.
