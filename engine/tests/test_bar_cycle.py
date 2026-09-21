"""The eleven steps, measured against the worked example the page prints.

Section 12 is a short script, its program in full, and a bar by bar trace
including a re-executed moving bar. It exercises an input, a stateful library
call, a value that persists across bars, a branch, a marker, a plot and warmup,
which is most of what an engine does, and the specification states every
intermediate value it reaches.

**Both the program and the expected table are read out of the page.** The
example this engine is measured against is the one a reader of the specification
is measured against, and a change to either is a change to this test rather than
a thing somebody has to notice. A copy here would be the second place the example
lives, and the second place is the one nobody updates.

The library is one function, written from ``stdlib.md`` section 20.2.1's
accumulation order: the sum of the last ``len`` values, oldest to newest, divided
by ``len``. It is in this file rather than imported because this is a test about
the machine, and a machine that could only be tested with the real library would
be a machine welded to it.
"""

import copy
import re
import unittest

from tests import support
from tests.support import SPEC

from openscript.contracts import Bar, BarState, LibraryEntry
from openscript.run import load
from openscript.values import ABSENT
from openscript.verify import capabilities

ROW = re.compile(r"^\|(.+)\|\s*$")


def rolling_mean(arguments, state, context):
    """``sma``: absent until it has seen ``len`` values, then the window's mean.

    The accumulation is a loop and not a sum over the window by any shorter
    route, because the order is what decides the last bit and ``stdlib.md``
    fixes it.
    """
    source, length = arguments
    if source is ABSENT or length is ABSENT:
        return ABSENT
    window = int(length)
    queue = state.setdefault("queue", [])
    queue.append(source)
    state["seen"] = state.get("seen", 0) + 1
    if len(queue) > window:
        del queue[: len(queue) - window]
    if len(queue) < window:
        return ABSENT
    total = 0.0
    for one in queue:
        total = total + one
    return total / window


def library():
    return support.Library(
        {"sma": LibraryEntry("sma", 2, True, "none")}, {"sma": rolling_mean}
    )


def traced_bars():
    """Section 12.6's table: one row per execution, as the page writes it."""
    page = (SPEC / "compiled-program.md").read_text(encoding="utf-8")
    start = page.index("### 12.6 Bars 0 to 4")
    block = page[start : page.index("### 12.7 The moving bar")]
    rows = []
    for line in block.splitlines():
        matched = ROW.match(line)
        if matched is None:
            continue
        cells = [one.strip().strip("`") for one in matched.group(1).split("|")]
        if len(cells) != 8 or not cells[0][0].isdigit():
            continue
        rows.append(cells)
    return rows


def as_value(written):
    if written in ("absent", "null", "none"):
        return ABSENT
    if written == "true":
        return True
    if written == "false":
        return False
    return float(written)


class TheWorkedExample(unittest.TestCase):
    def setUp(self):
        self.rows = traced_bars()
        result = load(
            support.worked_example(), {}, library(), capabilities=capabilities()
        )
        self.assertTrue(result.ok, msg=str(result.diagnostic))
        self.run = result.run

    def test_the_page_was_actually_read(self):
        # Five bars and six executions, the moving bar counted twice.
        self.assertEqual(len(self.rows), 6)

    def test_the_program_the_page_prints_loads(self):
        self.assertEqual(self.run.program.raw["openscript"]["format"], "1.1")
        self.assertEqual(len(self.run.channels.values), 2)

    def test_every_row_of_the_trace(self):
        for at, cells in enumerate(self.rows):
            label, close, region, avg, compared, hits, plotted, marker = cells
            index = int(label.split()[0])
            confirmed = "execution" not in label
            state = BarState(
                is_new=at == index,
                is_confirmed=confirmed,
                is_realtime=not confirmed,
                updates=1.0 if confirmed else float(label.count("second") + 1),
            )
            out = self.run.execute_bar(
                index,
                Bar(time=float(index), open=None, high=None, low=None, close=float(close)),
                state,
                supplied=5,
            )
            with self.subTest(bar=label):
                self.assertTrue(out.ok, msg=str(out.diagnostic))
                # The plot column and the average are one value: the script
                # plots what the call answered.
                self.assertEqual(out.columns[0], as_value(plotted))
                self.assertEqual(out.columns[0], as_value(avg))
                self.assertEqual(self.run.cells.values[0], as_value(hits))
                self.assertEqual(
                    self.run.states.regions[0],
                    {"queue": _queue(region), "seen": _seen(region)},
                )
                self._marker(out, marker)

    def _marker(self, out, marker):
        """What the trace's last column means, in the two halves step 8 and 9 split."""
        if marker == "UP":
            self.assertEqual(out.columns[1], "UP")
            self.assertIn(1, out.applied_channels)
            return
        if marker == "held":
            # Written to the channel and not applied: the bar is not confirmed
            # and onUnconfirmed is false, so step 8 published the drawing and
            # step 9 threw the marker away.
            self.assertEqual(out.columns[1], "UP")
            self.assertNotIn(1, out.applied_channels)
            return
        self.assertIs(out.columns[1], ABSENT)

    def test_the_first_bar_draws_nothing_and_nothing_declared_a_warmup(self):
        out = self.run.execute_bar(
            0, Bar(time=0.0, open=None, high=None, low=None, close=100.0),
            support.confirmed(), supplied=5,
        )
        # The whole of warmup: the library has not seen enough values, the
        # comparison is absent rather than false, and the branch is not taken.
        self.assertIs(out.columns[0], ABSENT)
        self.assertIs(out.columns[1], ABSENT)
        self.assertEqual(self.run.cells.values[0], 0.0)


def _queue(written):
    inside = written[written.index("[") + 1 : written.index("]")]
    return [float(one) for one in inside.split(",")]


def _seen(written):
    return int(written[written.index("]") + 1 :].strip(" ,}"))


class TheRollback(unittest.TestCase):
    """Section 12.7: what the restore is for, stated as a difference in numbers."""

    def setUp(self):
        result = load(support.worked_example(), {}, library(), capabilities=capabilities())
        self.run = result.run
        for at, close in enumerate((100.0, 102.0, 101.0, 105.0)):
            self.run.execute_bar(
                at, Bar(time=float(at), open=None, high=None, low=None, close=close),
                support.confirmed(), supplied=5,
            )

    def _moving(self, close):
        return self.run.execute_bar(
            4, Bar(time=4.0, open=None, high=None, low=None, close=close),
            BarState(is_new=False, is_confirmed=False, is_realtime=True, updates=1.0),
            supplied=5,
        )

    def test_the_checkpoint_at_the_end_of_bar_three_is_what_the_page_says(self):
        self.assertEqual(self.run.cells.values[0], 2.0)
        self.assertEqual(self.run.states.regions[0], {"queue": [101.0, 105.0], "seen": 4})
        self.assertEqual(self.run.registers[0].length, 4)

    def test_executing_the_moving_bar_twice_gives_what_executing_it_once_gives(self):
        first = self._moving(104.0)
        cells, regions = list(self.run.cells.values), copy.deepcopy(self.run.states.regions)
        again = self._moving(104.0)
        self.assertEqual(first.columns, again.columns)
        self.assertEqual(cells, self.run.cells.values)
        self.assertEqual(regions, copy.deepcopy(self.run.states.regions))

    def test_without_the_restore_the_second_execution_would_be_a_number_of_no_two_bars(self):
        self._moving(106.0)
        self.assertEqual(self.run.states.regions[0]["queue"], [105.0, 106.0])
        out = self._moving(104.0)
        # Without the restore the queue would be [106, 104], an average of 105,
        # and hits would have stayed at 3, counting a crossing that did not
        # happen.
        self.assertEqual(self.run.states.regions[0]["queue"], [105.0, 104.0])
        self.assertEqual(out.columns[0], 104.5)
        self.assertEqual(self.run.cells.values[0], 2.0)

    def test_the_history_is_truncated_rather_than_appended_to(self):
        self._moving(106.0)
        self.assertEqual(self.run.registers[0].length, 5)
        self._moving(104.0)
        self.assertEqual(self.run.registers[0].length, 5)
        self.assertEqual(self.run.registers[0].history[4], 104.0)


class TheReplayInvariant(unittest.TestCase):
    """Section 6.4, which the suite tests by re-running and comparing.

    Restoring the checkpoint at the end of bar ``k - 1`` and executing bar ``k``
    again must produce state and output identical to the original run's. This is
    the property a chart replay, a step-backwards debugger and a reproducible
    backtest all rest on, and it is testable rather than aspirational.
    """

    def test_every_bar_of_the_worked_example_replays_identically(self):
        closes = (100.0, 102.0, 101.0, 105.0, 106.0)
        run = load(support.worked_example(), {}, library(), capabilities=capabilities()).run

        def at_bar(index):
            return Bar(time=float(index), open=None, high=None, low=None, close=closes[index])

        # The original run, with the state at the start of each bar kept and the
        # state at the end of it recorded.
        starts, ends = [], []
        for at in range(len(closes)):
            starts.append(run.checkpoint())
            out = run.execute_bar(at, at_bar(at), support.confirmed(), supplied=5)
            ends.append(
                (
                    out.columns,
                    list(run.cells.values),
                    copy.deepcopy(run.states.regions),
                    [list(one.history) for one in run.registers],
                )
            )

        # Then each bar re-run from the checkpoint before it, on the same engine
        # that has already run every bar after it. A restore that forgot the
        # register lengths, or one that recreated a state region from history
        # instead of putting back the record it copied, would part company here.
        for at in range(len(closes)):
            with self.subTest(bar=at):
                run.restore(starts[at])
                out = run.execute_bar(at, at_bar(at), support.confirmed(), supplied=5)
                self.assertEqual(
                    (
                        out.columns,
                        list(run.cells.values),
                        copy.deepcopy(run.states.regions),
                        [list(one.history) for one in run.registers],
                    ),
                    ends[at],
                )


if __name__ == "__main__":
    unittest.main()
