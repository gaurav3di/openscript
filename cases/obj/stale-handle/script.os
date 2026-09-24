version 1

study("A setter given a deleted line", overlay = true)

var l = draw.line(time, close, time + 3600000, close)
if bar.index == 2
    draw.delete(l)
if bar.index == 4
    draw.setColor(l, red)
