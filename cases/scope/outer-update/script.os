version 1

study("A block assigns the outer name")

above = 0.0
if close > 102
    above = 1

plot(above, "Set inside the block")
