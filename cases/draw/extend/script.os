version 1

study("An extended line", overlay = true)

var l = draw.line(time, close, time + 3600000, close)
if bar.index == 1
    draw.setExtend(l, true, false)
if bar.index == 6
    draw.setExtend(l, false, true)
