version 1
study("Anchor warmup")
plot(vwapAnchor(close, bar.index == 2 or bar.index == 3), "Average")
