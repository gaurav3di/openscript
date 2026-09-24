version 1

study("More objects than an engine will hold", overlay = true)

if bar.index == 0
    for i = 1 to 10001
        draw.label(time, close, "one of many")
