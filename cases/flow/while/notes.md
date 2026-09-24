# flow/while

A `while` that counts how many times two can be taken from the bar's index.

## What it pins

`language.md` 10.4: the condition is tested before every iteration, including
the first, so bar 0 runs the body no times. On bar `n` the body runs `ceil(n / 2)`
times.

## What a wrong engine does differently

- A condition tested after the body: bar 0 reads one.

## Reference

`(n + 1) // 2` in Python, by the author of this case, under this repository's
licence.
