# math/skipped-band-midpoint

Ordinary bars have midpoint 10 and range 4, seeding the upper band at 14.
The extreme bar overflows the named midpoint and is skipped by the band step.
The following ordinary midpoint uses the last accepted close 10, preserving
the upper band 14 and short direction 1. Updating close on the skipped bar
would incorrectly trail against a price that never entered the band state.
