# 0008 Every documented default in the calculation library is dropped at the call

Status: closed 2026-09-20
Opened: 2026-09-20
Found by: the phase three gate, writing the first study that omitted an optional
argument the specification says has a default
Against: `src/core/check/library-series.ts`, `library-bars.ts` and
`library-output.ts`, which write the library surface, and `src/core/emit/calls.ts`,
which turns an omitted argument into a constant
Also touches: `spec/stdlib.md` sections 4, 5, 6, 7, 9 and 14.3, which document
the defaults, and `spec/compiled-program.md` 4.10, which says where a default is
decided
Severity: a script written exactly as the specification documents it compiles
with no diagnostic, runs to the last bar, and draws nothing at all. It is input
a user can write, it is the first thing a reader of `stdlib.md` will write, and
there is nothing for them to ask.

## What is wrong

`spec/stdlib.md` documents an optional argument's default in the signature it
prints: `atr(len = 14)`, `rsi(src, len = 14)`, `bollinger(src, len = 20, mult = 2)`,
`stoch(len = 14, smoothK = 3, smoothD = 3)`, `cell(t, row, col, text, ..., align = "left")`.

The library surface the checker and the emitter read writes the same entries
without the default:

```
atr(len?: number) -> series number
rsi(src: series number, len?: number) -> series number
bollinger(src: series number, len?: number, mult?: number) -> array<number>
```

`emit/calls.ts` fills an omitted optional argument from `defaultOf(parameter)`,
which reads `parameter.defaultText`. With no default text it records a gap,
which is a note to this project and not a diagnostic, and pushes absent:

```
e.gap(
  'an omitted optional argument is emitted as absent, because the library surface records ' +
    'which parameters are optional and not what each one defaults to',
  'compiled-program.md 4.10, against stdlib.md section 1',
  call.span,
  false,
);
```

The gap is not blocking, so a program is emitted. At run time `lengthAt` answers
`null` for an absent length, and every function built on a lookback of `null`
answers absence on every bar, for ever, which is the right answer to a length
nobody gave and the wrong answer to a length the specification gave.

## The reproduction

```
version 1
study("Probe", overlay = false)
plot(atr(), "Omitted", red)
plot(atr(14), "Written", lime)
```

Compiles with nothing reported. `Written` first draws at bar 13. `Omitted` has
no value on any bar of any dataset.

Twenty entries were run through the engine over the gate's eighty bar fixture
and every one of them produced a column with no value anywhere: `atr`, `rsi`,
`bollinger`, `stoch`, `donchian`, `cci`, `roc`, `mom`, `macd`, `vwap`, `mfi`,
`chop`, `psar`, `supertrend`, `adx`, `aroon`, `trix`, `cmo`, `relativeVolume`
and `hv`. Forty-four entries in the surface have at least one optional parameter
with a documented default and no default text, so the list above is a sample.

`cell`'s `align` is the same mechanism on an argument that is not a length: a
cell written without one reaches the engine with `align` absent, where
`stdlib.md` 14.3 says it is `"left"`.

## Why it survived this long

Every script in `examples/`, every script in `tests/gate/scripts/` and every
study in the phase three gate passes its lengths explicitly, because a study
written to be compared against a reference states its parameters. Nothing in the
suite omitted one until now.

## Two ways to fix it, and the one that is right

1. **Write the defaults into the surface signatures.** The mechanism already
   exists and is already used: the four `draw` creation calls write
   `color?: color = gray`, `width?: number = 1`, `style?: string = "solid"`, and
   `defaultOf` parses exactly those forms for `bool`, `number`, `string` and
   `color`. Forty-four signatures gain a default each, taken from `stdlib.md`.
   The gap disappears because there is nothing left to report.
2. Refuse an omitted optional argument whose default the surface does not carry.
   That turns a silent wrong answer into a diagnostic, which is better than
   today, but it makes the specification's own documented form an error.

Option 1 is the fix. Option 2 is what the build should do to any entry option 1
misses, so that this cannot come back quietly: a surface entry with an optional
parameter and no default text is a defect in the surface, and a check can say so
without knowing what the default should be.

## What it is not

It is not the emitter's gap being wrong. The gap says precisely what is missing
and names both specifications. It is that a gap is a note between the people
writing this project and a user never sees one, so a non-blocking gap on a path
a user reaches every day is a silent wrong answer.

## What was changed

Option 1, with option 2 as the build's answer to anything it misses.

**The defaults are in the surface.** A hundred and sixty optional parameters
across `library-bars.ts`, `library-series.ts`, `library-output.ts` and
`library-orders.ts` now carry the default `stdlib.md` prints, spelled as the
table spells it so the two still compare by eye. With the twenty-one the four
`draw` calls already carried, that is a hundred and eighty-one of the hundred and
ninety-eight optional parameters outside a declaration call.

**Four of them are not constants.** `vwap(src = hlc3)`, `zone = chart.timezone`
on the calendar, `exchange = chart.exchange` on a symbol read and
`price = close` on the sizing helpers are names the compiler reads at the call,
which `compiled-program.md` 4.10 already provides for: a default that is an
expression is compiled into the call site. `emit/calls.ts` emits the same read a
written argument would have emitted, so `vwap()` and `vwap(hlc3)` are now the
same program instruction for instruction.

**The warmup follows the default.** `warmupOfCall` read a length only from a
written argument, so an omitted one weakened the warmup to a floor: `atr()`
promised "no earlier than bar 0" where `atr(14)` promised bar 13. It reads the
default now, and a warmup is a promise about exactly which bars are absent
rather than a bound.

**The declaration calls are not in this.** `plot`, `level`, `fill`, `table`,
`plotCandles`, `input`, `signal` and `alert` do not pass their optional
arguments to anything: each becomes a field of a declaration in `outputs`,
written with the value it resolved to (2.3), and those values already have one
home in `src/core/emit/defaults.ts`. Carrying them in the surface as well would
be the same fact in two files.

**The class is closed by `scripts/check-defaults.mjs`**, which `npm test` runs
after the build. An optional parameter must carry the default the specification
states, or be recorded in `spec/default-exceptions.json` with what the
specification says in place of a value and why that is not one. Neither is a
defect, both is a contradiction, a default the surface invented is a defect, and
a default that has drifted from the specification is a defect. The declaration
calls are excluded by the set the emitter exports rather than by a list here, so
the exclusion cannot grow to cover a call whose defaults nobody recorded
anywhere.

Seventeen parameters are recorded as stating no value. Sixteen are the leg an
order acts on and the size the `strategy()` declaration sets, which are facts
about the file rather than about the library. The seventeenth is `req.candle`'s
`mode`, whose row in 15.1 prints no default where the two reads beside it in the
same table print `mode = "confirmed"`. That is reported rather than guessed: a
mode this compiler invented would be a repainting rule nobody wrote down.
