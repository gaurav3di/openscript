version 1

study("A line past both ends of the data", overlay = true)

if bar.index == 7
    draw.line(time - 10 * 3600000, close, time + 10 * 3600000, close + 5)
