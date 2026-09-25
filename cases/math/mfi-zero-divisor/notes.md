# math/mfi-zero-divisor

Finite prices can be negative. At the third bar the two-period positive and
negative signed flow totals are 1 and -1. The inner ratio is -1, so the divisor
`1 + positive / negative` is zero. Section 2.4 of `stdlib.md` requires absence
for the resulting non-finite ratio, with no runtime exception.

At the next bar the totals are 2 and -1, giving `100 - 100 / -1 = 200` in the
specified operation order. The last bar has no falling flow and follows the
existing zero-falling-total result of 100. These outputs check recovery without
silently clamping signed-price arithmetic to a conventional positive-price range.
