# log/no-side-effect

A print inside a loop that is already spending its whole budget.

## What it pins

`stdlib.md` 14.3: a log line changes no value. The script declares a budget of
four iterations and runs a loop of exactly four, printing on every one, so the
bar has nothing left to spend. An engine whose `print` cost the loop budget
anything at all would stop bar 0 with OS5001, and the case asserts that no bar
was stopped.

The budget is small on purpose. Any charge at all, one tick per print or one
per statement, takes a loop of four iterations past a budget of four, so the
case does not depend on how large a charge a wrong engine would make.

## What it does not pin, and why

That the numbers the bar computed are the same with logging on and off. That
comparison wants the `values` channel, and the projection this engine's adapter
answers from writes none, so the observation left is the one the diagnostics
channel carries: printing perturbed nothing the run could be stopped by.

## What a wrong engine does differently

- A `print` that charges the loop budget an iteration: OS5001 on bar 0, where
  this case has an empty diagnostics list.
- A `print` compiled as a loop of its own, whose tick is charged as well: the
  same diagnostic on the same bar.
- An engine with no `print`: the program is refused at load and the case reports
  the function it lacks.
