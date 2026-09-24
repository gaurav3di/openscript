version 1

study("One row per bar", overlay = true)

t = table("Last bar only", 8, 1)
cell(t, bar.index, 0, text(close, 2))
