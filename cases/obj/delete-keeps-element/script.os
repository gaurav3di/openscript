version 1

study("Deleted, still held", overlay = true)

var boxes: array<box> = []
push(boxes, draw.box(time, high, time + 3600000, low))
if bar.index == 3
    draw.delete(boxes[0])
plot(size(boxes), "Held")
plot(draw.count(), "Drawn")
