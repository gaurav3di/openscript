version 1

study("An array at its element ceiling and one past it")

// A quarter of a million elements a bar. The array holds exactly the ceiling at
// the end of the fourth bar, and the first append of the fifth is the one
// element too many.
var kept: array<number> = []
for i = 1 to 250_000
    push(kept, close)

plot(size(kept), "Elements held")
