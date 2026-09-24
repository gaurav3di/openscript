version 1

study("Warmup")

plot(req.timeframe("4h", close), "Confirmed close")
plot(req.timeframe("4h", close, mode = "developing"), "Developing close")
plot(req.timeframe("4h", close, mode = "lookahead"), "Lookahead close")
plot(req.timeframe("4h", sma(close, 3)), "Confirmed average")
plot(req.timeframe("4h", sma(close, 3), mode = "developing"), "Developing average")
plot(req.timeframe("4h", sma(close, 3), mode = "lookahead"), "Lookahead average")
