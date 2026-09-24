version 1

study("Three alignments", overlay = true)

t = table("Aligned", 1, 3)
cell(t, 0, 0, "L", align = "left")
cell(t, 0, 1, "C", align = "center")
cell(t, 0, 2, "R", align = "right")
