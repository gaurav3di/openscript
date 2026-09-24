version 1

study("A grid rebuilt", overlay = true)

t = table("Rebuilt", 2, 1)
cell(t, 0, 0, "before the clear")
clear(t)
cell(t, 1, 0, "after the clear")
