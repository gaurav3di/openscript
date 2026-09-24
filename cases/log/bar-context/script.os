version 1

study("Every log line carries the bar it was written on")

// Two lines on an even bar and one on an odd one, so the lines of one bar are
// told apart from the next by the bar they carry and not by a count. The first
// read is from before the dataset began on bar 0, so the first line is absent.
if bar.index % 2 == 0
    print(close[1])
print(bar.index)

plot(close, "Close")
