version 1

study("Calendar boundaries")

plot(date.startOfDay(time), "Start of day")
plot(date.startOfWeek(time), "Start of week")
plot(date.startOfMonth(time), "Start of month")
plot(date.isSameDay(time, time + 5 * 3600000) ? 1 : 0, "Same day five hours on")
