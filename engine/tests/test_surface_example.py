"""The markers of the worked example, against the column the page prints for them.

``compiled-program.md`` section 12 is a script, its compiled program in full and
a trace of six executions over five bars, and one of its columns is the marker.
Three of the six rows are the ones this package exists to get right: the two
bars where the marker is drawn, and the first execution of the moving bar, which
the page prints as ``held`` because step 8 published the text and step 9 threw it
away.

**The program and the expectation are both read out of the page.** The program
comes through ``support.worked_example`` and the marker column through the
reader ``test_bar_cycle`` already has, so this test is measured against the same
example a reader of the specification is measured against and a change to it is a
change here. A copy of either would be the second place it lives.

The library is that test's as well: one function, ``sma``, written from
``stdlib.md`` 20.2.1's accumulation order. This is a test about a surface, and a
surface that could only be tested with the real library would be a surface
welded to it.
"""

import unittest

from tests import support
from tests.test_bar_cycle import library, traced_bars

from openscript.adapter.spellings import as_reported
from openscript.contracts import Bar, BarState
from openscript.run import load
from openscript.surface import ANSWERED, surface_channels
from openscript.verify import capabilities

#: The page's spelling for a marker that was written and not applied, and for a
#: bar that wrote none.
HELD = "held"
NONE = "none"


def executions_of(run, rows):
    """Every execution the trace prints, in the order the page prints them."""
    out = []
    for at, cells in enumerate(rows):
        label, close = cells[0], cells[1]
        index = int(label.split()[0])
        confirmed = "execution" not in label
        out.append(
            run.execute_bar(
                index,
                Bar(time=float(index), open=None, high=None, low=None, close=float(close)),
                BarState(
                    is_new=at == index,
                    is_confirmed=confirmed,
                    is_realtime=not confirmed,
                    updates=1.0,
                ),
                supplied=5,
            )
        )
    return out


def drawn_by_the_page(rows, key):
    """The markers channel the page's own column describes.

    The last execution of a bar is the bar (section 6.4), so a bar's row is the
    last one the table prints for it, and a marker is drawn where that row says
    the text was drawn. That is how ``held`` and the second execution of bar 4
    become one answer rather than two.
    """
    last = {}
    for cells in rows:
        last[int(cells[0].split()[0])] = cells[7]
    return [
        {"barIndex": index, "key": key, "text": last[index]}
        for index in sorted(last)
        if last[index] not in (HELD, NONE)
    ]


class TheMarkersOfTheWorkedExample(unittest.TestCase):
    def setUp(self):
        self.rows = traced_bars()
        result = load(support.worked_example(), {}, library(), capabilities=capabilities())
        self.assertTrue(result.ok, msg=str(result.diagnostic))
        self.run = result.run
        self.key = self.run.program.raw["outputs"]["markers"][0]["key"]

    def test_the_page_was_actually_read(self):
        # Six executions, one of them held. Without this the comparison below
        # would pass over two empty lists.
        self.assertEqual(len(self.rows), 6)
        self.assertIn(HELD, [cells[7] for cells in self.rows])

    def test_the_markers_channel_is_the_column_the_page_prints(self):
        found = surface_channels(
            self.run.program, executions_of(self.run, self.rows), as_reported
        )
        # Two markers, on the two bars whose row says UP. A projection that
        # ignored deferral draws a third on the moving bar, and one that
        # counted both executions of that bar draws a fourth.
        self.assertEqual(found["markers"], drawn_by_the_page(self.rows, self.key))
        self.assertEqual([row["barIndex"] for row in found["markers"]], [1, 3])

    def test_the_example_declares_nothing_else_and_nothing_else_is_answered(self):
        found = surface_channels(
            self.run.program, executions_of(self.run, self.rows), as_reported
        )
        # Every channel this package answers is present and the four the example
        # declares none of are empty: an answered channel is a list, and a
        # missing one would leave the adapter comparing nothing at all.
        self.assertEqual(sorted(found), sorted(ANSWERED))
        for name in ("fills", "levels", "barColors", "background"):
            with self.subTest(channel=name):
                self.assertEqual(found[name], [])


if __name__ == "__main__":
    unittest.main()
