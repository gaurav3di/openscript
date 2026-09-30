version 1

study("Modes in their place")

confirmed = req.timeframe("4h", high, "confirmed")
developing = req.timeframe("4h", high, "developing")
lookahead = req.timeframe("4h", high, "lookahead")
other = req.symbol("OTHER", "4h", high, "TEST", "lookahead")

plot(confirmed, "Confirmed")
plot(developing, "Developing")
plot(lookahead, "Lookahead")
plot(other, "Other lookahead")
