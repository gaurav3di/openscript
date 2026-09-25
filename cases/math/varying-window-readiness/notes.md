# math/varying-window-readiness

The initial length 5 determines the first possible reading at contribution 5.
The current length is then 2, selecting values 4 and 5, with sum 9, mean 4.5
and highest 5. Using current length for warmup emits too early; using maximum
length for the actual calculation selects a different window.
