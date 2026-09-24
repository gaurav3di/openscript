version 1

study("Two clears", overlay = true)

t = table("Rebuilt", 2, 1)
var seen: array<number> = []
push(seen, close)
cell(t, 0, 0, "before the clear")
clear(t)
cell(t, 1, 0, text(size(seen), 0))
clear(seen)
plot(size(seen), "Held after the array's clear")
