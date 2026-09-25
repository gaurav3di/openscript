version 1
study("Independent bounds")
channel = donchian(2)
plot(channel[0], "Upper")
plot(channel[1], "Midpoint")
plot(channel[2], "Lower")
