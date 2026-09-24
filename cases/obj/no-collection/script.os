version 1

study("Labels nobody keeps a name for", overlay = true)

if bar.index % 2 == 0
    draw.label(time, close, "kept by the chart")
