version 1

study("A row past the grid", overlay = true)

t = table("Two rows", 2, 1)
cell(t, 1, 0, "the last row")
if bar.index == 6
    cell(t, 2, 0, "one past it")
