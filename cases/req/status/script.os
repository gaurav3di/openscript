version 1

study("The status of a read")

fourHour = req.timeframe("4h", close)
daily = req.timeframe("1D", close)
other = req.symbol("OTHER", "4h", close)

plot(req.isReady(fourHour) ? 1 : 0, "Four hour ready")
plot(str.length(req.error(fourHour)), "Four hour reason length")
plot(req.isReady(other) ? 1 : 0, "Other ready")
plot(str.length(req.error(other)), "Other reason length")
plot(req.isReady(daily) ? 1 : 0, "Daily ready")
plot(str.contains(req.error(daily), "timezone") ? 1 : 0, "Daily names the timezone")
plot(str.contains(req.error(daily), "TEST") ? 1 : 0, "Daily names the instrument")
plot(daily, "Daily")
plot(close, "Close")
