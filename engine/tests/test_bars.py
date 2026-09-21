"""The bar registers, and the order of operations that is part of the contract.

Section 2.10 writes the derived price fields out as expressions rather than as
formulas, and says why: ``hlc3`` adds high to low, adds close to that, then
divides. A different association gives a different last bit, and a study that
matches a reference implementation on one engine and not on another is exactly
the failure this project exists to prevent.

So each of the four is measured against a triple where the two associations
really do differ, chosen for that property and compared as bit patterns rather
than as numbers. An engine that associated the other way is correct to within an
ulp and wrong for this project, and a test that compared the values would not
notice.

The second half is the split between what a host states and what the engine
derives. Four facts each, and a fact the engine can derive is never also stated
by the host, because two sources for one number can disagree and no rule would
say which of them wins.
"""

import struct
import unittest

from tests import support
from tests.support import channel, program, register

from openscript.bars import BAR_FIELDS, bar_field, facts_for, is_bar_field
from openscript.contracts import Bar, BarState
from openscript.run import load
from openscript.values import ABSENT


def bits(value):
    return struct.pack(">d", value).hex()


def read(field, bar, facts=None):
    return bar_field(field, bar, facts or facts_for(0, 1, support.confirmed()))


class TheDerivedPriceFields(unittest.TestCase):
    """Chosen so that the two associations differ, which is the whole point."""

    def test_hlc3_adds_high_to_low_then_close_then_divides(self):
        high, low, close = 58.9409258499321, 507.92829745623084, 38.458162783542896
        bar = Bar(time=0.0, open=1.0, high=high, low=low, close=close)
        self.assertEqual(bits(read("hlc3", bar)), bits((high + low + close) / 3))
        self.assertNotEqual(bits((high + low + close) / 3), bits((high + (low + close)) / 3))

    def test_ohlc4_adds_open_high_low_close_in_that_order(self):
        opened, high, low, close = (
            206.7527541065072,
            680.7195732086042,
            428.1647133637335,
            314.83302320641474,
        )
        bar = Bar(time=0.0, open=opened, high=high, low=low, close=close)
        self.assertEqual(bits(read("ohlc4", bar)), bits((opened + high + low + close) / 4))
        self.assertNotEqual(
            bits((opened + high + low + close) / 4),
            bits((opened + (high + (low + close))) / 4),
        )

    def test_hlcc4_counts_the_close_twice_in_the_order_it_is_written(self):
        high, low, close = 585.9763016441311, 453.7311919944046, 300.4672298668187
        bar = Bar(time=0.0, open=1.0, high=high, low=low, close=close)
        self.assertEqual(bits(read("hlcc4", bar)), bits((high + low + close + close) / 4))
        self.assertNotEqual(
            bits((high + low + close + close) / 4), bits((high + (low + (close + close))) / 4)
        )

    def test_hl2_is_the_midpoint(self):
        bar = Bar(time=0.0, open=1.0, high=3.0, low=2.0, close=1.0)
        self.assertEqual(read("hl2", bar), 2.5)

    def test_a_derived_field_is_absent_where_any_part_of_it_is(self):
        # An absent price propagates: a plot gaps rather than dropping to zero.
        bar = Bar(time=0.0, open=1.0, high=None, low=2.0, close=3.0)
        for field in ("hl2", "hlc3", "ohlc4", "hlcc4"):
            with self.subTest(field=field):
                self.assertIs(read(field, bar), ABSENT)

    def test_a_missing_volume_is_absent_and_not_a_zero(self):
        # Two different facts: zero means the host was watching and nobody
        # traded, absent means nobody stated it.
        self.assertIs(read("volume", Bar(0.0, 1.0, 1.0, 1.0, 1.0)), ABSENT)
        self.assertEqual(read("volume", Bar(0.0, 1.0, 1.0, 1.0, 1.0, volume=0.0)), 0.0)


class TheEightBarFacts(unittest.TestCase):
    def test_the_engine_derives_four_from_the_dataset_and_the_position_in_it(self):
        facts = facts_for(3, 10, support.confirmed())
        self.assertEqual(facts.index, 3)
        self.assertEqual(facts.count, 4)
        self.assertIs(facts.is_first, False)
        self.assertIs(facts.is_last, False)

    def test_the_newest_bar_is_the_last_and_the_oldest_is_the_first(self):
        self.assertIs(facts_for(0, 10, support.confirmed()).is_first, True)
        self.assertIs(facts_for(9, 10, support.confirmed()).is_last, True)

    def test_the_host_states_the_other_four(self):
        state = BarState(is_new=False, is_confirmed=False, is_realtime=True, updates=7.0)
        facts = facts_for(2, 5, state)
        self.assertIs(facts.is_new, False)
        self.assertIs(facts.is_confirmed, False)
        self.assertIs(facts.is_realtime, True)
        self.assertEqual(facts.updates, 7.0)

    def test_every_fact_reaches_a_register_by_its_own_name(self):
        facts = facts_for(2, 5, support.confirmed())
        bar = Bar(0.0, 1.0, 1.0, 1.0, 1.0)
        self.assertEqual(read("bar.index", bar, facts), 2.0)
        self.assertEqual(read("bar.count", bar, facts), 3.0)
        self.assertIs(read("bar.isFirst", bar, facts), False)
        self.assertIs(read("bar.isConfirmed", bar, facts), True)

    def test_the_field_list_is_the_one_the_page_names(self):
        self.assertTrue(is_bar_field("hlcc4"))
        self.assertTrue(is_bar_field("bar.updates"))
        self.assertFalse(is_bar_field("vwap"))
        self.assertEqual(len(BAR_FIELDS), len(set(BAR_FIELDS)))


class TheRegistersAreFilledBeforeTheCodeRuns(unittest.TestCase):
    """Step 4, through a program rather than through the helper above."""

    def test_a_bar_register_holds_the_field_it_names(self):
        built = program(
            [["SLOAD", 0], ["EMIT", 0], ["HALT"]],
            channels=[channel(0)],
            series=[register(0, "hlc3")],
        )
        result = load(built)
        self.assertTrue(result.ok, msg=str(result.diagnostic))
        bar = Bar(time=0.0, open=1.0, high=3.0, low=2.0, close=4.0)
        out = result.run.execute_bar(0, bar, support.confirmed())
        self.assertEqual(bits(out.columns[0]), bits((3.0 + 2.0 + 4.0) / 3))


class ThePoolIsBinary64(unittest.TestCase):
    """A number a program carries is a binary64 value and not whatever parsed it.

    The reader hands back this interpreter's own integer for a whole number, and
    that type is arbitrarily wide. A pool entry left as one would do exact
    arithmetic where the format requires binary64, and the two agree on every
    value small enough for anybody to notice.
    """

    def test_a_whole_number_too_large_for_binary64_lands_on_its_nearest_neighbour(self):
        built = program(
            [["CONST", 3], ["EMIT", 0], ["HALT"]],
            consts=support.RESERVED + [["n", 9007199254740993]],
            channels=[channel(0)],
        )
        result = load(built)
        self.assertTrue(result.ok, msg=str(result.diagnostic))
        out = result.run.execute_bar(0, support.flat(1.0), support.confirmed())
        self.assertEqual(bits(out.columns[0]), bits(9007199254740992.0))
        self.assertIsInstance(out.columns[0], float)


if __name__ == "__main__":
    unittest.main()
