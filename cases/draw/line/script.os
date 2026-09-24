version 1

study("Two lines", overlay = true)

if bar.index == 0
    draw.line(time, close, time + 3600000, high)
if bar.index == 1
    draw.line(time, low, time + 7200000, close, color = red, width = 3, style = "dashed", extendLeft = true)
