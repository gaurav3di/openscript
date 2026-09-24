version 1

study("Another instrument")

other = req.symbol("OTHER", "4h", close)
otherRange = req.symbol("OTHER", "4h", high - low, mode = "developing")

plot(other, "Other close")
plot(otherRange, "Other range")
plot(close - other, "Spread")
plot(req.isReady(other) ? 1 : 0, "Ready")
