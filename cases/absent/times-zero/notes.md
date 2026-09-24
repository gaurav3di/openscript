# absent/times-zero

`close[2] * 0`: absent for two bars and zero afterwards.

## What it pins

`language.md` 6.2 names the case: `none * 0` is absent. Multiplication by zero is
the one shape a reader expects to "cancel" absence, and it does not, because the
unknown value might have been anything.

## What a wrong engine does differently

- A zero on bars 0 and 1, which is what an engine that folds `x * 0` before
  asking whether `x` is present produces.

## Reference

By the rule above: absent while `close[2]` is, and zero from bar 2.
