version 1
study("Changing event ordinal")
plot(valueWhen(open > 0, close, volume), "Growing")
plot(valueWhen(true, close, bar.index < 2 ? 1 : 0), "Shrinking")
