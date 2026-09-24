version 1

study("Clock fields")

plot(date.hour(time), "Hour")
plot(date.minute(time + 90000), "Minute of a time 90 seconds later")
plot(date.second(time + 90000), "Second of a time 90 seconds later")
