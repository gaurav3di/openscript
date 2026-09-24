version 1

study("Two paths", overlay = true)

var times: array<number> = []
var prices: array<number> = []
push(times, time)
push(prices, close)
if bar.index == 3
    draw.polyline(times, prices)
if bar.index == 5
    draw.polyline(times, prices, color = orange, width = 2, closed = true, fillColor = orange, opacity = 0.5)
