version 1

study("Formatting a time")

plot(date.format(time, "EEE dd MMM yyyy HH:mm:ss") == "" ? 0 : 1, "Formatted")
plot(str.length(date.format(time, "yyyy-MM-dd")), "Length of a date")
