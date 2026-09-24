version 1

study("One line, moved every bar", overlay = true)

var l = draw.line(time, close, time, close)
draw.setTo(l, time, close)
plot(draw.count(), "Objects held")
