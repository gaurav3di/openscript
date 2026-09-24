version 1

study("while")

steps = 0.0
remaining = bar.index
while remaining > 0
    remaining -= 2
    steps += 1

plot(steps, "Halvings of the index")
