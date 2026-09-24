version 1

study("The interval, in minutes")

plot(chart.intervalMinutes, "Minutes")
plot(chart.isIntraday ? 1 : 0, "Intraday")
plot(chart.interval == "15" ? 1 : 0, "Interval as stated")
