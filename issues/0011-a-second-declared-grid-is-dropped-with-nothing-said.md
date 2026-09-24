# 0011 A second declared grid is dropped, and no code exists to refuse it

Status: closed 2026-09-24
Opened: 2026-09-20
Found by: the phase three review, reading the chart adapter against a study that
declares two grids
Against: the catalogue, `spec/errors.json`, which has no code for a host that
cannot draw something a program declares
Also touches: `src/adapters/charts/tables.ts`, which drops the second grid,
`spec/chart-narrowings.json`, which records that it does, and
`docs/visuals/tables.md`, which now says so to a reader
Severity: a study that compiles, runs, writes cells on every bar and draws one
of its two panels, with nothing reported anywhere. It is input a user can write
and the documentation described no such limit.

## What is wrong

The language lets a study declare as many grids as it likes and the compiled
program carries all of them in `outputs.tables[]`. The chart's descriptor has
one `table` hook, so one grid reaches a pane: the first declared one is drawn
and the rest are not.

Nothing says so. The compiler reports nothing, because the program is correct and
another host may well draw every grid. The adapter reports nothing, because it
has nothing to report with. The user sees one panel and a script that writes
cells into two.

Two answers were available and both are refused:

- **Carry both.** There is one hook and one corner per grid, so two grids cannot
  become one without putting cells somewhere the script never asked for.
- **Refuse the second where it is written**, with a code and a sentence saying
  that one grid is drawn.

The second is the right answer and it cannot be written yet.

## Why it cannot be written

Every diagnostic in this project carries a catalogue code, the catalogue is
closed, and a stage that meets something it cannot express reports a gap rather
than inventing a code. This is that gap.

The catalogue has nothing for a host refusing an output it cannot draw. The
nearest entries are not it:

- **OS6006** says the engine lacks a capability tag the program requires. The
  program's tags say what it needs and this chart has `tables`: it draws grids,
  it draws one. A tag per count is not what a tag is, and inventing one would
  change the compiled format to describe a host's furniture.
- **OS5003** is a budget the host will not run, stated by `limits()`. A grid is
  not a budget and no file asked for it.
- **OS2008** is more than one declaration of a study or a strategy, and its
  sentence and its cause are about that pair.

Using any of the three would be a diagnostic whose cause text describes
something other than what happened, which is worse than the silence, because a
reader believes a code.

## What the entry should say

A host-stage error, since it is decided when a host builds its own surface out of
a compiled program, and since it is a property of the host rather than of the
file, so it belongs in the data range with the rest of what a host cannot
answer. The code itself is deliberately not written here: naming one would put a
citation of a code that does not exist into the repository, and
`scripts/check-error-codes.mjs` refuses that, which is the rule working.

- **Title.** The host cannot draw something this study declares.
- **Message.** `This host cannot draw {what}: {limit}.` So: "This host cannot
  draw the second table this study declares: a chart pane draws one grid."
- **Placeholders.** `what`, the declaration that will not be drawn; `limit`, the
  host's own sentence for why, which is the only part a host writes.
- **Cause.** A compiled program carries every output the language can express,
  and a host draws what its own surface has room for. The two are allowed to
  differ, and what is not allowed is the difference being invisible: a study
  whose second panel never appears looks like a study with a bug in its cells.
  A host states its limit at the declaration that exceeds it, before any bar
  runs, rather than drawing part of the study and saying nothing.
- **Fix.** Declare what this host draws, or run the study on a host that draws
  {what}.
- **Span.** The declaration's own call, so the caret is on the `table()` that
  will not be drawn.
- **Spec.** `host-interface.md`, and `compiled-program.md` 2.8 for what a
  program carries.

**One entry, because there is more than one instance of it.** Writing the record
below turned up a second: a band whose colour is computed per bar
(`fill(a, b, colorUp = close > open ? lime : red)`) carries that colour on a
channel, the chart's band takes one colour for the whole run, and the band is
drawn in the first plot's colour faded to twelve percent with nothing said. The
same entry answers it, with `what` reading "this band's colour, which is computed
per bar" and `limit` reading "a chart's band takes one colour for the whole run".
A third will arrive the first time a host's surface is narrower than the
language, which is every host.

## What was done instead

The drop is recorded rather than hidden.

- `spec/chart-narrowings.json` holds every field and every count this adapter
  does not carry, each with its reason.
- `scripts/check-chart-surface.mjs` compiles a study that declares two of
  everything, builds a descriptor from it and fails the build on anything
  dropped that is not in that record, on a record entry the format no longer
  has, and on a limit recorded with no reason.
- `docs/visuals/tables.md` tells a reader that one grid is drawn, and why the
  refusal is not there yet.

## How it closes

The catalogue entry is written with a test, the chart adapter refuses the second
grid at its declaration's span, `spec/chart-narrowings.json` loses its `tables`
count entry, the check keeps refusing every other silent narrowing, and this file
goes.

## How it closed

The entry described above is OS6024, recorded as decision 68, with the title,
message, placeholders, cause and fix this file proposed. One part is different
and the entry says why: the compiled program carries no source position for a
declaration, so the refusal names the declaration by its title rather than
pointing a caret at its call. `compiled-program.md` section 11 states the rule
for every host.

`src/adapters/charts/undrawable.ts` refuses both instances this file found,
before any bar runs and as a condition a reader can act on: a second declared
grid, naming it, and a band whose colour is computed per bar. The second grid's
`counts` entry in `spec/chart-narrowings.json` became a `refused` entry, the band
colour's narrowing says it is refused, and `scripts/check-chart-surface.mjs`
proves each refusal with a study that declares exactly that thing. Every other
silent narrowing is still refused by the same check.

`docs/visuals/tables.md` and `docs/visuals/fills.md` tell a reader what this
chart refuses and that another host may draw it.
`tests/adapters/charts/undrawable.test.ts` holds both refusals and a study with
one grid and a one colour band that runs.
