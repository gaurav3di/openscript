version 1

study("Three modes")

confirmed = req.timeframe("4h", high, mode = "confirmed")
developing = req.timeframe("4h", high, mode = "developing")
lookahead = req.timeframe("4h", high, mode = "lookahead")

plot(confirmed, "Confirmed")
plot(developing, "Developing")
plot(lookahead, "Lookahead")
