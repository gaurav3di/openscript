version 1

study("The floored modulus")

divisor = 3 - bar.index
dividend = bar.index % 2 == 0 ? 7 : -7

plot(mod(dividend, divisor), "Modulus")
