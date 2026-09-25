version 1
study("Anchor product overflow")
plot(vwapAnchor(close, bar.index == 0), "Average")
