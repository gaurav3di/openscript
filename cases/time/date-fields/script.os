version 1

study("Calendar fields")

plot(date.year(time), "Year")
plot(date.month(time), "Month")
plot(date.day(time), "Day")
plot(date.dayOfYear(time), "Day of year")
