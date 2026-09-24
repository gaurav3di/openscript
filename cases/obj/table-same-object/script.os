version 1

study("One grid", overlay = true)

t = table("Grid", 1, 1)
var kept = t
cell(kept, 0, 0, "written through the kept name")
plot(kept == t ? 1 : 0, "Same grid")
