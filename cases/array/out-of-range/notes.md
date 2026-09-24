# array/out-of-range

An element read past the end of an array.

## What it pins

`language.md` 14.1: an index outside `0` to `size - 1` is OS4004 on the bar the
read happened, naming the index and the size. The window keeps the three newest
closes, so its size stops growing at 3 while the index being read, the bar's
own, does not. The read is inside the window on bars 0, 1 and 2 and past its end
on bar 3.

This is the case that tells an array read apart from a history read. They are
spelled the same way and 7.4 makes the second one absent past the oldest bar;
14.1 makes the first one an error, because an array has a known extent the
script chose and an index outside it is a mistake rather than a missing
measurement.

## What a wrong engine does differently

- Answering absence for an index past the end, which is the history rule applied
  to an array: nothing is raised and the case fails on an empty diagnostics
  list.
- Clamping the index to the last element: the same empty list, and a plausible
  number on the plot.
- Reading the size before the window is trimmed, so the array looks one longer
  than it is: nothing is raised on bar 3 either.

## Why the dataset stops at the bar that fails

Bar 4 would be out of range as well, so an engine that stops the failing bar and
carries on to the next would report a second diagnostic. What a run does after a
bar it stopped is fixed nowhere, and a case may not assert it.
