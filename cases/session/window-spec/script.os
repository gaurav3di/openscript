version 1

study("A window the script names")

plot(session.isIn("1000-1300") ? 1 : 0, "Inside ten to one")
plot(session.isIn("1200-0800") ? 1 : 0, "Across midnight")
plot(session.isIn("0900-1200:12345") ? 1 : 0, "Weekdays")
plot(session.isIn("0900-1200:67") ? 1 : 0, "Weekend")
