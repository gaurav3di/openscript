version 1

study("Alignment")

closed = req.timeframe("1h", close)
opened = req.timeframe("1h", time)

plot(closed, "Closed")
plot(opened, "Opened")
