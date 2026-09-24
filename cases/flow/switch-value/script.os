version 1

study("switch on a value")

phase = bar.index % 4
tag = 0.0
switch phase
    case 0
        tag = 10
    case 1, 2
        tag = 20
    default
        tag = 30

plot(tag, "Arm taken")
