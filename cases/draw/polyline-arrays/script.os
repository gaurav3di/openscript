version 1

study("A path with no price for its last points", overlay = true)

var times: array<number> = []
var prices: array<number> = []
push(times, time)
if bar.index < 2
    push(prices, close)
if bar.index == 3
    draw.polyline(times, prices)
