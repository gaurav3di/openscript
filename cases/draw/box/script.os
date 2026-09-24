version 1

study("Two boxes", overlay = true)

if bar.index == 4
    draw.box(time, high, time + 3 * 3600000, low)
if bar.index == 5
    draw.box(time - 3600000, high, time + 3600000, low, color = green, fillColor = green, opacity = 0.3, width = 2, text = "Zone", textColor = yellow, tooltip = "Two bars wide")
