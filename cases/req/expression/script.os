version 1

study("What an expression means inside a read")

plot(req.timeframe("4h", close[1]), "Previous close")
plot(req.timeframe("4h", bar.index), "Requested index")
plot(req.timeframe("4h", bar.index, mode = "developing"), "Forming index")
plot(req.timeframe("4h", cum(volume)), "Volume so far")
plot(req.timeframe("4h", hl2), "Midpoint")
