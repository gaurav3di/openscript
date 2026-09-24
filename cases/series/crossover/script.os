version 1

study("A cross from at or below to above")

mean = sma(close, 3)
crossed = crossUp(close, mean)

plot(isNone(crossed) ? -1 : crossed ? 1 : 0, "Crossed up")
