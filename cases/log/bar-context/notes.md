# log/bar-context

`print` on every bar, and a second `print` on the even ones.

## What it pins

`stdlib.md` 14.3: every entry carries the bar it was written on, so a log line
can be matched to a bar; and `conformance.md` 4 fixes a line as its bar index,
that bar's time and the value. The lines are in the order the run wrote them:
within a bar, the order the script's statements ran, and across bars, bar by bar.
The first line of bar 0 prints `close[1]`, which is absent before the dataset
began, and is written as an absent line rather than dropped.

## What a wrong engine does differently

- An absent value dropped from the log: five lines where this case has six.
- Lines carrying the bar the run ended on rather than the one they were written
  on: every `barIndex` reads 3.
- The lines of one bar reordered: bar 2's two values swapped.

## Reference

Written out by hand from the script and `bars.csv`.
