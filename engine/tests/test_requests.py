"""The fold of a read, and above all what a re-executed moving bar does to it.

The conformance cases under ``cases/req`` hold both engines to the fold over a
history: which requested bar each chart bar may see, in each mode. What no case
reaches is the moving bar, because this engine's adapter declines ``ticks.csv``:
the newest chart bar executed again, perhaps revised, which is where a fold that
kept its position from the last execution folds one bar twice. So that is what
is here, driven through ``Run`` bar by bar, each test naming the wrong
implementation it was run against and failed on before it was kept.

The bars are ``request_support.py``'s: five minute bars from 10:00, priced by
index, so bar 11 is the last of the 10:00 hour and bar 12 the first of the next.
"""

import unittest
from dataclasses import replace

from tests.request_support import CHART, body, columns, five_minutes, loaded, read, reading

from openscript.contracts import BarState
from openscript.request_body import carry
from openscript.values import ABSENT, ArrayValue


def hourly(field, mode, **given):
    """One read of a bar field at an hour, in one mode, as a program."""
    return reading([read(0, "1h", mode, 0, body(field))], **given)


class ARevisedBarReachesItsBucket(unittest.TestCase):
    """Wrong: a re-execution that kept the bucket it had built, or folded the bar into it again."""

    def test_a_revision_reaches_the_bucket_and_a_second_rolls_it_back(self):
        # Against a restore that did nothing, the revised high never reached the
        # bucket (103.5 after the first revision); against one that put the
        # position back but kept the bucket already built, the bar was folded in
        # twice and the high ratcheted (200 after the second). Both failed here.
        result = loaded(hourly("high", "developing"))
        run = result.run
        bars = five_minutes(4)
        for index, bar in enumerate(bars):
            run.execute_bar(index, bar, BarState(is_confirmed=False), supplied=4, instrument=CHART)
        self.assertEqual(run.execute_bar(3, bars[3], BarState(is_confirmed=False), supplied=4, instrument=CHART).columns[0], 103.5)
        revised = replace(bars[3], high=200.0)
        moving = BarState(is_new=False, is_confirmed=False, updates=2.0)
        self.assertEqual(run.execute_bar(3, revised, moving, supplied=4, instrument=CHART).columns[0], 200.0)
        back = run.execute_bar(3, bars[3], replace(moving, updates=3.0), supplied=4, instrument=CHART)
        self.assertEqual(back.columns[0], 103.5)

    def test_every_bar_executed_again_leaves_the_columns_executing_it_once_does(self):
        # Against a restore that put the position back and kept the bucket, every
        # re-execution added the bar's volume to the bucket again: the developing
        # volume read 50 on the second bar, where two bars of 10 make 20.
        made = reading([
            read(0, "1h", "developing", 0, body("volume")),
            read(1, "1h", "confirmed", 1, body("close")),
            read(2, "1h", "lookahead", 2, body("high")),
        ])
        bars = five_minutes(30)
        self.assertEqual(columns(made, bars, again=3), columns(made, bars))
        self.assertEqual(columns(made, bars, again=3)[0][:3], [10.0, 20.0, 30.0])


class ABucketClosesOnce(unittest.TestCase):
    """Wrong: a bar that closed a bucket closing it again when it is executed again."""

    def test_the_bar_that_closes_a_bucket_settles_it_once_however_often_it_runs(self):
        # The expression counts requested bars, so a bucket settled again shows
        # as a later index where the first hour is 0. Against a fold with no
        # guard on the highest bucket closed, bar 12 read 2 after it had run
        # three times, one settle of the same hour per execution.
        made = hourly("bar.index", "confirmed")
        bars = five_minutes(24)
        column = columns(made, bars, again=2)[0]
        self.assertEqual(column[:12], [ABSENT] * 12)
        self.assertEqual(column[12:], [0.0] * 12)


class ReadsWrittenInsideReads(unittest.TestCase):
    """Wrong: a body that kept a nested fold's position across two executions of one requested bar."""

    def nested(self):
        inner = read(1, "4h", "developing", 1, body("close"))
        outer = body("close", code=[["SLOAD", 1], ["RET"]], requests=[inner], extra=1)
        return reading([read(0, "1h", "developing", 0, outer)])

    def test_a_nested_read_folds_the_requested_bars_of_the_read_around_it(self):
        # The inner read folds the hours the outer one forms, and the hour it is
        # inside grows on every chart bar. Against a body that did not restore
        # the inner fold between two executions of one hour, the inner read kept
        # the hour as it stood on its first chart bar: 100 on bar 11, not 111.
        column = columns(self.nested(), five_minutes(24))[0]
        self.assertEqual(column[11], 111.0)
        self.assertEqual(column[23], 123.0)

    def test_a_nested_read_is_idempotent_on_a_moving_bar(self):
        bars = five_minutes(24)
        self.assertEqual(columns(self.nested(), bars, again=2), columns(self.nested(), bars))


class AHistoryAndAFeed(unittest.TestCase):
    """Wrong: a run over a dataset that folded a lookahead read one bar at a time."""

    def test_a_lookahead_read_reads_the_whole_bucket_only_of_a_history(self):
        # Against a history() that held nothing, the lookahead read on bar 0 was
        # the bucket so far, 100, which is the live chart's reading on history.
        made = hourly("close", "lookahead")
        bars = five_minutes(24)
        self.assertEqual(columns(made, bars)[0][0], 111.0)
        self.assertEqual(columns(made, bars, history=False)[0][0], 100.0)

    def test_a_confirmed_and_a_developing_read_do_not_notice_the_difference(self):
        for mode in ("confirmed", "developing"):
            with self.subTest(mode=mode):
                made = hourly("close", mode)
                bars = five_minutes(30)
                self.assertEqual(columns(made, bars), columns(made, bars, history=False))


class ABodyThatFails(unittest.TestCase):
    """Wrong: a body's refusal escaping the bar rather than stopping it."""

    def test_a_refusal_inside_a_read_stops_the_bar_at_the_body_s_position(self):
        # A history offset of minus one is OS4001. Against a bar that filled the
        # reads outside the guard step 6 has, the refusal left execute_bar as an
        # exception and this test errored instead of reading a diagnostic.
        inner = body("close", code=[["CONST", 3], ["HIST", 0], ["RET"]])
        made = reading([read(0, "1h", "developing", 0, inner)])
        made["consts"] = made["consts"] + [["n", -1]]
        out = loaded(made).run.execute_bar(0, five_minutes(1)[0], BarState(), supplied=1, instrument=CHART)
        self.assertEqual(out.diagnostic.code, "OS4001")
        self.assertEqual((out.diagnostic.line, out.diagnostic.column), (3, 5))


class AnArrayCrossesTwoMachines(unittest.TestCase):
    """Wrong: the chart handed the body's own array rather than a copy of it."""

    def test_a_copy_shares_what_the_value_shared_and_nothing_with_the_body(self):
        inner = ArrayValue([1.0])
        held = ArrayValue([2.0, inner, inner])
        copied = carry(held)
        self.assertIsNot(copied, held)
        self.assertIsNot(copied.elements[1], inner)
        self.assertIs(copied.elements[1], copied.elements[2])
        self.assertEqual(copied.elements[1].elements, [1.0])

    def test_every_bar_that_reads_an_array_reads_a_copy_of_its_own(self):
        # Against a carry that handed the value over as itself, bars 12 and 13
        # held the one array the body settled, so a push on one bar would have
        # reached the next bar's value and the body's memory with it.
        inner = body("close", code=[["SLOAD", 0], ["ARRAY", 1], ["RET"]])
        made = reading([read(0, "1h", "confirmed", 0, inner)])
        made["requires"] = sorted(set(made["requires"]) | {"arrays"})
        column = columns(made, five_minutes(14))[0]
        self.assertEqual(column[12].elements, [111.0])
        self.assertIsNot(column[12], column[13])


if __name__ == "__main__":
    unittest.main()
