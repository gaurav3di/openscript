version 1

study("Division by zero")

plot(close / (bar.index - 3), "Close over index less three")
