version 1
study("Anchor volume overflow")
plot(vwapAnchor(close, bar.index == 0 or bar.index == 3), "Average")
