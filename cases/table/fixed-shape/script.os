version 1

study("A grid sized by an input", overlay = true)

rows = input(3, "Rows", min = 1)
t = table("Sized", rows, 1)
cell(t, rows - 1, 0, "the last row")
