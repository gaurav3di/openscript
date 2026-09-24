# log/print

Printing a value of every kind the language has, and the run finishing.

## What it pins

`stdlib.md` 14.3: `print` takes one value, draws nothing and answers nothing. It
is handed a series number, a bar fact, a string, a bool, a read from before the
dataset began and the absent literal, on every bar, and the run reaches the end
of the dataset with no diagnostic.

An absent argument is asserted on purpose, twice over. A script that prints a
value which is absent during warmup is printing the one thing its author is
looking at the log for, and an engine that refused it, or that refused the
absent literal beside it, would be refusing the case a log is read for.

## What it does not pin, and why

Not the log. `conformance.md` 2 lists `log` among the channels a case may
assert, and the projection this engine's adapter answers from writes
`diagnostics`, `orders`, `trades` and `performance` and no `log`, so a case that
asserted the stream would be reported `unsupported` rather than run. What is
asserted here is that printing is legal and costs the run nothing, not what was
written.

## What a wrong engine does differently

- An engine with no `print` in its library refuses the program at load, naming
  the function it does not have, and the case reports that rather than passing.
- An engine that refuses an absent argument, a string or a bool raises on bar 0,
  and the diagnostics list holds a row where this case has none.
