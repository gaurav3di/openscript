version 1
study("Changing distance")
plot(history(close, volume), "History")
plot(change(close, volume), "Change")
plot(mom(close, volume), "Momentum")
plot(roc(close, volume), "Rate")
