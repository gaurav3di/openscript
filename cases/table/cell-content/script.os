version 1

study("A summary grid", overlay = true)

t = table("Summary", 2, 2)
cell(t, 0, 0, "Close")
cell(t, 0, 1, text(close, 2), textColor = white, bgColor = blue)
cell(t, 1, 0, "Opened at")
cell(t, 1, 1, text(open, 2))
