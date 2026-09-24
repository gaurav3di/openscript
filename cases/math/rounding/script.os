version 1

study("Rounding halves away from zero")

// The values run from -3.5 to 2 in steps of a half, so every other bar is a half.
x = bar.index / 2 - 3.5

plot(round(x), "Rounded")
