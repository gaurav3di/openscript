version 1

study("Settings inside a read")

length = input(2, "Length", min = 1)

named = req.timeframe("4h", sma(close, length))
inline = req.timeframe("4h", sma(close, input(3, "Inline length", min = 1)))

plot(named, "Named")
plot(inline, "Inline")
