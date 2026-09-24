version 1

study("The remainder of truncated division")

// The divisor runs 3, 2, 1, 0, -1, -2, -3, -4 across the eight bars, and the
// dividend alternates sign, so both signs of both operands are reached.
divisor = 3 - bar.index
dividend = bar.index % 2 == 0 ? 7 : -7

plot(dividend % divisor, "Remainder")
