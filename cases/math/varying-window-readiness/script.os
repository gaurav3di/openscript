version 1
study("Window readiness")
plot(sum(close, volume), "Sum")
plot(sma(close, volume), "Mean")
plot(highest(close, volume), "High")
