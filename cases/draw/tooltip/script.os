version 1

study("Objects with a tooltip", overlay = true)

var lab = draw.label(time, close, "Entry")
var b = draw.box(time, high, time + 3600000, low)
if bar.index == 2
    draw.setTooltip(lab, "Where the move began")
    draw.setTooltip(b, "The first bar's range")
