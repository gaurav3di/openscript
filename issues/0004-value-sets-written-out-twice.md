# 0004 Sixty-six value sets are written out in more than one file

Status: open
Opened: 2026-09-20
Against: `spec/` and `docs/`
Severity: no document contradicts another today, and several will as soon as one
of them is edited

## What is wrong

An enumerated value set is the accepted values of an argument: what `type` may be,
which calls are top level only, what a table corner may be. Sixty-six of them are
written out in full in two or more files.

Every copy reads as authoritative and a reader has no way to tell which is
current. Prose duplication at least announces itself by reading oddly. A list of
quoted words looks correct right up until it is wrong.

The clearest case is the list of calls that may only appear at the top level. It
exists in **six mutually incompatible versions**, and one of them is in seven
documentation pages at once:

```
fill, level, plot, table                                    7 files
fill, level, plot                                           5 files
fill, plot, plotCandles                                     3 files
fill, level, plot, plotCandles                              2 files
fill, level, plot, plotCandles, table                       2 files
fill, leg.fixed, leg.relative, level, plotCandles, table    2 files
```

Four rounds of reconciliation have each read the documents, fixed every
contradiction found, and produced new ones. This is why. The rounds fixed prose,
and the highest-risk shape in the specification is not prose.

## Why it is frozen rather than fixed

`scripts/check-duplication.mjs` finds these mechanically and fails the build on a
set written out twice. Every one of the sixty-six is recorded in
`spec/value-set-exceptions.json`, so the build passes on what exists and refuses
anything new.

That is deliberate. A check introduced as a red build gets switched off. A check
introduced as a ratchet stops the problem growing on the first day and burns the
existing debt down on its own schedule.

## How it closes

Each set gets one home document, and every other file cites the home instead of
restating it. A citation names where the fact lives and says nothing about what is
in it: a sentence that summarises what it cites is still a copy, and it is a copy
that looks authoritative.

As each is given a home, its entry comes out of the exceptions file. The issue
closes when only the eight vocabulary entries remain.

## The debt

- `above`, `at`, `below`, `price`
- `above`, `below`, `price`
- `above`, `below`, `price`, `shape`
- `alert`, `background`, `barColor`, `cell`, `clear`, `print`, `signal`
- `alert`, `background`, `signal`
- `aqua`, `black`, `blue`, `brown`
- `area`, `histogram`, `line`, `lineWithMarkers`, `step`
- `arrowDown`, `arrowUp`, `circle`, `cross`, `diamond`, `flag`, `label`, `shape`, `square`, `triangleDown`, `triangleUp`
- `arrowDown`, `arrowUp`, `circle`, `triangleDown`, `triangleUp`
- `at`, `color`, `shape`
- `avgSkip`, `countPresent`, `sumSkip`
- `avg`, `max`, `min`, `pop`, `shift`
- `avg`, `max`, `min`, `stdev`, `sum`
- `book.lockProfit`, `book.stop`, `book.target`
- `bool`, `closeOnSessionEnd`, `false`
- `bool`, `false`, `overlay`, `true`
- `bool`, `number`, `text`
- `both`, `long`, `short`
- `bottomLeft`, `bottomRight`, `topLeft`, `topRight`
- `box`, `label`, `line`, `polyline`
- `buy`, `sell`, `stop`
- `call`, `put`, `right`
- `cash`, `equityPercent`, `lots`, `qtyType`, `string`, `units`
- `chart.expiry`, `chart.optionType`, `chart.strike`
- `chart`, `core`, `strategy`
- `check`, `lex`, `parse`
- `close`, `fillOn`, `nextOpen`, `string`
- `close`, `high`, `hl2`, `hlc3`, `low`, `ohlc4`, `open`, `volume`
- `close`, `hl2`, `hlc3`, `low`, `ohlc4`, `volume`
- `commissionType`, `perTrade`, `perUnit`, `percent`, `string`
- `commodity`, `currency`, `equity`, `future`, `index`, `option`, `other`
- `confirmed`, `developing`, `lookahead`
- `confirmed`, `developing`, `lookahead`, `mode`, `string`
- `cross`, `diamond`, `flag`, `square`
- `dashed`, `dotted`, `solid`
- `draw.box`, `draw.label`, `draw.line`, `draw.polyline`
- `ema`, `hma`, `rma`, `sma`, `vwma`, `wma`
- `ema`, `hma`, `rma`, `sma`, `wma`
- `everyUpdate`, `once`, `oncePerBar`
- `exchange`, `name`, `product`, `qty`, `side`
- `fast`, `medium`, `slow`
- `fill`, `input`, `level`, `plot`, `table`
- `fill`, `leg.fixed`, `leg.relative`, `level`, `plotCandles`, `table`
- `fill`, `level`, `plot`
- `fill`, `level`, `plot`, `plotCandles`
- `fill`, `level`, `plot`, `plotCandles`, `table`
- `fill`, `level`, `plot`, `table`
- `fill`, `plot`, `plotCandles`
- `format`, `percent`, `price`, `string`, `volume`
- `format`, `percent`, `price`, `volume`
- `fuchsia`, `gray`, `green`, `lime`
- `hl2`, `hlc3`, `hlcc4`, `ohlc4`
- `insert`, `push`, `set`, `unshift`
- `interval`, `price`, `session`, `symbol`, `time`
- `intraday`, `overnight`, `product`, `string`
- `left`, `none`, `right`
- `left`, `none`, `right`, `scale`, `string`
- `leg.stop`, `leg.target`, `leg.trail`
- `maroon`, `navy`, `olive`, `orange`
- `max`, `min`, `step`
- `percent`, `price`, `volume`
- `pink`, `purple`, `red`, `silver`
- `pos.equity`, `pos.netProfit`, `pos.tradeCount`
- `pos.isFlat`, `pos.isLong`, `pos.isShort`
- `short`, `string`, `title`
- `teal`, `white`, `yellow`
