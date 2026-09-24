version 1

study("Identity, not likeness", overlay = true)

var first = draw.label(time, close, "same")
var other = draw.label(time, close, "same")
alias = first
plot(alias == first ? 1 : 0, "One object")
plot(first == other ? 1 : 0, "Two objects")
