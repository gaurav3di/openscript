version 1

study("Change")

plot(change(close), "From the bar before")
plot(change(close, 3), "From three bars before")
