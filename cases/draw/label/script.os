version 1

study("Two labels", overlay = true)

if bar.index == 2
    draw.label(time, high, "Pivot")
if bar.index == 3
    draw.label(time, low, "Low", color = blue, textColor = black, align = "left", tooltip = "The low of the bar")
