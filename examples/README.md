# Examples

Twelve scripts, written by hand against [`spec/language.md`](../spec/language.md)
before any compiler exists. They are the phase 0 gate in
[`ROADMAP.md`](../ROADMAP.md): if the language cannot express these cleanly, the
language changes now rather than later.

Nothing here has been run. A script in this folder is a claim about what the
language can say, and every construct it uses is either in the specification or
listed at the bottom of this file as something the specification still owes.

The file extension is `.oscript`.

Each file opens with what it does and which language feature it is there to
exercise. Comments inside a script say why a line is written the way it is, not
what the line does; a reader who wants to know what `ema` is has the library
reference for that.

## The twelve

| File | Is | Proves |
|---|---|---|
| [`01-ema-cross.oscript`](./01-ema-cross.oscript) | Study | The smallest useful script: inputs, two library calls, two plots, a band, a marker |
| [`02-supertrend.oscript`](./02-supertrend.oscript) | Study | A self referencing band, bar colouring, and a plot hidden by absence |
| [`03-anchored-vwap.oscript`](./03-anchored-vwap.oscript) | Study | A user picked anchor, cumulative state, and absence as "not started" |
| [`04-rsi-divergence.oscript`](./04-rsi-divergence.oscript) | Study | Pivots, the lag they carry, and geometry drawn between two points in the past |
| [`05-opening-range.oscript`](./05-opening-range.oscript) | Study | Session handling and state that resets on the day's first bar |
| [`06-combined-premium.oscript`](./06-combined-premium.oscript) | Study | Reading two instruments that are not the one on the chart |
| [`07-higher-timeframe-bias.oscript`](./07-higher-timeframe-bias.oscript) | Study | A coarse timeframe read that states its repaint mode in the source |
| [`08-dashboard-table.oscript`](./08-dashboard-table.oscript) | Study | A pinned grid, a user function, and the condition form of `switch` |
| [`09-supply-demand-zones.oscript`](./09-supply-demand-zones.oscript) | Study | Drawing objects created, mutated and deleted over hundreds of bars |
| [`10-strategy-ema-cross.oscript`](./10-strategy-ema-cross.oscript) | Strategy | Orders, a bracket, and sizing from the distance to the stop |
| [`11-strategy-opening-range.oscript`](./11-strategy-opening-range.oscript) | Strategy | One trade per session, a bracket, and an exit on the clock |
| [`12-strategy-short-premium.oscript`](./12-strategy-short-premium.oscript) | Strategy | Two legs entered and exited together under one combined stop |

## What each one is for

**1. EMA cross.** The script every reader meets first. It exists to prove that
the ordinary case is short: no version ceremony beyond one line, no namespace
prefix on `ema`, no prefix on `aqua`, and one `signal("BUY")` where a shape plot
would take six positional arguments. It also fixes the rule that a stateful call
is made at the top level and used inside a branch, never the other way round.

**2. Trailing volatility stop.** The first script that needs the past. Its two
bands are defined in terms of their own previous values, which is the shape that
breaks in a language where absence is not thought through: without `orElse` the
first bar's absent comparison would leave both bands absent for the rest of the
dataset. It also proves that a stop which changes sides has to be two plots with
a gap in each, because one column of numbers cannot change colour halfway along,
and it is the first script to recolour the price candles.

**3. Anchored VWAP.** Proves a user can pick a date and the script can read it.
Three running totals in `var` do the work, which is only safe because of the
rollback rule: on a live chart the newest bar executes on every tick, and the
totals have to count bars rather than ticks or the chart and the backtest would
disagree. The bands prove that a function with no real answer returns absence
rather than failing, and that a script can choose to floor the input instead.

**4. RSI divergence.** The first script that draws geometry rather than a
column. It proves three things: that a pivot's lag is visible in the source
rather than hidden, that a drawing anchors to a bar time because a bar index
moves when older history is paged in, and that a bar index is still the right
thing to subtract when both ends come from the same run.

**5. Opening range.** Session handling with no calendar at all. The range resets
on the session's first bar rather than on a date change, because an evening
session that runs past midnight is one session and two dates, and the window is
measured in milliseconds since the open so the script says the same thing in
every timezone.

**6. Combined premium.** Two instruments that are not on the chart, added
together. The important line is the addition: if one leg has no bar at this time
the total is absent rather than half a position, which is exactly why absence
propagates through arithmetic instead of being absorbed.

**7. Higher timeframe bias.** The honesty script. The three readings of a coarse
bar are spelled out in the comment and the mode is a literal in the source, not
a setting, because a setting would let a reader change the honesty of the study
without reading it. It also states why this file does not set `onUnconfirmed`.

**8. Dashboard.** A study that is not a value per bar at all. It proves the grid
is declared once, before the first bar, like a plot; that the cells are written
only on the newest bar, because a panel shows one state and writing it fifty
thousand times to display the last one is fifty thousand wasted writes; and that
a warming up reading has to say so rather than render as a confident "down".

**9. Supply and demand zones.** The drawing heavy case. Zones are created at a
pivot, extended on every bar while they hold, and deleted when price closes
through them or they age out. The list is walked downwards with `step -1` so a
removal cannot skip the next element. It declares no plot at all, which the
chart contract allows and which is the honest shape for a study whose entire
output is geometry.

**10. EMA cross, bracketed.** The same crossing as script 1, traded. It proves
that a strategy is a study with orders and that the plotted numbers and the
traded numbers are computed once, in one file. The size comes from the distance
to the stop so that every trade risks the same amount, and the stop and target
are held in `var` so the plotted lines are the levels that were actually sent
rather than levels recomputed from today's volatility.

**11. Opening range breakout.** One trade per session, with the far side of the
range as the stop because that is the level the market drew. Its exit is the
clock, which is neither a stop nor a target but the admission that an intraday
position that has not worked in five hours is not going to.

**12. Short premium.** Two legs sold together and managed as one position. The
stop is measured on the sum of the two prices, because stopping each leg
separately is the classic way to take two losses on a day the legs were hedging
each other. This is the script that strains hardest against the current
specification; see gaps 7 and 8 below.

## What the twelve did not need

Worth recording, because it is evidence that the defaults are set about right.

- No script needed `limits()`. The default per bar loop budget was never close.
- No script wanted recursion, a map, a matrix, or a `while` loop.
- No script wanted a block comment, a semicolon, or a chained comparison.
- The absent value did real work in scripts 2, 3, 5, 8 and 10, and in every case
  the rule that made it work was propagation rather than a silent zero.

## Gaps these twelve found

Written bluntly, because that is what the exercise is for. Each one is a change
the specification needs before a compiler is written against it.

1. **The standard library is not specified.** Section 15 fixes the shape of the
   library and says the per function reference is generated from a manifest. The
   manifest does not exist, so all twelve scripts assume names and signatures:
   `ema`, `sma`, `rsi`, `atr`, `stdev`, `highest`, `lowest`, `crossUp`,
   `crossDown`, `pivotHigh`, `pivotLow`, `sqrt`, `floor`, `max`, `min`, `text`,
   `isNone`, `orElse`, `fade`, and the array operations. Until the manifest
   lands, none of that can be checked.

2. **`color` is a reserved word and also an argument name.** Section 3.4
   reserves `color`; section 15.3 writes `plot(value, "Title", color = aqua)`
   and `fill(upper, lower, color = fade(aqua, 88))`. The grammar in section 19
   requires an IDENT before `=` in an argument, and a reserved word is not one,
   so the specification's own examples do not parse. `step` has the same
   problem: it is reserved by `for`, and it is the natural name for a number
   input's increment. Either drop both from the reserved list, neither being
   needed as a keyword outside its own statement, or rename the arguments.

3. **`close` means two things.** Section 15.1 makes `close` a built-in series;
   section 13.3 and the project README flatten a position with `close()`.
   Section 12.4 treats a built-in as one name in the global scope. Scripts 10
   and 11 use both meanings in the same file. Either the specification states
   that the call form resolves to the order function and the bare form to the
   series, or the order function is renamed.

4. **Drawing objects and tables have no type.** Section 5.1 lists `number`,
   `string`, `bool`, `color`, `none`, `series T` and `array<T>`, and the type
   grammar allows an array only of those. Scripts 4, 8 and 9 need a value that
   is a line, a label, a box or a table, and script 9 needs an array of boxes
   with no annotation it can write. Add the object types, and let `array<T>`
   name them.

5. **A drawing object cannot be read back.** Script 9 keeps four parallel arrays
   describing boxes it drew itself, because there is no way to ask a box where
   its edges are. Either add the reads, or say in the specification that these
   objects are write only, so nobody plans around the other answer.

6. **The repaint mode is not named.** Section 15.2's example is
   `req.timeframe("1D", high)`, with no mode at all, while the project promises
   that a higher timeframe read states whether it repaints. Script 7 assumes a
   `mode` argument taking `"closed"`, `"forming"` or `"final"`, defaulting to
   `"closed"`. The specification has to name the three, fix the default, and
   then either accept its own example or change it.

7. **Nothing reads equity.** Script 10 risks a cash amount per trade because a
   script cannot ask what its equity is. Percent of equity risk sizing, which is
   how most position sizing is actually described, cannot be written:
   `qtyType = "equityPercent"` sizes a whole order, not a risk measured against
   a stop distance. `pos` should carry equity, or `strategy` should.

8. **Orders are single instrument, and the position facts are too.** This is the
   largest gap. Script 12 sells two legs that are not the chart's instrument,
   and `pos.size`, `pos.avgPrice` and `pos.profit` have no per leg form, so the
   script tracks its own flag and cannot ask the engine what it is holding. The
   fill model has the same hole: `fillOn = "nextOpen"` is defined against the
   chart's bars, and nothing says what fills an order in an instrument whose own
   bars are the ones that matter. Multi leg strategies are a stated objective,
   so this needs a section of its own.

9. **There is no symbol input.** Section 13.4 covers a number, a source, a bool,
   a colour, an options list and an interval. Scripts 6 and 12 need the user to
   pick an instrument, and assume `kind = "symbol"`.

10. **A time input cannot become a bar time.** Script 3 takes a wall clock
    string and needs `date.fromString` to turn it into a timestamp. The `date`
    namespace is described as calendar fields and construction from a timestamp,
    which is the other direction. The same paragraph has to settle which zone a
    calendar field reads in: section 5.1 says time is UTC, section 15.2 says
    `chart.timezone` exists, and nothing says which one `date.dayOfWeek(time)`
    uses. Script 12 depends on that answer.

11. **Nothing writes a table cell.** Section 15.3 lists `table` among the top
    level only surfaces and names no call that fills it. Script 8 assumes a bare
    `cell(...)` usable anywhere, which also means section 15.3's second list
    needs a row for it.

12. **`fill` takes one colour.** The chart contract carries two, one for each
    side of the crossing, which is what makes "the fast average is above the
    slow one" readable at a glance. Script 1 wanted that and could not write it.

13. **Per plot options are not enumerated.** `width` and `style` appear only in
    an example, and a plot that belongs on a different scale, or is drawn at an
    offset, has no stated spelling, though the chart contract supports both.

14. **There is no bar duration.** Script 9 extends its boxes to the current
    bar's own time rather than one bar past it, because nothing exposes the
    interval in milliseconds. `time - time[1]` is right intraday and wrong
    across a session gap, which is exactly where a projected box is looked at.

15. **An alert's shape is never stated.** Section 6.6 refers to "an alert
    condition", so script 6 writes `alert(condition, message)`. That is a guess.

16. **A blank line inside a block is undefined.** Section 3.10 says every line
    of one block carries exactly the same leading whitespace, and a blank line
    carries none. Scripts 8 and 9 both space their block bodies out, so the
    lexer has to state that a blank line and a comment only line are skipped
    before indentation is measured, or a great many readable scripts will fail
    to parse for a reason nobody will guess.

None of these sixteen required a change to the shape of the language. They are
missing surface rather than wrong decisions, which is the result this gate was
looking for.
