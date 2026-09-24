version 1

study("Calendar reads")

dayRange = req.timeframe("1D", high - low)
weekOpen = req.timeframe("1W", open, mode = "developing")
monthClose = req.timeframe("1M", close)

plot(dayRange, "Day range")
plot(weekOpen, "Week open")
plot(monthClose, "Month close")
