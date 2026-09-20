# Changelog

What changed in each release, written for somebody deciding whether to upgrade.

This file is checked at release: a version with no entry, or an entry that says
nothing, fails the build before it can become permanent.

---

## Unreleased

**A close now flattens the part it was told to flatten, on the side that reduces
it.** `close(tag)` took its direction from the leg's net rather than from the
part the tag names, so it could send an order that **added** to that part. A leg
holding ten long under one tag and four short under another is a net six long,
and closing the short part was answered with a sell of four: that part went to
eight short, the other tag's long was cut to six, and a call named `close` had
opened position. This is the shape a hedge is written in, and `stdlib.md` 17.2
says of the reading that takes the leg's net that it would let `close` open a
position. Three things follow it and are now held: what is already working
against a part is counted on the part's own side, so a second `close(tag)` holds
back the close already on its way instead of sending the part again; a part on
the side its leg is not on is closed by the whole of itself rather than by
whatever the leg has left, because closing it moves the leg away from zero; and
a part whose position has already returned to zero sends nothing rather than
opening it again.

**A position reference no longer reads as the side it is not on.** A reference's
side was read from what had settled on it plus what a reduction claimed of the
**leg** at the moment it was sent, and those two numbers can drift apart. A
second stated close claims nothing, because the first already spoke for the
whole leg, and it still fills and still reduces what has settled: the sum went
negative, the reference read short while it was long, and an entry opposing it
was handed it as an order that **adds**. Under a declaration counting in lots,
cash or an equity percent, `buy(qty = 10)` and then two closes of one and a
`sell(qty = 9)`, with every order answered in full and nothing rejected, left
reference 1 having opened ten long and settled one short. A reference is now
measured against the orders' own sizes, which fall as a fill arrives, so the two
halves of that sum cannot drift.

**Two more, both found by the properties rather than by reading, and both the
same sentence: a close is sent against the position it is closing.** A close
whose quantity the engine cannot count in units was handed the reference an
entry was opening on the other side, where the leg's own long was entirely
inside an order the destination still had. And a bracket minted a position
reference when the leg was flat, so a script whose first order call is `exit()`
or `order.bracket()` burned reference 1 on an instruction that appends no row
and moves nothing: the entry after it opened on reference 2, and the bracket
carried a reference no order ever shared, which a host reconciling intents
against positions cannot find on the other side. **A bracket now carries the
position it protects, and `0` where the leg holds none**, which is what a
cancellation has always carried; `host-interface.md` 7.1 says so for the party
that has to read it.

**`order.reverse` is unchanged, and now says why.** Its opening half mints a
position of its own without going through the division every other entry takes.
That is correct by construction rather than an omission: a reference minted
there has nothing on it, so the order cannot cross it. Dividing it instead is a
defect, because the orders of a call are all mapped before any of them appends a
row, so the opening half would be divided against the very position the closing
half is flattening. `tests/engine/parts.test.ts` pins the reference now as well
as the quantities.

**How much of this is checked rather than promised.** Two thousand generated
scripts, ten bars each, against a destination that answers late, partially, out
of order, with rejections, with more than was asked, with a frame repeated, with
a stale quantity restated after a later one, and not at all. The oracle is
folded from what the host sent and what it answered and reads nothing the engine
kept, because an oracle folded from the ledger agrees with the engine by
construction, which is how both of these defects passed 1414 tests. Every fix
was then mutated back one at a time and the suite run against each.

**An order now knows which position it belongs to.** An order picked its position
reference by comparing its own side against the leg's net, which is folded from
settled fills, so while an entry was unanswered the leg read flat and an order
opposing that entry was not seen as opposing anything: `buy(qty = 6)` on one bar
and `sell(qty = 9)` on the next, against a destination that had said nothing, put
both orders on position reference 1, which opened six long and settled three
short. That is one position holding both signs, which is the single failure the
position reference exists to prevent, because a fill arriving late can no longer
say which position it settled. The same script with the entry acknowledged first
was already correct, which is the whole shape of the defect: **what a bar sends
must not depend on how fast the destination answers**, and now it does not.

A position is measured by what is on it, settled and what is still working
together. A position with six units still to come is a position holding six, and
an order that opposes it takes those six off it before it opens anything, because
otherwise nothing can ever bring that position back to zero. Three more shapes
went with it. A close after such an entry held nothing back for it and sent the
position again, which is last round's runaway exit with an entry in place of the
close. An order agreeing with the leg's net was attached to whichever position was
current, which during a flip is the one carrying the other sign, so a buy of
twelve took a position from nine short to three long. And a close or an
`order.reverse` sized against the whole leg and attached the result to one
position, with nothing asking whether that position could absorb it: a leg holding
seventy two short across two positions was handed one order large enough to take
either of them through zero. Each of them is now one order per position it
reduces, oldest first.

**A close is held to every order already coming off the leg, not only the ones
that were reductions when they left.** An entry the destination has not answered,
on a leg the orders after it took the other way, is a reduction now whatever it
was then. Left out of the count, `close(qty = 12)` against a leg twelve short was
accepted as true when five of the twelve were already on their way.

**Pyramiding counts the entries the leg holds in a direction**, which is what the
declaration option has always said, and which used to be the same number as the
entries on one position reference. It is not any more: an entry placed while the
whole of a position is already in an order the destination still has opens a
position of its own, because the one it would join is about to reach zero and
end. And whether an order is an entry at all is now read from the order rather
than from the leg's net, which calls every order an entry while the leg reads
flat.

**In lots, cash and an equity percent, an opposing entry is still one order, and
two things about it are now held.** It carries a position reference of its own
whether or not anything has settled, which is the defect above wearing another
unit and was not held before. And the position it leaves behind is named again: a
close works its own quantity out in units, so it is divided across the positions
holding the leg's side and reaches that one in turn, and it returns to zero as
soon as the leg's net comes back to its side. What still waits on the instrument's
lot size is the instruction itself closing it, and a leg whose net never returns
to that side carries the position for the rest of the run. OS7005's deferral says
so, and `tests/engine/ending.test.ts` asserts both halves rather than describing
them.

**What no engine answers for, recorded rather than left to be found.** A position
settles on the side it did not open on only when an order on it was never answered
in full: one still going, or one that ended rejected, cancelled or expired with
part of its quantity unfilled. An order divided against an unanswered order is
placed against units that were promised and may not arrive, and the alternative is
holding an order back until the destination answers, which is an engine that stops
trading when a destination is slow. Over six thousand generated runs against a
destination that answers late, out of order, partially, with a rejection and not
at all, every position all of whose orders were answered in full ended on the side
it opened on.

**A setting a reader stores now reaches the declaration option it was written
into.** `docs/inputs.md` teaches `study("S", precision = input(2, "Places"))` as
how a reader gets to change something the declaration decides. Through this
package's own chart adapter it did not: `descriptorFor` took no settings at all,
so `plots[0].priceFormat.precision` was 2 whatever the host had stored, and 5
when the script wrote `input(5, ...)`, which is the default and not the setting.
The engine loaded with the same stored value resolved it correctly, so the chart
formatted a pane at one precision while the column beside it was computed at
another. `ChartAdapterOptions` gains **`settings`**, and every declaration field
written as an `input()` now resolves against it: the study's name and category,
its placement, and every plot, band and alert field. A host that keeps one
descriptor per study instance passes that instance's stored settings and builds
again when a user changes one; the parts that follow a later change with no
rebuild are the calls, `levels`, `range`, the painting hooks and the calculation,
and which is which is recorded in `spec/chart-narrowings.json` and measured by
`scripts/check-chart-surface.mjs` rather than promised. One declaration option
still cannot be tuned and now says so: a plot's `style` is a plain string in the
compiled format, so an `input()` written there is folded to its default with no
diagnostic anywhere. That is issue 0018, and closing it is a format change.

**And a stored setting the engine will refuse no longer reaches the chart.** The
change above brought its own defect, in the half of it nothing had asked about:
the declared shape is built before anything is calculated, so a settings map of
`{ Places: 99 }` against `input(2, "Places", min = 0, max = 8)` put a precision
of 99 into `plots[0].priceFormat`, and `{ Places: -4 }` put -4 there. The run
refuses that map with OS6019 and nothing is drawn, but the descriptor a host was
handed first carries a number the input forbids, and a host may show it in a
legend or on a price scale before it asks for a bar. The adapter also kept a
second idea of an unusable value beside the engine's: a stored `null` or object
read as the declared default while the engine refused the same map, and a stored
`"7"` read as neither, landing on the chart's own fallback of 4.

Both are one question with one answer now, and it is the engine's own:
`checkSetting` is the function the load refuses with, and the adapter asks it
before a load exists. A stored value it will not take reads as the **declared
default** in the declared shape, and travels to the engine exactly as the host
stored it, so the run still stops with OS6019 naming the key and the bound.
Neither half is a fallback: the value is not repaired, and the shape is not
withheld, because the settings dialog a reader corrects the value in is built
from it. The incremental path compares what the engine is handed rather than what
the shape shows, because every refused value shows the same default and a
signature taken from the shape would keep a held engine across a change from a
setting that runs to one that cannot. `scripts/check-chart-surface.mjs` moves a
plot width outside its declared bounds, as text and as `null`, and reads both the
shape and the run on each.

**An input written in place whose title is empty now has a code that is true of
it: OS3024.** `input(14, "")` raised OS3021, whose message says the input "has no
title written as a string literal" and whose fix says to give it one. The reader
had. It was empty, and the sentence told them to make the edit they had already
made. OS3021 keeps the two programs it describes, an input with no title argument
and one whose title is not a literal; the empty title is OS3024, whose fix is to
give the title something to say. Beside it, a decision that had been made by
nobody is now written down: **an input assigned to a name and given an empty
title is labelled by the name**, exactly as one given no title is, because a
named input has its key already and what an empty title costs there is only a
label. `language.md` 13.4 states it, and a test pins it.

**`spec/errors.md` and `spec/errors.json` are now compared in full.** The page is
named the authority a reader is sent to, and the file is what the compiler is
generated from, and until now only the test pointer and the two example blocks
were held to each other: changing one word of a message on the page passed the
whole build, showing a reader one sentence and the user of the compiler a
different one. Every heading, first line, message, placeholder gloss, cause, fix,
deferral and unexercised sentence is now compared character for character, along
with the two tables outside part 8 that are copies of the file as well. Both of
those had already drifted: the ranges table said the argument block held 20
entries and the catalogue held 147, against 23 and 150, and the refinements table
was missing an entry added in the last release.

**The error code check reads the whole tree, not only its Markdown.** Its own
docstring said "nothing else in the repository gets to invent one" while it
walked `.md` files, and source comments cite codes heavily: changing one in a
comment to a code the catalogue does not define passed the whole build. It now
reads every file the project holds, source and tests and tooling alike, and
prints the count it read. A number outside every thousand block the catalogue
declares is not a code and is counted rather than refused, which is what lets
four checks go on attacking their own rules with a fabricated entry; those
citations and the files holding them are printed on every run.

**Three sentences in `stdlib.md` section 20 fixed nothing and have been
replaced.** Section 20 is the manifest a second engine implements from, so a
sentence there that cannot be violated costs an implementer the time the section
exists to save. `rsi` said that naming the ratio first and writing
`100 - (100 / (1 + ratio))` was "the same expression with an extra rounding in
it": there is no extra rounding, and the two spellings are bit identical on every
value at all three gate lengths. `alma` fixed the grouping of `2 * spread *
spread`, which cannot differ because one factor is a power of two; the
arrangement that does differ is the chain of divisions, and that is what it names
now. `bollinger` said a span was "formed once". 20.1 gains the general rule so
the next one is caught by reading, and two measured figures that were overstated
as "most" are now the numbers: `fade`'s refused arrangement differs at 40 of the
101 whole percentages, and `math.toDegrees`'s at 26 in every hundred.

**A fourth one, and the rule that covers all four.** `swma` said "the two middle
terms are formed as `2 * value`, and the four terms are added left to right":
one sentence, one half of which can be failed and one of which cannot, with
nothing to tell a reader which. Writing `value * 2` or `value + value` instead is
bit identical on every finite value, measured over 25176 values covering every
binade of the double range in both signs, the subnormals included. Writing the
four additions in a different grouping is not: over twenty thousand four bar
windows of ordinary prices, pairing them differs on 5281, adding right to left on
7230, and dividing each term by 6 as it is added on 9564. The entry now states
both, with the figures.

Four sentences of one shape in three rounds is a pattern rather than three
coincidences, so 20.1 now states the general rule rather than another list of
instances: **an arrangement is where one rounding falls relative to another**.
Only an operation that rounds can be part of one, and two operations that do not
read each other have no order between them. The three things that fixed nothing
become four, gaining the exact respelling of a step that does not round (`2 * v`,
`v * 2`, `v + v`; `v / 2`, `v * 0.5`) and the order of accumulations that do not
read each other, and the section now states the test a sentence has to pass to go
in it: name the second arrangement it refuses and count where the two differ. The
whole of section 20 was swept against that test, which found two more: `linreg`
and `covariance` fixed the pass structure of accumulations that never read each
other, `covariance`'s down to the order the three are written in. Both now fix
what is real, which is that each total runs oldest first. `tests/stdlib` reads
every figure above out of the page and measures it again, so rewording a claim or
moving a figure fails a test instead of going on being quoted.

**CLAUDE.md rule 5 now says what its check covers.** "Name nobody. No outside
product, platform, company, trademark, market index or real instrument,
anywhere" is enforced by a fixed list of eighteen products and thirteen indices.
A name on the list is caught in any file and a name that is not on it passes,
which is the only mechanizable form of the rule; the rule was written as though
the check covered all of it. It now says which half is mechanical and which is
attention, and `scripts/check-names.mjs` says the same in its passing line,
because a green build read as proof of something wider is the way this one fails.

**A close still working at the destination is no longer sent again on the next
bar.** A position moves when a fill settles and from nothing else, so an order a
strategy has sent and not had answered has moved no position figure: the leg
still reads what it held before it left. The previous release held the orders of
one bar against that, and one bar out the defect was still there. Measured, with
the entry acknowledged and the closes not acknowledged, on the plainest exit a
strategy can write:

```
strategy("P", qty = 3)
if bar.index == 0
    buy(qty = 3)
if bar.index > 0 and pos.size > 0
    close()
```

six bars sent one close per bar and netted **twelve short** under one position
reference, ten bars netted twenty four, and it grew with the run. With the closes
filling one of three at a time it sent 3, then 3, then 3 and ended three short.
Nothing was reported, on a leg that opened long three, and a destination slower
than the chart is the whole of what it takes. The script was not wrong: `pos.size`
is folded from settled fills and correctly still read three.

**What is available to reduce is now the settled position less everything already
working against it**, over the run rather than over the bar, which subsumes the
bar rule rather than sitting beside it. What is working is read from the ledger:
an order that has not ended and has not fully filled, counted by the part of it
that has not filled. A partial fill releases what settled, so three sold with one
filled leaves two working and the next close sends two. A rejection, a
cancellation or an expiry releases the rest, and the script may close again.
`cancel()` is the way out of a destination that never answers, and it now works
end to end. An unsettled entry adds nothing to what a close may reduce, because
nothing has settled. `close(qty = ...)` against a leg whose close is already
going is **OS7017** naming nothing left, where before it sent the position a
second time.

**A crossing entry carries a position reference of its own in every `qtyType`.**
Under `"lots"`, `"cash"` and `"equityPercent"`, `buy(qty = 3)` then `sell(qty = 9)`
sent one order on the outgoing position's reference: at a lot size of twenty five
the destination saw reference 1 go from seventy five units to minus one hundred
and fifty, which is the crossing the split exists to prevent. Dividing the
quantity into a closing half and an opening half needs the instrument's lot size
and still waits on it, but **minting a reference needs no arithmetic**, so it is
done in all four. What still waits is written where a reader meets it, in
`stdlib.md` 17.1 and in OS7005's deferral: the outgoing position is not closed by
an order of its own.

**`pos.avgPrice` is now averaged over the positions on the side the leg holds.**
A leg holds more than one position whenever an opposing order is outstanding.
Summed across both, the cost of a position on its way out was subtracted from the
cost of the one on its way in: three hundred bought at one hundred beside two
hundred and twenty five sold at one hundred and ten reported an entry at
**seventy**, and every level measured from the entry would have been measured
from that. It also corrects the same blend during a flip, where a leg long three
at one hundred with a new short five at one hundred and ten reported one hundred
and twenty five.

**An order that names a `leg` is now refused: OS3023.** `stdlib.md` promised that
a leg outside the declared names was refused, and nothing raised it:
`buy(qty = 3, leg = "nosuchleg")` placed the order on the only leg with no
diagnostic, and a computed name was ignored too. The sharp case is
`buy(qty = 3, leg = "a")` followed by `close(leg = "b")`, which flattened the
position: a script that named one leg and closed another traded the leg it did
not name and was told nothing. Leg declarations are planned, so no file can
declare one, so there is no name the argument could carry; it is refused whatever
it holds and whether the name was written or computed, and the fix is to take the
argument out. It is a code of its own rather than OS3008 because OS3008's fix
sentence is "use one of these values" and here there are none, and a fix a reader
cannot act on is worse than no fix.

**Two sentences of `stdlib.md` 17.1 corrected.** One claimed the engine held
every order it can read in units to "no order crosses zero" bar one named
exception; the across-bars case above was entirely in units and was not that
exception, so the engine was made true and the sentence now says what is. The
other, "a bar declared `onUnconfirmed` is one bar however many times it is
executed", is true of the reducing count and read as a general rule about the
bar: on such a bar executed four times a close sends one order and `buy(qty = 3)`
sends four, which is `language.md` 7.5 working as designed. The sentence now
carries its scope, and both halves are asserted in tests.

**A settings value now stays on the row it was stored for.** An `input()` may be
written anywhere a value belongs, and one written in a declaration option or
inside a larger expression is bound to no name, so it was keyed by its position:
`input0`, `input1`, `input2`. `host-interface.md` 8.1 promises a key that
"survives every edit that does not rename it" and a positional key survives no
edit at all. Measured end to end, on a file with three tunables in it, inserting
one in the middle and renaming nothing moved the keys down and put the value a
user had stored for Width onto Smoothing, silently, because 8.3 validates a
number against a number and both are numbers. A delete and a reorder did the
same. **An input written where a value belongs is now keyed by its title**, which
is what the user sees on the row and what changing is the rename 8.1 excepts; an
input bound to a name is keyed by the name as before, and `var len = input(...)`
is the named form, so adding or removing the word does not move a stored value.
Uniqueness is held by refusing rather than by a suffix, because a suffix is a
position again: an input with neither a name nor a title written as a string
literal is **OS3021**, a title spelling another input's name is **OS3022**, and
two inputs carrying one title were already OS3017. This changes the stored key of
every input written in place, and there were none to change: across the gate
studies, the gate scripts and `examples/`, 0 of 241 inputs carried a generated
key, because until the previous entry below closed, such an input did not compile
at all.

**An `input()` may be written inside a read's expression.** `req.timeframe("1D",
high + input(1, "K"))` produced exactly one diagnostic, OS6018, whose message
tells the reader that if nothing else was reported their correct script came from
a broken compiler. Nothing forbade the script: `language.md` 13.4 forbids an
input in a block and in a function, a read's expression argument is neither, and
`stdlib.md` 15.4 already permitted a **name** bound to an input there, for a
reason that is about the setting rather than about the name. The compiled format
already carried the mechanism as well, in the `inputs` list a read's body has had
since `compiled-program.md` 2.16: the engine resolves the key in the enclosing
program before the body runs and fills a register of the body's own table. The
call now resolves through the same scope the name does, and two reads of one
setting inside one body share one register. A `var` holding a setting is still
OS6003 there, because a later assignment may change it.

**`var len = input(14, "Length")` no longer compiles to a dead settings row.** It
was accepted with no diagnostic and read absent on every bar: the name was given
one slot, the input another, and nothing joined them, so a user got a row in the
dialog they could move that changed nothing. It is now an ordinary `var` whose
initial value is the setting, which is how a running total starts from one. A
setting cannot change mid-run, so a `var` nothing assigns to holds exactly what
the plain form holds; what the word buys is the assignment. The name is not the
setting, though: a `var` is a cell a later assignment may change, so it is
OS3003 in a declaration option and OS6003 inside a read's expression, like any
other per-bar name.

**A hole in the compiler's own copy of verification check 5.** The check is three
sentences, and only two were walked: the depth agrees on every path, and it never
goes below zero. The third, that it is zero at the terminator, is not a
restatement of the second, because a `RET` reaches nothing after it: a body one
value short is at minus one exactly at the `RET`, where the walk asked nothing,
and the walk finished clean. That is how a read's expression with an `input()` in
it came to be emitted as a body no conforming engine will load, found by an
engine rather than by the compiler that wrote it. Every `RET` and every `HALT` is
now checked, rather than the last instruction, because an early `return` is a
terminator too.


**Every worked example in the error catalogue is now compiled, and every
pointer in it resolves.** The catalogue carries a before and an after block per
entry. The after block is the fix a reader is handed at the moment they are
stuck, and they paste it; nothing had ever put one through a compiler. That is
how OS7009's fix came to call a function the language does not have, be cited in
five documents and sit there being read. Four more did not compile: OS7012's
names a planned call, OS1023's puts a `plot` inside an `if`, and OS1022's and
OS3003's were both refused by the emitter, which was a defect in the emitter and
is fixed below. OS3003's example is back to the input form its own fix sentence
names. OS1022's stays as deleting the trailing operator, on its own merits: the
statement was already complete before the stray operator, and supplying an
operand instead invents a number the reader never wrote. Five compiled and warned, which is the compiler complaining about
the reader for doing what it had just told them to do. Every after block now
compiles with no diagnostic, bar the two warnings that say a fragment stopped
rather than that it is wrong.

The before blocks were held to the code they are filed under, by compiling them
and, for a runtime code, by loading the program on a host and running it over a
fixed dataset on two venues. Seven were about a different code than the one they
were printed under. OS3001, wrong number of arguments, showed a call with one
argument missing, which is OS3012. OS3004, a literal that is not a whole number,
showed a computed value, which is OS4003 on a bar. OS4003 showed an array index,
which `compiled-program.md` assigns to OS4004. OS4002, a read past the retained
depth, declared no depth to pass. OS7010, a bracket on the wrong side of the
entry, read the entry price on the bar the entry was placed, where it is absent,
so the refusal a reader would have met is OS7002. Each of those is now the
example its own code is about. Four codes are ceilings an example cannot reach,
a million array elements among them, and each of those entries now carries an
`unexercised` sentence saying so, which expires by itself the day one is proved.
Eight entries whose example is the host's input rather than a script say that in
an example `kind`, and are held to it: a block declared not to be source that
compiles fails the build.

Every entry also used to carry `"test": "tests/errors/<CODE>"`, and that
directory has never existed in any commit. A hundred and forty-five pointers,
every one dead, printed as "Test `tests/errors/OS7009`" beside a rule promising
that every entry has a test. They now name a file under `tests/` that writes the
code, or `null`. Twenty-four codes carry the null, seventeen of them deferred and
seven taught as current behaviour and exercised by nothing, which is printed on
every run and recorded as an issue rather than papered over with a row somebody
invented. `spec/errors.md` part 8 is compared with `errors.json` character for
character for the pointer and both example blocks, because it is a copy and this
pair had drifted for every entry at once.

Two checks, `scripts/check-examples-compile.mjs` and
`scripts/check-catalogue-tests.mjs`, enforce all of it, and both say what they
cannot reach and count it: eleven host codes are the host's own answer and this
harness drives one host, so they are compiled, run, and listed by name as not
proved on every run.

**The order layer now refuses what the specification says it refuses.** Eight
codes of the orders range were written into the catalogue, taught across five
documents in the present tense, credited by a shipped example with protecting it,
and raised by nothing: an order call became an intent and was held against no
rule at all. Measured on a host built from the page, an absent quantity was
replaced with the declaration's size and filled, two opposite orders on one bar
both filled while the position read zero for the whole run, a pyramiding limit of
one let three entries through, and a typed order with no price for that type went
out unrefused. OS7002, OS7004, OS7006, OS7007, OS7008, OS7009, OS7010 and OS7013
are now raised at the call that wrote them, and each of them refuses before
anything is handed over: every order call on a bar is mapped before any of them
is routed, so a refused order reaches no destination rather than being sent and
then reported. OS7005, OS7011, OS7012, OS7014 and OS7015 stay deferred in the
catalogue, each with the sentence saying what has to exist before it is raised.
An argument the script left out and an argument it wrote that came out absent are
no longer one thing. They used to be: two of an order call's defaults are absence
itself, the compiler substituted them, and `buy()` and `buy(qty = none)` compiled
to byte identical programs, so OS7002 had nothing to fire on. The catalogue's own
worked example for that refusal, `buy(qty = 1, stop = lowest(low, 20))`, placed a
market order on every bar of the twenty bar window and then stop orders: a stop
entry silently became a market entry on every warmup bar. An order call now
carries the names of the arguments the script wrote, so `buy()` still takes the
declaration's size and `buy()` with neither price is still a market order, while
every order argument written as a value that came out absent, a quantity, a
limit, a stop, a trigger, a type, a tag, a bracket's target or its distance, is
OS7002 naming that argument and reaches no destination. The example that credited OS7013 with a
protection now says what that refusal covers and what the shape of the script
covers.

**A `close` that could never close anything is now refused, and the repository
now says one thing about what a tag argument means.** `close(tag = "entryy")`,
a tag no order in the file is placed with, sent nothing and said nothing: the
position stayed open and the script believed it had flattened. It is now OS7016,
reported at the call before any bar runs. The checker rather than the engine,
because the engine cannot tell that mistake from an ordinary bar: a tag that has
never named a ledger row is also what a working script looks like before its
entry has fired, and refusing that would stop a strategy whose exit signal simply
came first, with no guard available to write, since every call that reads the
ledger is planned. A file, unlike a run, is complete. What is not refused, and is
covered by a test of its own so that it stays that way, is a close on a tag that
holds nothing right now: closing the same tag twice sends one order and says
nothing about the second call.

Underneath it is a rule that was always in the signatures and had never been
written down: **a tag that defaults to the empty string is a label the call
carries to the destination, and a tag that is required or defaults to absence is
a reference to something that has to exist.** The catalogue disagreed with it.
OS7009's worked example was a bracket whose tag named no order, presented as a
refusal, while the engine sends that bracket without a word, as it should: a
bracket sets the leg's own level and its tag rides along as a label. The example
is now a cancellation, which does raise the code. OS7009's fix was worse than
wrong: it told the reader to test `order.working(tag)`, which is marked planned,
so the fix the catalogue handed a reader was itself a refusal. Both halves now
say something that compiles today.

**A strategy's position is folded from what it traded, and a host is no longer
asked for one.** The five position facts answered from a position row on the
engine's host type, which no specification document describes and which a host
built from the page does not supply. On such a host every one of them read
absent, so a guard written `flat = pos.size == 0` was absent rather than true,
the branch was not taken, and a strategy shipped in `examples/` placed no orders,
raised no diagnostic and drew its plots as though it were working. The run now
keeps the ledger those facts were always documented to come from: an order call
becomes the order intents the host interface specifies, each intent appends a
row, and the cumulative frames a host reports fold into those rows exactly as the
library page's fold says, including the repeated frame that must cost nothing and
the fill that arrives after a cancellation and must not be thrown away. What a
script reads is what that strategy traded, which is the point: an account
position row is shared with every other strategy and every manual trade in the
same contract, so a size computed against one is computed against somebody
else's. The position option on the chart adapter is gone with it.

**A host can now deliver an order frame.** Sending cumulative frames has been a
conformance duty since the host interface page was written, the frame was
specified in ten fields, and no engine exposed anywhere to put one: an
implementer working through the list searched for an interface that was not
there. An engine that takes orders now takes a frame at any moment between bars,
folds what arrived at the bar boundary so that every position fact is constant
for the length of one execution, and reports on that bar what each frame did,
a refused one included.

**A series the engine cannot run on is now refused instead of computed on.** Two
codes the host interface page requires, OS6010 for no bars at all and OS6011 for
a bar whose time does not follow the one before it, were in the catalogue and in
the conformance list and were raised by nothing. A host handing over an empty
dataset, a swapped pair or the same timestamp twice was accepted in silence and
the study computed on it, which is the worst failure this project has: not a
crash, a wrong number nobody is told about, entering at the boundary so that
every value downstream is confidently derived from bars that were never valid.
Both are now raised, at the hand-over, on the whole-dataset path and the bar at a
time path alike, and a refused series stops the run. The cost is one comparison
per bar handed over: about half a millisecond over fifty thousand bars, against a
full compute of the same history that the benchmark records at a hundred and
eighty five milliseconds, and it is paid where the bars arrive rather than on
every execution of them.

**A read the host refused now reports its reason when it is written inline.**
`req.error(read)` and `req.isReady(read)` answered about a read assigned to a
name and answered nothing at all about the same read written out inside the call:
the compiler resolved it to a handle and emitted no request under it, so the host
was never asked and the script was told nothing was wrong. A study that draws
nothing while its own diagnostics say nothing is wrong is the worst version of a
silent failure, because the user has already looked and been sent to look
elsewhere. A read written inline is now a read like any other: it is emitted, the
host is asked about it, and its refusal reaches the script. Two reads written in
one file are two requests and count as two against a host's ceiling, which
`spec/host-interface.md` section 5.2 now states.

**A request now carries what the host interface page says it carries.** A host
built from `spec/host-interface.md` section 5.2 alone could not implement duty 3:
the table printed six fields, three of which never arrived, and the request
carried three more the table did not print. The request is now `id`, `read`,
`instrument`, `exchange`, `timeframe`, `mode` and `warmup`, on the page and in
the engine. `symbol` is `instrument`, which is what the page calls it and what
section 9 says it is; `read`, `mode` and `warmup` are documented, because the
engine sends them and they are each worth having; and `from` and `to` are gone
from the page, because the whole set of requests is settled before bar 0 and at
that moment the engine holds no bars and has no span to state. The page now gives
the arithmetic instead: the chart's own span, extended backwards by `warmup`
requested bars, worked out by the host, which is the side that has the bars.

**A read of another instrument is now told which exchange to resolve it on.**
`req.symbol`'s `exchange` defaults to `chart.exchange` in `stdlib.md` 15.1, the
compiled format spells the omission as an absence meaning the chart's own, and
the engine passed the absence straight through. A host was therefore left to
resolve an instrument on no venue at all wherever a script did not name one,
which is a different contract wherever a ticker is listed twice. The engine now
resolves it, along with the identity of a read of the chart's own instrument,
so every request carries an identity and a venue rather than a rule to apply.

**An instrument record that contradicts itself is now refused at load.** A host
that stated a `session` and no `timezone`, a session spelled `"9:00"` rather than
`"09:00"`, or days numbered from Sunday as zero, lost `vwap` and every session
study on every bar with nothing reported anywhere, because that is exactly what
an instrument with no schedule looks like. Each of the three is OS6012 at load
naming what is missing, and so is a timezone no calendar can read. A host that
states no session at all is unchanged and still conforming: the per-bar session
facts are absent and a script tests for them.

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

**A tunable declaration option now compiles.** `language.md` 13.2 has always
allowed an option value to be "a literal, arithmetic over literals, or a call to
`input()`", 13.4 allows an `input()` anywhere at the top level of a file, and
`decisions.md` decision 9 settled how such an option reaches a compiled program.
The emitter carried none of it. An `input()` that was not the entire right-hand
side of a top-level assignment had nowhere to go, so
`study("Range", precision = input(2, "Precision"))` was refused with OS6018 and
no program, and so were `study(input("R", "Title"))`,
`len = input(14, "Length") + 1` and an input written inside any other expression.
OS6018's message says a program that fails verification came from a broken
compiler, so a correct script was told it had found our bug, and every
declaration option in the language was a literal in practice whatever the page
said. A platform adopting the language from those pages wrote a study that would
not compile.

Two halves were missing and both are here. Folding now resolves an `input()`
written in place to the `{ "input": "<key>" }` reference of
`compiled-program.md` 2.3, which is the form decision 9 put in the format and
which every field of `meta`, of `meta.strategy` and of every declaration in
`outputs` may hold; the engine substitutes the resolved value at load, as it
already did for an option written as a name. And an `input()` read inside an
expression now loads the slot the engine writes at step 5 of every bar, while the
same call written as the whole of `name = input(...)` goes on emitting nothing,
because there the name and the input share that slot and the engine's write is
the assignment. The two are told apart by which caller reaches the emitter, never
by inspecting the call: the statement is the only place that can see whether the
call is the whole of itself.

A colour computed from an input comes back with the rest of it.
`plot(close, "C", fade(input(aqua, "Tint"), 50))` was refused for the same
reason: the per-bar colour path emits the expression a script wrote, and the
input inside it emitted nothing. It paints the colour the setting gives it on
every bar now, which is what the checker had always accepted.

Nothing is now allowed that 13.2 and 13.4 did not already allow. An `input()`
inside a block or a function is still OS3007, and the single line form of a
function body is now held to that rule as the indented form always was:
`fn f(x) => x + input(3, "K")` was checked as though it stood at the top level
and declared a settings row from inside a function with nothing said.

**A `close` no longer crosses zero, and the ledger no longer keeps a row for an
order nobody was sent.** On a leg holding one unit long, `close(qty = 5)` sent
one sell of five: the leg ended the bar four short, under one position
reference, with no diagnostic anywhere, and a call named `close` had opened a
position. `stdlib.md` 17.1 forbids it outright, and a quantity the script
states was the one a close sent without working it out. It is now OS7017,
naming what was asked for and what is left to close, and the call reaches no
destination: a bar that places a good
order and then meets it sends nothing at all, the good order included.

Refused rather than quietly reduced to what is there. Sending the smaller number
would send a quantity the script did not write and leave it believing it had
closed the one it did, which is the wrong belief this release has now refused
three times already; and reading the call as a reversal would let `close` open a
position, which the order page already calls the most expensive naming mistake
available. `close()` with no quantity is untouched and goes on working the
number out for itself.

One consequence is worth knowing before you meet it.
`close(tag = "entry", qty = 1)` on a tag that has already flattened is now
refused, while `close(tag = "entry")` on that same tag stays silent and
idempotent. The two look inconsistent and are not: a quantity is an argument the
script wrote, so it is a claim about its own position and the claim can be
false, while a call with no quantity asks the engine for the right number and has
nothing in it to be wrong about. It is the same sentence that separates `buy()`
from `buy(qty = none)`. The comparison with a stated quantity is made in
full only where that quantity and the folded position count the same thing,
which is a declaration whose `qtyType` is `"units"`; in lots, cash or equity
percent they are different kinds of number, and the entry below says which half
of it is made anyway.

The second half of that area: `engine.orders()` reported rows for orders no
destination was ever handed. A bar that placed an order tagged `"good2"` and
then called `cancel("nosuch")` left the destination with zero intents from that
bar, which is right, and left the ledger reporting `good2` at `placed` with an
empty `orderRef`. A host reconciling against that record after a stopped run saw
an order it never received. A bar's rows and a bar's orders are now the same set:
mapping a call still appends its row, because the calls after it on the same bar
are measured against the rows before it, and a bar that is then refused takes
those rows back.

**No order crosses zero, on the three paths that still reached it.** The
sentence `stdlib.md` 17.1 states without qualification held on the shapes that
had been tried. On a leg holding three long, `close()` twice on one bar sent two
sells of three under one position reference: the destination netted three short,
the ledger folded to minus three, and nothing was said. Five bare closes in a
loop ended the leg twelve short, and `close(qty = 2)` twice ended it one short
with each order inside OS7017's own ceiling. The cause was not the position
figure, which is folded from settled fills and is right to be: an order sent a
line ago has filled nothing, so the second close measured against the same
position the first one did. **A reducing order is now measured against what is
left to close on this bar**, which is what the part holds less what the bar has
already sent against it, and the invariant is written into 17.1: the orders one
bar sends can never sum past the position they are reducing. The second of two
bare closes sends nothing, which is the same idempotence as closing a tag that
holds nothing; a second stated quantity is held against what the first one left,
so `close(qty = 2)` twice on a leg of three is one order and then OS7017 naming
one left rather than three. The count covers a `sell` that reduces a long leg,
the closing half of `order.reverse`, and a bar declared `onUnconfirmed` executed
many times, which is one bar however often it runs.

**An entry that would cross zero is now sent as two orders, which is what the
page already taught.** `sell(qty = abs(pos.size) + newQty)` is documented as one
instruction the engine splits into two, because no order crosses zero, and the
engine mapped one order at the quantity written: on a leg holding three, a sell
of five left it two short under one position reference, where a late fill has no
way to say which of the two positions it settled. It now sends the closing half
at what is left of the outgoing position, under that position's own reference,
and the opening half at the remainder under a reference minted for it, which is
what `order.reverse` has always done. An order opposing a position the bar has
already committed to closing in full is opening a replacement rather than
reducing anything, so it too is minted a position of its own.

**A strategy declaring lots now gets the part of that rule that can be held for
it.** OS7017 was narrowed to a declaration counting in units, so `buy(qty = 1)`
and then `close(qty = 5)` under lots, cash or an equity percent sent one sell of
five against a leg holding one, with no refusal on any of the three. The
narrowing is sound where it is about two kinds of number, and it stays there:
comparing a stated quantity with a folded position needs the instrument's lot
size, which is the fact OS7005 has been deferred on from the beginning. But
nothing left to close is zero in every one of those units, so **a close that
states a quantity against a part holding nothing is now refused whatever the
declaration counts in.** Two bare closes on one bar are held in every unit too,
because the quantity a close works out for itself is in units by construction.
What is still not held is one shape, named in OS7017's entry, in 17.2 and in the
feature matrix: a quantity stated against a position that is still there, in a
declaration counting in anything but units. An order like that is sent as
written, and no quantity the engine works out after it adds to what it may have
crossed, because an order the engine cannot read is counted as having closed the
whole of what was left: a `close()` after it on the same part sends nothing. A
second stated quantity on the same bar is another order of the same unheld
shape, not a consequence of the first. Between a close that sends nothing and an
order that crosses zero, 17.1 has already chosen.

Decision 42 records the tension this turned on, which is worth reading before
relying on either half: sizing a bare close is the engine deciding a quantity,
and refusing one refuses a call that wrote no claim at all. It is resolved by
the rule the repository keeps arriving at rather than by choosing between them.
An argument the script wrote is a claim and a false claim is refused; an
argument it did not write is the engine's to work out, and what was always the
engine's to work out here is what is left to close.

**One sentence of the arithmetic manifest could not be violated, and now can.**
`stdlib.md` 20.3 said of the exponential mean that "the new value is multiplied
first and the running value second, and the two products are added in that
order". Binary64 multiplication and addition are both commutative, so that
constrained nothing: run over the eighty bar fixture the release gate compares
bit for bit, the swapped arrangement gives 0 differences out of 164 values. The
arrangement that does vary is `running + (value - running) * weight`, which
differs on 142 of them, and it is the one an implementer is most likely to reach
for because it is one multiplication rather than two. The paragraph now names
it, says what it measured, and says in the open what is deliberately not fixed.
Section 20 is the manifest a second engine implements from, and a sentence that
cannot bite sends that implementer to check the half that does not matter.

**The catalogue check now reads the fix sentence, not just the blocks.** The
blocks were compiled and the sentence beside them never was, and the sentence is
the part a reader acts on. That is how OS7009's fix came to tell a reader to
call `order.working(tag)`, which is marked planned, and how OS3003's came to
hand out `precision = input(2, "precision")` while its own after block had been
edited to show something else because that form did not compile at the time. Two
rules now, both narrow and both stated narrowly. Every call a fix names is put to
the compiler, one at a time, and a name the language does not have or one marked
planned fails the build, unless the entry itself carries a `deferred` sentence.
And a fix that writes a call out with a reader's own values in it, a string
literal or a named argument, has to show one of its calls in its own after
block, which is the only part of an entry a compiler sees. What the rules do not
cover is written in `scripts/lib/fix-sentence.mjs`: the fix is not compiled,
because the code in it is a fragment of a line rather than a line; the second
rule asks for one call rather than all of them, because eleven entries offer a
reader two remedies and demonstrate one; an after block that writes no call at
all is counted and named rather than skipped, and one entry is in that state;
and neither rule can tell whether the advice is any good.

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
