version 1

study("Session flags")

plot(session.isFirstBar ? 1 : 0, "First bar")
plot(session.isLastBar ? 1 : 0, "Last bar")
