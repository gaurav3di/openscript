version 1

study("Three labels, one deleted", overlay = true)

var first = draw.label(time, close, "first")
var second = draw.label(time, high, "second")
if bar.index == 1
    draw.label(time, low, "third")
if bar.index == 4
    draw.delete(second)
