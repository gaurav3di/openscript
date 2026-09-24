version 1

study("A read past the end of a rolling window")

// The window keeps the three newest closes, so its size stops growing while the
// index being read does not. The read is inside the window while it is filling
// and past the end on the first bar after it is full.
var window: array<number> = []
push(window, close)
if size(window) > 3
    shift(window)

plot(window[bar.index], "The element at this bar's own index")
