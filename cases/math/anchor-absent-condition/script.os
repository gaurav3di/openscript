version 1
study("Absent reset condition")
reset = bar.index == 1 ? none : bar.index == 0
plot(vwapAnchor(close, reset), "Average")
