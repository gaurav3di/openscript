version 1

study("State per call site")

fn smooth(src) => sma(src, 2)

plot(smooth(close), "Smoothed close")
plot(smooth(high), "Smoothed high")
