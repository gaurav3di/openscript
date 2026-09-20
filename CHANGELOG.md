# Changelog

What changed in each release, written for somebody deciding whether to upgrade.

This file is checked at release: a version with no entry, or an entry that says
nothing, fails the build before it can become permanent.

---

## Unreleased

**An alert's message now carries the bar that fired it.** A study that computed
`"crossed up at " + text(close, 2)` sent a notification reading "Crossed up", the
declared title, on every alert this adapter has ever raised. The message is a
string per bar, so it cannot travel in the table of numbers a calculation
returns, and it was left out on the ground that nothing carried it across. The
chart's own entry takes a function of the same context its condition was judged
on, and that context carries the settings object, which is how every other hook
here finds the run it is reading. So the message is read from the run at the bar
that fired, and an alert whose message was absent on that bar still falls back to
the title, which is what a chart does for an entry that states no message at all.

**A `draw` setter now takes only the objects it can move.** Eleven of the
fourteen setters declared their object argument as "whatever you give me",
because the real type is a set of kinds and there was no way to write one. So
`draw.setFrom(aLabel, t, p)` compiled, wrote an anchor a label has no field for,
drew nothing and reported nothing, and `draw.setColor(5, red)` compiled as
readily. Each setter now names the kinds that carry the property it writes, which
is the kinds whose creation call takes that argument, and a call that misses is
OS3011 at that argument with the kinds it does take in the sentence. A
declaration handle in the same place keeps OS3019. Two documentation tables
promised more than any kind carries, `setStyle` on a box and `setTooltip` on a
line, and they now say what is drawn.

**A second declared grid is still dropped, and the drop is now written down and
checked.** A chart pane has one grid and the language declares as many as it
likes, so a study with two panels draws one, and nothing said so anywhere. The
refusal that belongs there cannot be written: it needs a catalogue code for a
host that cannot draw something a study declares, the catalogue has none, and
this project reports the gap rather than inventing one. It is reported in
`issues/0011`, with the sentence the entry should carry, and the documentation
for tables now tells a reader that the first declared grid is the one drawn.

Meanwhile the class is checked instead of promised. `spec/chart-narrowings.json`
records every field and every count the chart adapter does not carry, each with
its reason, and `scripts/check-chart-surface.mjs` compiles a study that declares
two of everything, builds a descriptor from it, and fails the build on a declared
field the record does not mention, a record entry the compiled format no longer
has, a narrowing recorded with no reason, and any declaration dropped whose limit
is not recorded. It also reads the mapping back out of a run, so a field recorded
as carried cannot be a claim. The record began with eight narrowings, one of them
found by writing it: a band whose colour is computed per bar has no per-bar colour
in a chart's band and is drawn in the first plot's colour.

**Every documented default now reaches the call.** `atr()`, `rsi(close)`,
`bollinger(close)`, `macd(close)`, `stoch()`, `psar()`, `supertrend()`, `adx()`,
`keltner()`, `donchian()`, `cci()`, `williamsR()` and the rest: twenty-nine calls
out of thirty-one, written exactly as the library reference prints them,
compiled with nothing reported, loaded with nothing reported, ran to the last bar
and drew no value on any bar. The reference gives each of those arguments a
default, the surface recorded only that the argument was optional, and an
argument left out reached the engine as absence, where a lookback of an absent
length answers absence for ever. Only the calls whose length was written out drew
anything.

The hundred and sixty missing defaults are now written into the surface, taken
from the reference, and an omitted argument is filled with the value the
reference prints. `vwap()` reads `hlc3`, a calendar call reads the chart's
timezone, and a grid cell written with no alignment is aligned left, each exactly
as writing the argument out would have done. A warmup follows its default too: an
omitted length used to weaken a study's warmup to a floor, so `atr()` promised
"no earlier than" where `atr(14)` promises bar 13. Both now promise bar 13.

A check refuses the class rather than the instance. An optional parameter must
either carry the default the specification states, spelled as the specification
spells it, or be recorded in `spec/default-exceptions.json` with what the
specification says in place of a value and why that is not one. Neither is a
defect and both is a contradiction, and a default the surface invented or one
that has drifted from the specification fails the build as well. Seventeen
parameters are recorded: the leg an order acts on and the size the `strategy()`
declaration sets, which the library has no value for, and one row that states no
mode where the two beside it do.

**The library the reference page promises now runs.** Ninety-five names compiled
and were then refused at load with an error that named a function and gave no
reason. Every one of them is settled: it either runs or says it is planned at the
call, where you can see what you wrote.

Sixty-three names that could not run now do. The moving averages `dema`, `tema`,
`vwma`, `swma`, `alma`, `linreg` and `ma`; the trend frames `psar`, `adx`,
`aroon` and `ichimoku`; the oscillators `stoch`, `stochRsi`, `ppo`, `cci`,
`williamsR`, `tsi`, `trix`, `cmo`, `dpo`, `ultimateOsc` and `awesomeOsc`;
`keltner`, `chop` and `hv`; the whole of the volume section, `vwap` and
`vwapAnchor` among it; `percentRank`, `correlation` and `covariance`; every
calendar call in `date`, and `session.isIn` with them; and the six instrument
facts `chart.timezone`, `chart.pointValue`, `chart.currency`,
`chart.instrumentType`, `chart.hasVolume` and `chart.hasOpenInterest`.

The arithmetic for the studies was already written and gated against reference
vectors; what was missing was a form an engine could drive a bar at a time, so
each one is now a step over a state region like the rest of the library, and its
whole-series form is that step folded. There is still one implementation of every
formula, and the engine holds none of it.

The calendar is new. It reads an instant in a named zone using the runtime's own
timezone database rather than a table copied into this package, because a copied
table goes stale silently in exactly the way a fixed offset does. Two readings
that have no single instant are settled in the specification rather than left to
an engine: an hour a spring change removed resolves to where it would have been,
and an hour an autumn change repeated resolves to the first of the two.
`date.weekOfYear` is the ISO week, which the specification now states.

Fifty-nine names are now marked planned instead of failing at load. The strategy
surface, everything in `order`, `leg` and `book` that is folded from a ledger, and
the position facts beyond the five an engine reads from the account's own row: no
engine holds a ledger in this release. So are the four session facts read off the
instrument's trading hours, which the engine's host record does not yet carry.
Nothing was removed from the specification; a marked name is refused where it is
written, with a message saying it is planned.

A test now fails the build if a name the checker accepts can neither run nor says
it is planned, so this cannot come back quietly.

**Three diagnostics now say what is true.** Calling or reading a name the library
lists as planned reports OS2020, whose message says the name is planned. It used to
report OS2001, which told a reader the name was not defined at this point in the
file and offered them a different function as the fix. OS2004 no longer tells a
reader to assign the value to a name at the top level in the case where it already
is one: a declaration handle, a runtime object and a library fact that is not a
series have no history whatever they are named, and the fix now says so. OS6016 no
longer describes a program below the engine's format as though it were above it,
and says that the major number decides in either direction.

**The integration guide described a surface the engine does not have.** The page on
running the engine told an integrator to hand over columnar arrays, one per field.
The engine takes one object per bar, so code written from that page did not compile
against the library. The page now describes the surface as it is, and the memory
case it was making, which is real and unanswered, is measured in `issues/0005`.

**Higher timeframe and other instrument reads run.** A file containing one used
to compile, carry its capability tag, and be refused at load with a message
naming the capability. The engine now evaluates a read's expression over the
requested bars and folds the result onto the chart's, so `req.timeframe`,
`req.symbol`, `req.isReady` and `req.error` do what the reference page says.

A read of the chart's own instrument at a coarser interval is folded from the
bars the engine already holds and needs nothing from a host. A read of another
instrument needs bars only a host can supply, so a host states a request provider
and an engine without one still refuses exactly those files, by name, at load:
that path is what an older engine uses to tell a newer file what it lacks, and it
is kept and tested.

**The three modes produce three different numbers, and the difference is the
whole repainting question.** A `"confirmed"` read takes the last coarse bar that
closed and steps on the first chart bar of the next one, so it never uses a bar
that had not happened. A `"developing"` read is the coarse bar as it stands on
this chart bar. A `"lookahead"` read is the coarse bar in full, from its first
chart bar, which is why it repaints. The first two stop at the bar being executed,
so a chart given a whole dataset and a chart given one bar at a time compute the
same numbers; the third reads past the bar, which is the mode.

**Read the default twice if you have written `[1]` inside a read.**
`req.timeframe("1D", high)` is yesterday's high, because `"confirmed"` is the
default and it takes the last day that closed. `req.timeframe("1D", high[1])` is
the day before that. Three documentation pages had those one day apart and said
so in words; they now say what the specification has said all along, and the
previous-session example no longer takes the extra step back.

A read's warmup is counted in requested bars rather than chart bars, because the
expression runs on the requested ones: `req.timeframe("1D", sma(close, 20))` is
absent until twenty daily bars have closed, which on an intraday chart is about a
month of history. A day, a week and a month are folded by the calendar, so a read
at one of them needs the instrument's timezone and is absent without it rather
than dated in a zone nobody chose.

A request that cannot be folded is refused at load with the code that names it,
OS6002 for one finer than the chart and OS6015 for one that is not a whole
multiple of it, and a timeframe a setting supplied that is not a timeframe is
OS6001. A refusal from the host is not: an unknown instrument, a range with no
bars, a source that would not answer and an interval the feed does not carry
leave the read absent, put the host's own words in `req.error(read)`, and let the
rest of the study keep drawing. A host's ceiling on how many reads a file may make
is OS5006 at load, with the count named rather than reads dropped quietly.

The compiled format gains no field. What it gained is section 2.16.2, the fold
itself: which requested bar each chart bar may see, written out so that a second
engine computes the same number rather than inventing its own alignment.

**A read's expression is verified like the program it sits in.** The same
interpreter walks it over another instrument's history, so its tables, its
instruction list and the lists of the functions it calls all go through check 1
and check 8. A body that was not verified could jump out of its own instruction
list, and the failure would have looked like a wrong number.

**Every output a study can produce now reaches a chart.** Markers, bar colouring,
the pane background, summary grids, watched conditions, drawing objects and reads
of another instrument were all fields the compiled program carried and the chart
adapter left empty, so a study that called `signal`, `barColor`, `background`,
`cell`, `alert`, `draw.line` or `req.symbol` computed everything and drew none of
it. Each of them is mapped onto the field the chart already has for it, under the
chart's own name for that field and taking the chart's own argument.

A marker arrives with its text, its declared shape and position and the bar's own
time, and only for the bars its branch was taken on. A bar colour and a background
arrive as columns of colours beside the plot columns, so a spliced tail carries
them. A grid arrives as the last executed bar left it, read once per calculation
rather than once per bar, which is the difference between a constant cost and the
length of the history, and its cells are placed into the declared size so that a
cell nothing wrote is blank rather than missing. A watched condition arrives as a
row a user can subscribe to, under the `id` the script gave it, whose predicate
reads the guard chain out of a column.

**A study's drawing objects are handed to the chart as a set, and the set is
replaced every time.** A line, a label, a box or a path the script created, moved,
recoloured and deleted over many bars arrives as the shapes it currently holds,
in the order it created them. Nothing has to tell the chart about a deletion, and
a bar that re-executed five times leaves what one execution of it leaves, because
the engine has already rolled the set back. An anchor crosses as a time and a
price, converted into the seconds a chart counts exactly where a bar's time is,
and an anchor past the newest bar stays where it was written so a projection
reaches into the margin. An anchor missing its time or its price draws nothing,
and a path with a hole in it becomes one shape per stretch that has none, rather
than a line through prices the script never named.

**A read of another instrument fetches through the chart, and the study draws
while it waits.** The engine settles every read before bar 0 and asks the host
there and then; a chart answers later, and a chart computes a study once before
it attaches the lifecycle that has the transport. So the first calculation says
"not yet", the read is absent, `req.isReady` is false and everything that does not
depend on the read is drawn; the answer asks for the recompute that uses it. The
range asked for covers the chart's own span, extended back by the read's warmup
and quantised to requested bar boundaries, so a chart that ticks does not fetch
once per bar, and what was fetched keeps serving while a wider fetch is in flight.
A host that refuses is carried through as its own words, in `req.error` for the
script and in the study's data status for the user, with a retry offered.

**An alert fires for now and never for history.** Adding a study to a chart
holding two years of bars fires nothing for any of them. The rule is in the
specification rather than in a host: an alert is raised only on a bar the host
states it is driving live and has confirmed, and `isRealtime` is a fact the host
already states for every execution. The frequency is the engine's too: `once` is
once for the life of the study, `oncePerBar` is once for a bar however many times
that bar executes, and `everyUpdate` is once per execution. A host whose own
runtime watches the declared conditions applies the same rule from its side, by
judging only the bars that are new since it last looked.

**A marker no longer appears on a bar that is still moving.** The channel
carrying it was published for every bar whatever the bar's state, so a host
reading the column drew the marker on a tick and took it off on the next one.
Step 9 discards a deferred channel on a bar it did not decide, and the columns a
host reads now say so. Plot columns are unaffected and are still published on
every execution.

**Which study owns the candles is a stated rule.** The instrument's bars are one
object and two studies painting them are two answers to one question. The owner
is the study latest in the chart's own study order that paints, which is the
order a legend shows and a user reorders, so it does not change because one
study recomputed before another. Every other study's bar colouring is not drawn.

**Five declaration options that could not be carried now say so at the line that
wrote them.** A level's colour, a grid's two colours and an alert's `id`, `title`
and `frequency` are written into the program before the first bar, and one
computed from bar data used to reach the compiler with nowhere to put it: it
reported OS6018, which says the program is malformed and asks the author to
report a compiler defect. They are checked with OS3003 like every other fixed
option, which names the option and says what to write instead.

**A colour built out of constants counts as one.** `fade(red, 50)` is the same
four numbers on every bar, and it is what a level or a marker is normally
coloured with. The checker accepts exactly the six colour calls the compiler
folds, so a field that has to be fixed before bar 0 can hold one.

**Two alerts can no longer share one name.** A subscription is kept under the
alert's id, so two entries under one name left the host with two conditions and
one row and nothing to say which the user subscribed to. It is OS3017, the same
code two plots sharing a title get, and it counts the derived name as well as
the written one. An id taken from an `input()` is derived rather than used, for
the reason OS8008 now gives: a name that moves when somebody opens the settings
dialog is not a name a subscription can be kept under. A derived id is now taken
from the call's line, which is what OS8008 said all along.

**The trailing stop in the volatility example drew nothing.** The band trails
against the band as it stood, and `max` and `min` propagate absence like every
other calculation, so the first bar after the average warmed up trailed against
an absent band, the band went absent, and the next bar's previous band was that
absence. The study ran, kept its legend row and plotted an empty column for the
rest of the dataset. The example reads the previous band through `orElse` in the
trail as well as in the comparison, and a test fails the build if that column
stops being drawn.

**A cell alignment that is not one of the three is refused.** `align = "middle"`
compiled and was silently drawn left for ever. It is OS3008, which names the
three and suggests the nearest.

**Drawing objects are live.** Lines, labels, boxes and polylines are created,
moved, extended, restyled, deleted and counted as bars arrive. Thirty-one calls,
every one of them driven bar by bar in the tests, and the lifetime rules the
specification states are now the ones the engine keeps.

Three of those rules decide what a study looks like on a live chart. An object
created while the newest bar was moving is rolled back when that bar runs again,
along with every change made to an object that already existed, so five updates
and a confirm leave exactly what one pass leaves and a live chart does not gain a
copy per tick. A setter given an object the script already deleted is OS4005 with
the bar it went on, rather than a silent no operation that leaves a drawing that
quietly stopped moving; a setter given `none` does nothing, which is what the
catalogue's own fix for OS4005 asks a script to produce. An anchor is a time and
a price and is never resolved against a bar, so an anchor past the newest bar
reaches into the margin and an old one does not move when more history loads.

**A ceiling on drawing objects, reported rather than absorbed: OS5010.** An
object lives until the script deletes it and nothing can reclaim one that is
still drawing, so a script that creates one per bar and deletes none used to grow
until the machine stopped it. It now stops with a diagnostic that names the
ceiling and the count. The ceiling is the host's, as the string ceiling is; the
language still fixes no number and nothing is ever dropped to make room, which is
the part that would make a study wrong on the left of the chart and right on the
right.

**An argument a drawing call leaves out now arrives as the default the
specification gives it.** `draw.line(t1, p1, t2, p2)` used to reach the engine
with an absent colour, an absent width and an absent line style, and absence on a
drawing surface means nothing is drawn. The library surface carries these four
calls' defaults and the compiler writes them into the program, so an engine needs
no table of them.

**A polyline keeps its own path.** The two arrays are read once, at the call, and
`draw.setPoints` is what changes a path, so pushing to an array a script kept for
its own bookkeeping no longer silently redraws a shape. The arrays are paired by
index, and a point missing a time or a price is a gap in the path rather than a
point dropped.

**`Engine.drawings()` hands a host facts instead of heap contents.** Each live
object arrives as its kind, its anchors in time and price, and its style, in
creation order. A host no longer dereferences anything, which it had no way to
do: a polyline's path was a handle into the engine's own heap.

**Two library calls no script could make are now callable.** The conversions to
`bool` and to `number` were published under those names, and both are reserved
words, so every spelling of them was refused before the checker saw one, with a
message about naming a variable handed to somebody who had written a call. They
are now `toBool(x)` and `toNumber(s)`. `text(x)` is unchanged: it is not a type
name, so it never collided.

If you wrote either old spelling it did not compile, so nothing that ran before
stops running. Writing one now is still OS1019, and the fix names the spelling
that works instead of telling you to rename a variable you never declared. The
rule behind it is in the specification: no library name is a reserved word, and a
test fails the build if one ever is again.

**The no-eval check can no longer be got past.** The first rule of this project is
that nothing here builds code out of text, and the check enforcing it knew only
the obvious spellings. It now refuses the function builder however it is reached,
including through `call`, `apply`, `bind`, `Reflect.construct` and a constructor
property taken as a value; a name looked up on the global object by computed key;
the runtime's own compiler reached through a binding rather than by naming its
module; code assembled out of bytes; text put into a document; and a module
specifier built out of text. It reads the git hooks and the compiled tests as
well, which it never did. Before reading a file it puts forty-eight attack forms
through its own rules and stops the build if one is not caught, or if an innocent
form is.

**The build removes output that no source makes.** A compiled module from a
layout two refactors old was still in `dist`, which `package.json` publishes, so
the package carried a file no source produced, no test covered and nothing here
explains. Every build now names and removes any such file before it compiles,
in both outputs, reading the directories from the compiler's own configuration
rather than from a copy of them.

**OS8001 now reaches a call that could be written past it.** The warning for a
stateful call that runs on some bars and not others was decided by the pass that
walks statements, so it saw an `if`, a `switch` arm and a loop body and nothing
else. `v = trending ? ema(close, 20) : none` compiled with nothing reported and
drew an average of the bars the guard let through, presented as an average. The
warning now covers a ternary arm, both of them; the right operand of `and` and
`or`, which is skipped whenever the left one has already decided the answer; the
condition of an `else if`; and the values of a `case` arm after the first. Each
of those is a place a bar can pass without evaluating the call, and the engine
always ran them that way. What was missing was the compiler saying so.

A file that compiled clean before can report OS8001 now. Nothing it computes has
changed, and the fix is the one the warning already names: take the call at the
top level and use its result inside the guard.

## 0.1.0-alpha.1

The first release published by the automation rather than by hand.

Fixes a version skew that would have bitten anybody running the tests on a
different runtime than the author. Test discovery passed a glob to the runtime's
test runner, which expands it on a recent version and treats it as a literal path
on an older one, so the suite silently found no files and reported success.
Discovery now walks the filesystem in code, and finding zero test files is a
failure rather than a pass.

The supported runtime floor moves to Node 22. Node 20 reached end of life earlier
this year, and supporting a runtime nobody should be running was forcing a worse
test setup.

The build now reports two version numbers of its own: the package version, so a
bug report can establish which build produced a number, and the compiled program
format version, so an engine written by somebody else can refuse a program it does
not implement. Both are generated from the files that already state them rather
than typed into source.

## 0.1.0-alpha.0

First publication. **This version parses and does not compute anything.**

A lexer, a parser, a syntax tree, and diagnostics carrying a code, a line, a
column and a fix. It will tell you whether a script is well formed. It will not
calculate a moving average, draw anything, or place an order.

It exists to reserve the name and to prove the release path while the stakes are a
placeholder, on the principle that automation which has never run is not
automation.

What is behind it: the language specification, a 143 entry error catalogue in
prose and machine readable form, the compiled program format, the host interface a
platform implements, a conformance suite design, twelve worked example scripts and
72 pages of documentation. All twelve examples parse with no diagnostics, which
was the gate for this phase.

Published with no long lived credential. The checker and the engine are next.
