version 1
study("Array reductions")
a = [close, open, low]
plot(sum(a), "Sum")
plot(avg(a), "Mean")
plot(min(a), "Minimum")
plot(max(a), "Maximum")
plot(stdev(a), "Deviation")
empty = [close]
clear(empty)
hole = [close, none]
plot(sum(empty), "Empty sum")
plot(avg(empty), "Empty mean")
plot(min(empty), "Empty minimum")
plot(max(empty), "Empty maximum")
plot(stdev(empty), "Empty deviation")
plot(sum(hole), "Absent sum")
plot(avg(hole), "Absent mean")
plot(min(hole), "Absent minimum")
plot(max(hole), "Absent maximum")
plot(stdev(hole), "Absent deviation")
