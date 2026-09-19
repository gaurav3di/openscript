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
| [`12-strategy-short-premium.oscript`](./12-strategy-short-premium.oscript) | Strategy | A two leg position managed on the sum, inside the single instrument order model |

## What each one is for

**1. EMA cross.** The script every reader meets first. It exists to prove that
the ordinary case is short: no version ceremony beyond one line, no namespace
prefix on `ema`, no prefix on `aqua`, and one `signal("BUY")` where a shape plot
would take six positional arguments. It also fixes the rule that a stateful call
is made at the top level and used inside a branch, never the other way round,
and it is where a reader first meets a named plot: `fill` shades between two
declared columns and takes the handles those two names hold, so a band is always
written under the two plots it joins.

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
every timezone. Its shading switch is an `opacity` of zero rather than a colour
of `none`, because `fill` reads an absent colour as no colour given and falls
back to a default band. The switch is a number input passed straight into the
field, because a declaration field fixed before bar 0 holds a value or a bare
`input()` and not an expression over one.

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
each other. This is the script that found the version 1 boundary on orders: a
strategy trades the instrument on its chart and nothing else, so the chart
carries one leg, the script reads the other, and the second leg is routed by the
host from an alert. That is the shape `stdlib.md` section 17.1 defines, and this
script is written to it rather than around it.

## What the twelve did not need

Worth recording, because it is evidence that the defaults are set about right.

- No script needed `limits()`. The default per bar loop budget was never close.
- No script wanted recursion, a map, a matrix, or a `while` loop.
- No script wanted a block comment, a semicolon, or a chained comparison.
- The absent value did real work in scripts 2, 3, 5, 8 and 10, and in every case
  the rule that made it work was propagation rather than a silent zero.

## Gaps these twelve found

Written bluntly, because that is what the exercise is for. The list is in two
parts: what the specification still owes, and what has been settled since the
twelve were written, with the section that settled it. Everything in the second
part was a real gap when these scripts were first drafted, and recording the
answer is how a reader tells a decision from an omission.

### Still owed

1. **A drawing object cannot be read back.** `stdlib.md` section 14.4 lists
   sixteen ways to change an object and none to ask it anything, and does not say
   whether that is deliberate. Script 9 keeps four parallel arrays describing
   boxes it drew itself, because there is no way to ask a box where its edges
   are. Either add the reads, or state that these objects are write only, so
   nobody plans around the other answer.

2. **The library manifest does not exist.** `stdlib.md` fixes the name, the
   arguments, the result and the warmup of every function the twelve call, and
   its section 19 says the exact arithmetic, the seeding and the worked example
   live in a manifest that the compiler, the editor's autocomplete and the
   generated reference all read. Until that file exists, `ema`, `rsi`, `atr`,
   `pivotHigh` and the rest have a signature and no numbers, and nothing in this
   folder can be checked against a reference implementation.

3. **Where the next bar starts is not a fact.** `chart.intervalMinutes`
   (`stdlib.md` section 3.4) gives the interval, so script 9 could project a box
   one interval past the newest bar. It still extends only to the current bar's
   own time, because one interval past the last bar of a session is not where the
   next bar opens, and a projected box is looked at exactly there.
   `session.nextOpen` is the missing piece and is marked planned in section 12.4.

4. **A declaration field fixed before bar 0 takes one input and not an
   expression over one.** `language.md` section 13.2 admits a literal,
   arithmetic over literals or an `input()`, and `compiled-program.md` section
   2.3 carries either a literal or a reference to one input, so
   `opacity = shade ? 1 : 0` has no form to take even though a reader would
   expect it to work. Script 5 was written that way and has been changed to a
   number input passed straight in, which says the same thing inside the rules.
   Whether the language should grow a fourth form, an expression over inputs
   folded at load, is `issues/0003` and is not decided here.

### Answered since

Each of these was a hole when the twelve were drafted. The section named is where
the answer now lives, and the scripts have been brought to it.

- **`close` means two things.** `stdlib.md` section 3.2. The bare name is the
  series, the call form is the order function, and the checker tells them apart
  by syntax. Scripts 10, 11 and 12 use both spellings in one file.
- **The repaint mode is not named.** `stdlib.md` section 15.3 names
  `"confirmed"`, `"developing"` and `"lookahead"`, makes `"confirmed"` the
  default and attaches a warning to the other two. Script 7 states its mode as a
  literal.
- **Nothing reads equity.** `stdlib.md` section 17.4 carries `pos.equity`,
  `pos.netProfit` and `pos.openProfit`, with `pos.maxDrawdown` named and planned
  beside them.
- **Orders are single instrument, and the position facts are too.** Settled as a
  decision rather than as new surface. `stdlib.md` section 17.1 states that no
  order function takes a symbol, and that a position built from more than one
  instrument is one leg traded, the others read with `req.symbol`, and the
  decision routed by the host from an `alert`. Script 12 is written to that
  model. A per leg order form is a later objective, not a version 1 hole, because
  it needs per leg position facts and a fill model for bars that are not the
  chart's.
- **There is no symbol input.** `stdlib.md` section 13.1 names `kind = "symbol"`
  and marks it planned, so scripts 6 and 12 take a plain text input and say so in
  a comment. Calling a planned kind would be OS2001.
- **A time input cannot become a bar time.** `stdlib.md` section 13.3: a `"time"`
  input stores a wall clock string, so a saved layout restores to the same clock
  in another zone, and returns the instant it names as a number, so script 3
  converts nothing. Section 12.1 settles the zone question with it: every
  calendar field reads in `chart.timezone` unless a `zone` argument names
  another, which is the answer script 12's weekday test depends on.
- **Nothing writes a table cell.** `stdlib.md` section 14.3: `table` takes a
  title, `cell` writes one cell and `clear` empties the grid.
- **`fill` takes one colour.** `stdlib.md` section 14.2: `colorUp` and
  `colorDown` beside `color`, which is what makes a crossing readable at a
  glance. `color` with either of the other two is OS3010, no colour at all means
  the first plot's own colour faded to twelve percent, and `opacity` is a dimmer
  over whatever colour is there rather than a second way to write one.
- **`fill` names two plots, not two expressions.** `language.md` sections 5.4
  and 15.3 and `stdlib.md` section 14.2. A band is a field of the chart
  descriptor holding two plot keys, so there is no key for a column that was
  never declared and an expression in either position is OS3020. Scripts 1, 2,
  3, 5 and 11 name their two edge plots and pass the names. Script 5 switches
  its shading off with `opacity = 0` rather than a colour of `none`, because an
  absent colour reads as "no colour was given" and would still shade.
- **A fixed declaration field holds a value or one input, never an expression
  over one.** `language.md` section 13.2 and `compiled-program.md` sections 2.3
  and 3.5: such a field is settled before bar 0, so the compiled program carries
  either a literal or the reference `{ "input": "<key>" }`, resolved once at
  load. Check 10 of section 3.5 refuses a key no input declares with OS6018 and a
  resolved value the field will not take with OS6019. Script 8 passes a select
  input as a table's `position` on that rule, and script 5 declares its shading
  opacity as a number input rather than deriving one from a switch, because a
  bool does not fit a field that takes a number 0 to 1. `issues/0003` is the
  argument for a fourth form and against it.
- **`color` is a reserved word and also an argument name.** `language.md`
  section 3.4: a named argument label is matched against the callee's parameter
  list and is never looked up in any scope, so a reserved word is legal as one
  and OS1019 does not fire on it. Section 19's grammar admits `RESERVED` where a
  label goes. A parameter of a user function is still an ordinary identifier, so
  `fn f(color = red)` is OS1019. Scripts 4 and 9 write `color =` on that
  rule, and every input in the folder writes `min =` and `max =` on it too.
- **Drawing objects and tables have no type.** `language.md` section 5.4 splits
  the two kinds that were one word. `line`, `label`, `box`, `polyline` and
  `table` are runtime objects: ordinary values that go in a name inside a block,
  in a `var`, in an array and through a function. `plot`, `plotCandles`, `fill`
  and `level` return a declaration handle, a compile-time value that may be
  named at the top level and passed to `fill` and nowhere else. Section 19's
  `type` rule admits the object types and `array<objectType>`, and section 14.1
  gives an empty literal its element type from an annotation or from the first
  `push`, `unshift`, `insert` or `set`, which is what script 9's five untyped
  `[]` declarations rely on.
- **The placement lists disagree.** `language.md` section 15.3,
  `stdlib.md` section 14.1 and `errors.md` OS3006 now carry the same two sets:
  `plot`, `plotCandles`, `fill`, `level` and `table` are top level only under
  OS3006 and `input` under OS3007; `signal`, `alert`, `background`,
  `barColor`, `cell`, `clear`, `print`, the `draw` namespace and every order
  function may appear anywhere. Script 8 writes `cell` inside an `if` on the
  strength of all three rather than one. `plotCandles` is top level only because
  it declares a column and returns a plot handle, and `clear` is on the anywhere
  list in both its forms, the grid one and the array one; no script here calls
  either.
- **A blank line inside a block is undefined.** `language.md` section 3.10: a
  blank line and a comment only line carry no token and no indentation at all,
  so they never open a block, never close one, are never OS1003, accept any
  indentation including none, and never count as a body for OS1010. Scripts 8
  and 9 space their block bodies out on that rule, and a commented-out statement
  dragged to column zero no longer closes a block invisibly.
- **Per plot options are not enumerated.** `stdlib.md` section 14.2 lists
  `width`, `style`, `offset`, `scale`, `precision` and `format`, with the closed
  style list and the rule that a constant colour and a per-bar colour are the
  same argument.
- **An alert's shape is never stated.** `stdlib.md` section 16:
  `alert(message, id, title, frequency)`. The condition is the `if` that guards
  the call, not an argument to it, and the compiler lifts the chain of guards
  into the watched condition's predicate. Script 6 was written the other way and
  has been corrected.

Three of the four still owed are missing surface and required no change to the
shape of the language; the fourth asks for a form the language does not have, and
is filed rather than taken. The sixteen answered were missing decisions that have
since been made, which is the result this gate was looking for.
