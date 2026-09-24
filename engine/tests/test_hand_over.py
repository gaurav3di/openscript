"""The bars a host hands over, ``host-interface.md`` 3.5: no time, and out of order.

The first engine refused a bar out of order with OS6011 since phase six, and this
one did not: it ran whatever it was handed, so the two engines disagreed about a
series neither case in the suite ever supplied. Issue 0012 added the third case,
a bar dated nothing, which the order comparison cannot see because it needs two
instants, and which is OS6025 in both engines.

Each test names the engine it would catch.
"""

import math
import unittest

from tests import support
from tests.test_bar_cycle import library

from openscript.contracts import Bar
from openscript.run import load
from openscript.verify import capabilities


def _run():
    return load(support.worked_example(), {}, library(), capabilities=capabilities()).run


def _bar(time, close=100.0):
    return Bar(time, close, close, close, close, 1.0)


class HandOver(unittest.TestCase):
    def test_a_bar_with_no_time_is_os6025_naming_it(self):
        # Catches an engine that reads the missing time as absent and runs the
        # bar, which steps it over every calendar fold on a bar that is on the
        # chart, and one that reaches for OS6011, whose sentence is about an
        # order nobody violated.
        run = _run()
        self.assertIsNone(run.execute_bar(0, _bar(60_000.0), support.confirmed()).diagnostic)
        for missing in (None, math.nan, math.inf, True, "09:15"):
            refused = run.execute_bar(1, _bar(missing), support.confirmed()).diagnostic
            self.assertIsNotNone(refused, missing)
            self.assertEqual(refused.code, "OS6025")
            self.assertEqual(refused.values["index"], 1)

    def test_the_same_time_twice_is_os6011_on_the_second(self):
        # Catches an engine that deduplicates silently or folds the bar in twice.
        run = _run()
        run.execute_bar(0, _bar(60_000.0), support.confirmed())
        refused = run.execute_bar(1, _bar(60_000.0), support.confirmed()).diagnostic
        self.assertEqual(refused.code, "OS6011")
        self.assertEqual(dict(refused.values), {"index": 1, "time": 60_000.0, "previous": 0})

    def test_a_revision_of_the_newest_bar_is_held_to_the_bar_before_it(self):
        # Catches an engine that checks only a new index: a moving bar handed
        # back onto the bar before it is the same disorder under another name.
        run = _run()
        run.execute_bar(0, _bar(60_000.0), support.confirmed())
        self.assertIsNone(run.execute_bar(1, _bar(120_000.0), support.moving()).diagnostic)
        refused = run.execute_bar(1, _bar(30_000.0), support.moving()).diagnostic
        self.assertEqual(refused.code, "OS6011")

    def test_an_ordinary_series_is_accepted(self):
        # Catches the check overreaching onto a series in order.
        run = _run()
        for index in range(5):
            result = run.execute_bar(index, _bar(60_000.0 * (index + 1)), support.confirmed())
            self.assertIsNone(result.diagnostic)


if __name__ == "__main__":
    unittest.main()
