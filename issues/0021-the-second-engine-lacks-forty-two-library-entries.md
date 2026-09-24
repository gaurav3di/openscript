# 0021 The second engine lacks forty two library entries and claims a profile that covers them

Status: closed 2026-09-24
Opened: 2026-09-24
Found by: closing issue 0020, and then asking the two engines for their
manifests rather than waiting for a case to reach the difference
Against: `engine/openscript/` and `engine/adapter.mjs`, which describes the
engine with `"profile": "strategy"`
Also touches: `spec/conformance.md` section 8, and `spec/engine-gaps.json`,
which is the list
Severity: nothing fails today, because no case reaches any of them; that is the
shape issue 0020 was, and it is recorded here rather than left for the first
surface case to find

## What is wrong

Issue 0020 found that the second engine had no array calls and no `print`, and
that the two engine gate had been green because no case reached either. Closing
it, the two manifests were compared whole for the first time. The first engine
holds 251 library entries and the second 209. The forty two the second lacks are
in six families:

| Family | Entries | What the second engine does with a program calling one |
|---|---|---|
| Drawing objects, `draw.*` | 20 | Refuses it at load, OS6006 naming the `objects` tag |
| Grids, `cell` | 1 | Refuses it at load, OS6006 naming the `tables` tag |
| The date namespace, `date.*` | 15 | Refuses it at load, OS6004 naming the function |
| Two chart facts derived from the interval | 2 | The same |
| Two session calls | 2 | The same |
| The status of a request, `req.isReady` and `req.error` | 2 | The same |

Each refusal is honest: a program the engine cannot run is refused before a bar,
naming what it lacks. What is not honest is the identity beside it. The adapter
claims `strategy`, `conformance.md` section 8 makes a profile cumulative, and
`strategy` includes `chart`, whose `surface`, `time` and `external` categories
cover every family above.

## What now stops it growing

`scripts/check-manifests.mjs` asks each engine for its manifest on every build,
the first from its built library and the second through
`engine/tools/manifest.py`, and fails on a gap `spec/engine-gaps.json` does not
record, on a recorded gap that has closed, and on an entry only the second engine
holds. The forty two are recorded there, each with its reason. The list only
shrinks.

## What closes this

The list empty: each family implemented in the second engine, to agree with the
first on every case that reaches it, with at least one case per family in the
suite so that the agreement is measured rather than assumed. Until then the
honest alternative is for the adapter to claim a profile it meets, and there is
none between `core` and `chart` for it to claim, which is itself worth deciding
if the list does not empty soon.

## Progress

**2026-09-24: three of the six families closed, nineteen entries.** The date
namespace, the two session calls and the two chart facts derived from the
interval are served by the second engine, from tables beside the ones it
already had: `dates.py` for the fifteen `date.*` entries, the session hours it
already read for `session.isIn` and `session.isLastBar`, and the interval it is
handed for `chart.intervalMinutes` and `chart.isIntraday`. Nine cases reach
them, each with its expected columns computed by the author from an
implementation neither engine uses, and both engines agree with those columns
exactly: `time/date-fields`, `time/clock-fields`, `time/day-of-week`,
`time/week-of-year`, `time/boundaries`, `time/format`, `session/flags`,
`session/window-spec` and `chart/interval`. `spec/engine-gaps.json` shrank from
forty two rows to twenty three.

What remains is the three families that are more than a table: grids, drawing
objects, and the status of a request, which needs the second engine to execute
a request at all.

**2026-09-24: grids and drawing objects closed, twenty one entries.** The second
engine now holds a drawing roster and the declared grids (`objects.py`), taken
into its checkpoint beside the cells so a re-executed bar leaves one object and
not one per execution, and it refuses a deleted object in a setter (OS4005), a
cell outside its grid (OS4008) and the object past the ceiling both engines
state (OS5010). Neither engine answered the `drawings` or `table` channel
before, because `conformance.md` never said what one element of either holds;
section 4 now does (decision 72), both adapters answer them, and twenty eight
cases under `cases/draw`, `cases/obj` and `cases/table` hold both engines to
expectations worked out by hand from the scripts. `spec/engine-gaps.json` is
down to two rows.

What remains is `req.isReady` and `req.error`, which need the second engine to
execute a request at all: a program with one is refused at load today on the
`req.timeframe` or `req.symbol` tag, and neither conformance adapter serves the
secondary series `conformance.md` section 3 describes.

**2026-09-24: the status of a request closed, the last two entries, and the
issue with them.** The second engine executes reads. `buckets.py` is the
timeframe grammar and `compiled-program.md` 2.16.2's keys, dated with the
calendar `civil.py` and `zones.py` already had; `request_plan.py` settles each
read's identity at load and raises OS6001, OS6002 and OS6015 there;
`request_body.py` runs a read's expression once per requested bar over its own
tables, on the same machine; and `requests.py` is the fold in its three modes,
the value landing in the read's register, and `req.isReady` and `req.error`. A
re-executed moving bar restores where each fold stood when the bar began, taken
into `run.py`'s checkpoint beside the drawing roster, and rebuilds the bucket
then forming from the revision. A run serves `req.timeframe` always, because it
folds its own bars, and `req.symbol` only when it is handed a provider, as the
first engine's `capabilitiesFor` does. The sentence `req.error` hands a script is
the catalogue's own message, carried in `reasons.py` and held to
`spec/errors.json` by a test, because a value two engines spell differently is a
disagreement on every bar that reads it.

Both adapters serve a read of another instrument from the case's own
`bars.<SYMBOL>.csv`, and a read whose file is missing is `error` naming the
file. `conformance.md` section 3 now says what the file is named after, which
timeframe it holds and that a read of the chart's own instrument reads no file
(decision 73). The first engine's backtest drive takes the provider as an option
and behaves as before without one; its walk now hands the fold the whole dataset
before bar 0, because a `"lookahead"` read over history reads a bucket in full
(`stdlib.md` 15.3, `compiled-program.md` 2.16.2) and the walk had been answering
it with the bucket so far. Nine cases under `cases/req` hold both engines to
columns computed from the bars without either engine, and both agree with them
exactly; seven of their feature rows are `implemented`, and `req/symbol` and
`req/status` stay `specified` because a case's host cannot show a request's
lifecycle, a host still fetching or a host's refusal, which the engine's own
tests reach instead. `spec/engine-gaps.json` is empty: each engine holds 251
library entries, and they are the same 251.

What this does not close, recorded where each lives: the second engine's
adapter still declines `ticks.csv`, so the rollback of a read's fold on a moving
bar is held by `engine/tests/test_requests.py` rather than by a case; and a
calendar read in a zone other than UTC is `unsupported` there, for the reason
`zones.py` gives.
