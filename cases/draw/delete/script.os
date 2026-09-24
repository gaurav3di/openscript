version 1

study("Deleting and counting", overlay = true)

made = draw.label(time, close, "bar")
if bar.index == 3
    draw.deleteAll()
if bar.index == 5
    draw.delete(made)
    draw.delete(made)
plot(draw.count(), "Count")
