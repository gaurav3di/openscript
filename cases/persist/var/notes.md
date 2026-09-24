# persist/var

A `var` and a plain name, each incremented once a bar.

## What it pins

`language.md` 8.1 and 8.2: a plain assignment runs on every bar and starts from
its right-hand side again, and a `var` is initialised once, on the first bar
that reaches it, and keeps what the last bar left. Both names are incremented by
one on every bar, so the `var` counts the bars and the plain name reads one on
every bar.

## What a wrong engine does differently

- A `var` re-initialised every bar: the first column reads one on every bar,
  like the second.
- A plain name carried from the bar before: the second column counts the bars,
  like the first.
- A `var` initialised on bar 0 and incremented before its initialiser ran: the
  first column starts at two.
