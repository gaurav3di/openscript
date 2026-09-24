# absent/three-valued-logic

The four combinations of an absent operand with `true` and `false`, on bar 0,
where `close > close[1]` is absent.

## What it pins

`language.md` 6.6's table: `none and false` is `false` and `none or true` is
`true`, because the other operand decides alone; `none and true` and
`none or false` are `none`. Each column reads 1 where the combination is absent,
so bar 0 reads 0, 1, 0, 1, and every later bar, where the comparison is present,
reads 0 in all four.

## What a wrong engine does differently

- Two valued logic with absence as false: `none or false` reads present.
- Propagation everywhere: `none and false` and `none or true` read absent.

## Reference

The table in `language.md` 6.6, applied by hand.
