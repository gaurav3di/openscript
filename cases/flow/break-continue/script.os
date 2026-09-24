version 1

study("break and continue")

total = 0.0
for i = 1 to 10
    if i % 2 == 0
        continue
    if i > bar.index + 1
        break
    total += i

plot(total, "Odd numbers up to the index plus one")
