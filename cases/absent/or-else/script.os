version 1

study("A fallback for an absent value")

plot(orElse(close[2], -1), "Two back or minus one")
