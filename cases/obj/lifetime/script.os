version 1

study("A line that lives three bars", overlay = true)

var held: line = none
if bar.index == 2
    held = draw.line(time, close, time + 3600000, close)
if bar.index == 5
    draw.delete(held)
    held = none
plot(draw.count(), "Alive")
