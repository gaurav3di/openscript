"""The two derived prices the stateful half forms for itself, from facts it read.

A study that calls ``hlc3`` is handed the bar register `compiled-program.md`
section 2.10 defines, and never reaches this file. What reaches this file is the
library's own readings: ``cci`` and ``mfi`` are written against the typical
price, and ``eom``, ``awesomeOsc`` and the trailing band against the midpoint,
and none of those takes a source argument, so the value has to be formed from the
three bar facts the call read.

**The order of operations is section 2.10's and is part of the contract**, which
is why these are two named functions rather than an expression written out at
five call sites: a different association gives a different last bit, and a study
that matched a reference implementation on one engine and not on another is
exactly the failure this project exists to prevent.
"""

from .values import ABSENT, Value, number, result


def midpoint(ctx) -> Value:
    """``(high + low) / 2``, the bar's midpoint."""
    high = number(ctx.bar("high"))
    low = number(ctx.bar("low"))
    if high is None or low is None:
        return ABSENT
    return result((high + low) / 2)


def typical(ctx) -> Value:
    """``(high + low + close) / 3``: high to low, close to that, then the division."""
    high = number(ctx.bar("high"))
    low = number(ctx.bar("low"))
    close = number(ctx.bar("close"))
    if high is None or low is None or close is None:
        return ABSENT
    return result((high + low + close) / 3)
