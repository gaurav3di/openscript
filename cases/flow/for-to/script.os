version 1

study("A range includes both ends")

total = 0.0
for i = 1 to bar.index
    total += i

stepped = 0.0
for j = 0 to 10 step 3
    stepped += j

plot(total, "One to the index")
plot(stepped, "Zero to ten by three")
