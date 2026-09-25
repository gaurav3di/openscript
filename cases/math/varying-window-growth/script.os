version 1
study("Growing window")
plot(sum(close, volume), "Sum")
plot(sma(close, volume), "Mean")
plot(highest(close, volume), "High")
