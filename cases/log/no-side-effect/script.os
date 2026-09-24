version 1

study("A print inside a loop that is exactly at its budget")
limits(loops = 4)

// The loop runs the whole declared budget and prints on every iteration, so the
// run has nothing left to spend on a print. A print that cost the budget an
// iteration would stop the first bar instead of finishing the dataset.
total = 0.0
for i = 1 to 4
    print(i)
    total += close

plot(total, "This bar's close, added once per iteration")
