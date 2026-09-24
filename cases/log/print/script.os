version 1

study("A printed value of every kind")

// A number, a bar fact, a string, a bool and two absent values: one read from
// before the dataset began and one written out. Printing is not drawing and
// takes whatever it is handed.
print(close)
print(bar.index)
print("a line of text")
print(close > open)
print(close[50])
print(none)

plot(close, "Close")
