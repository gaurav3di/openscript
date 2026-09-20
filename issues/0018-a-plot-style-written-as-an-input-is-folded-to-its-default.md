# 0018 A plot style written as an input() is folded to its default, silently

Status: open
Opened: 2026-09-20
Found by: attacking the chart adapter's new `settings` option, by writing an
`input()` into every declaration option in turn and asking which of them moved
Against: `spec/compiled-program.md`, whose `Plot.type` is a plain string where
every other plot field is a `Field` and can carry `{ "input": key }`
Also touches: `src/core/emit`, which folds the reference away, and
`src/core/check/library-output.ts`, which declares `style` a constant option
Severity: a study that compiles with no diagnostic, puts a row in the settings
dialog, and draws the same shape whatever the reader picks. It is input a user
can write and the documentation describes no such limit.

## What is wrong

`language.md` 13.4 says an `input()` may be written anywhere at the top level
that a value belongs, "as an option of the declaration statement" among them,
and `docs/inputs.md` teaches that as how a reader changes something the
declaration decides. Every plot option honours it, measured one at a time
against the compiled program:

```
w  = input(2, "W")                                    plot(..., width = w)     -> {"input":"w"}
sc = input("right", "Scale", options = [...])         plot(..., scale = sc)    -> {"input":"sc"}
fm = input("price", "Format", options = [...])        plot(..., format = fm)   -> {"input":"fm"}
st = input("line", "Style", options = ["line", "step", "area"])
                                                      plot(..., style = st)    -> "line"
```

The last one is the default, written out as a constant. The reference is gone by
the time the emitter is finished, so no engine and no adapter can resolve it:
the descriptor draws a line, the settings dialog offers the reader `step` and
`area`, and picking one changes nothing. No diagnostic is reported at any stage.

The same shape gives a second, sharper reading. A select whose options are not
plot styles at all is accepted:

```
st = input("dashed", "Style", options = ["solid", "dashed"])
plot(close, "C", aqua, style = st)          // no diagnostic, drawn as a line
```

Written as a literal, `style = "dashed"` is OS3008 naming the six accepted
values. Written through an input it is not, because the set check reads the
written value and an input reference is not one. That is the same gap OS3023 was
written for on the order side, reached from the declaration side.

## Why it is not fixed here

`Plot.type` is `readonly type: string` in the compiled format while `title`,
`color`, `width`, `lineStyle`, `offset`, `overlay`, `scale`, `precision` and
`priceFormat` are all `Field`. Widening it is a format change, and the format
version is the thing an engine in another language targets: `CLAUDE.md`'s two
version numbers section says what that costs. It is worth doing and it is not
worth doing inside a change about something else.

Until it is, the honest interim is a refusal where it is written, which needs
its own catalogue code: OS3008's fix template is "use one of {values}", and here
the value is not what is wrong, exactly as in OS3023's entry. Either answer is a
decision record of its own.

## What would close this

Either of:

- `Plot.type` becomes a `Field`, the emitter keeps the reference, and the
  adapter's `SERIES_TYPES` lookup reads it through the same `stringField` every
  other plot option already uses. A format version bump.
- A catalogue code refusing an `input()` in `style`, saying that a plot's shape
  is fixed before bar 0 in this format version, with a fix that tells a reader
  to write the style out.

Either way the set check has to see through a reference or stop being the only
thing guarding the option, because a select offering values `style` does not
accept is accepted today.
