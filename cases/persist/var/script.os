version 1

study("A var keeps its value across bars and a plain name starts again")

// The var is initialised once, on the first bar, and each bar adds to what the
// bar before left. The plain name is assigned afresh on every bar, so its sum is
// one bar's worth and never more.
var kept = 0.0
kept += 1

fresh = 0.0
fresh += 1

plot(kept, "Kept")
plot(fresh, "Fresh")
