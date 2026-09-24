version 1

study("Two way extremes and a clamp")

plot(max(close, 103), "Close or 103, the larger")
plot(min(close, 103), "Close or 103, the smaller")
plot(clamp(close, 101, 104), "Close held between 101 and 104")
