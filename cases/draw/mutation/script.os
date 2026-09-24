version 1

study("Objects changed on later bars", overlay = true)

var l = draw.line(time, close, time + 3600000, close)
var lab = draw.label(time, close, "start")
var b = draw.box(time, high, time + 3600000, low)
var poly = draw.polyline([time], [close])
if bar.index == 2
    draw.setFrom(l, time, low)
    draw.setAt(lab, time, high)
    draw.setText(lab, "moved")
    draw.setColor(lab, red)
    draw.setTextColor(lab, black)
if bar.index == 4
    draw.setTo(l, time, high)
    draw.setBounds(b, time, high, time + 7200000, low)
    draw.setFillColor(b, blue)
    draw.setText(b, "Range")
    draw.setWidth(l, 2)
    draw.setStyle(l, "dotted")
    draw.setPoints(poly, [time, time + 3600000], [low, high])
