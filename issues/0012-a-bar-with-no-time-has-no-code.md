# 0012 A bar with no time is accepted and the catalogue has no code for it

Status: closed 2026-09-24
Opened: 2026-09-20
Against: `spec/host-interface.md` sections 3.1 and 3.5, `spec/errors.json`
entries OS6010 and OS6011, and `src/core/engine/series.ts`
Also touches: `src/core/engine/bars.ts`, which reads `time` as the absent value,
and `src/core/engine/requests.ts`, which steps a source bar with no time over the
fold rather than folding it into whichever bucket happens to be open
Severity: a bar the document requires to carry a time can be handed over without
one, and nothing at the boundary says so

## What is wrong

Section 3.1 states `time` for every bar: it is the only field in that table whose
"Stated" column reads "Every bar" and has no absent case beside it. Section 3.2
then builds the whole of the order rule on it, and section 3.5 gives the two
refusals that enforce the rule: OS6010 for no bars at all, OS6011 for a bar whose
time does not follow the one before it. Both are now raised.

Neither covers a bar handed over with no time at all. The comparison that raises
OS6011 needs two instants, so a bar dated nothing is compared against nothing and
passes. What happens instead is that `time` reads as the absent value in the
script, every calendar fold steps the bar over, and the per-bar session facts go
absent for it, which is a study drawing a gap on a bar that is on the chart.

OS6011's message does not fit the case either. It reads "Bar {index} is dated
{time}, which is not after bar {previous}", and a bar dated nothing is not a bar
dated something that is out of order. Filling `{time}` with a word for absence
would produce a sentence about an ordering nobody violated, which is worse than
no sentence: a reader would go looking for the bar before it.

## Why it was not settled here

Inventing a code was not available, and picking one of the two that exist would
have made an error message untrue of the program that produced it. So the check
compares two stated instants and leaves a bar with no time exactly where it was.
That is a decision recorded rather than a behaviour chosen: it is the same
silence this issue is about, held still on purpose until the catalogue has
something honest to say.

## What closing it looks like

One of two, and they are not the same answer:

1. **A code of its own**, on the ground that a host that omits `time` has broken
   the shape of section 3.1 rather than the order of section 3.2, and the fix is
   a different sentence: state the bar's open instant, in whole milliseconds
   since the epoch, rather than sort the history.
2. **A stated absence**, on the ground that a hole in a feed is ordinary and a
   bar whose instant nobody supplied is the absent value like any other, in
   which case sections 3.1 and 3.2 have to say so and the derived facts that go
   absent with it have to be listed where a host will read them.

The first is what the rest of duty 1 does, because the two refusals it already
has are both about facts a host must state. The second is what the engine does
today, unstated. Choosing needs the same answer as issue 0002, which is whether a
fact a host did not state is an error or an absence, so the two are worth reading
together.

## How it would be tested

A bar handed over with no time, through the page host's own shape, asserted on
the code and on the bar it names. The test cannot be written until the case has a
code, which is the whole of this issue.

## How it closed

Option 1, recorded as decision 69: OS6025, "A bar has no time", raised as the bar
is handed over and before any step runs, naming the bar, with the fix this file
proposed. A time that is not a finite number is no time either. The answer is the
opposite of issue 0002's, and the decision says why: a bar's time is the one
field of section 3.1 with no absent case, where an instrument fact is optional by
the table that lists it.

Writing it found that the second engine raised neither this nor OS6011: its
`execute_bar` ran whatever it was handed. Both refusals are now in
`engine/openscript/run.py`, with the same values as the first engine's, so the
two agree about a series the suite has no case for.

Tests: `tests/engine/series.test.ts` holds a dataset with an undated bar and a
revision that loses its time, and `engine/tests/test_hand_over.py` holds both
codes, a revision held to the bar before it, and an ordinary series accepted.
