version 1

study("An absent condition takes the false branch")

upBar = close > close[1]
var taken = 0.0
if upBar
    taken = 1
else
    taken = 2

plot(taken, "Branch taken by if")
plot(upBar ? 1 : 2, "Arm taken by the ternary")
