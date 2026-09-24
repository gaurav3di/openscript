version 1

study("The three newest boxes", overlay = true)

var boxes: array<box> = []
push(boxes, draw.box(time, high, time + 3600000, low))
if size(boxes) > 3
    draw.delete(boxes[0])
    shift(boxes)
plot(size(boxes), "Held")
plot(draw.count(), "Drawn")
