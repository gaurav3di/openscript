version 1

study("Gaps in a grid", overlay = true)

t = table("Gaps", 1, 2)
cell(t, 0, 0, text(close[20], 2))
cell(t, 0, 1, text(close, 1), bgColor = close > 200 ? red : none)
