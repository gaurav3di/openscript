version 1

study("Three valued logic")

// Absent on bar 0, where there is no bar before, and true or false after.
up = close > close[1]

plot(isNone(up and false) ? 1 : 0, "Absent and false is absent")
plot(isNone(up and true) ? 1 : 0, "Absent and true is absent")
plot(isNone(up or true) ? 1 : 0, "Absent or true is absent")
plot(isNone(up or false) ? 1 : 0, "Absent or false is absent")
