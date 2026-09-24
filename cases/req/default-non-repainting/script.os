version 1

study("The default mode")

plain = req.timeframe("4h", close)
confirmed = req.timeframe("4h", close, mode = "confirmed")
developing = req.timeframe("4h", close, mode = "developing")

plot(plain, "Default")
plot(confirmed, "Confirmed")
plot(developing, "Developing")
