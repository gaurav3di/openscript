"""The floor everything else in this engine is built on.

Three things, none of them about the language yet, all of them things a later
stage would otherwise assume without ever checking:

**The runner refuses a run that proved nothing.** Held here rather than trusted,
because the guard in ``tools/run_tests.py`` is the one piece of the harness that
only runs when something has already gone wrong.

**This interpreter's arithmetic is the arithmetic the specification requires.**
``language.md`` section 7.6 asks for binary64, round to nearest even, evaluated
in source order, with no reassociation and no extended precision. Python floats
are binary64 on every platform worth shipping on, but "worth shipping on" is an
assumption, and an interpreter that kept an intermediate in a wider register
would agree with the other engine on almost everything and disagree in the last
bit of an accumulation, which is the one failure this port exists to avoid.

**The oracle loads and decodes.** ``spec/vectors/number-text.json`` spells every
row twice, as a bit pattern and as a number a JSON reader builds, so packing one
and comparing it with the other is a real question with a wrong answer. Every
vector this port is measured against is decoded exactly this way, so a mistake
here would not be a failing test, it would be a suite that compares two wrong
numbers and agrees with itself.
"""

import json
import struct
import sys
import unittest
from pathlib import Path

from tools.run_tests import ENGINE, refusal

REPOSITORY = ENGINE.parent
NUMBER_TEXT = REPOSITORY / "spec" / "vectors" / "number-text.json"

#: A binary64 value as the sixteen hexadecimal digits every vector file holds.
def pattern(value):
    return struct.pack(">d", value).hex()


class TheRunnerRefusesARunThatProvedNothing(unittest.TestCase):
    """The guard in tools/run_tests.py, asked the questions it exists for.

    Without these, the wrong implementation that passes is the obvious one: a
    runner that reports the standard library's exit code and nothing else. That
    runner prints "OK" over a discovery that found no tests at all, which is the
    failure this repository has already paid for four times on the other side of
    the tree.
    """

    def test_a_discovery_that_found_nothing_is_refused(self):
        self.assertIsNotNone(refusal(0, 0, 0, 0))

    def test_a_test_that_was_discovered_and_did_not_run_is_refused(self):
        self.assertIsNotNone(refusal(12, 11, 0, 0))

    def test_a_failure_is_refused(self):
        self.assertIsNotNone(refusal(12, 12, 1, 0))

    def test_an_error_is_refused(self):
        self.assertIsNotNone(refusal(12, 12, 0, 1))

    def test_a_run_that_proved_something_stands(self):
        self.assertIsNone(refusal(12, 12, 0, 0))


class TheArithmeticUnderneath(unittest.TestCase):
    """Binary64, round to nearest even, in the order the source is written."""

    def test_a_float_is_binary64(self):
        self.assertEqual(sys.float_info.mant_dig, 53)
        self.assertEqual(sys.float_info.radix, 2)
        self.assertEqual(sys.float_info.max_exp, 1024)
        self.assertEqual(sys.float_info.min_exp, -1021)

    def test_a_sum_rounds_to_nearest_even_and_keeps_no_extra_precision(self):
        # The one every reader recognises, and the row the vectors carry for it.
        # An interpreter holding this sum in a wider register would produce the
        # exact tenth and pass every test that compares against 0.3.
        self.assertEqual(pattern(0.1 + 0.2), "3fd3333333333334")

    def test_the_order_of_an_accumulation_decides_the_last_bit(self):
        # Not a property of this interpreter: a property of the arithmetic, and
        # the reason stdlib.md fixes an order for every function that
        # accumulates. Left to right and right to left are one bit apart here,
        # and a library written to either one passes its own tests.
        self.assertEqual(pattern(0.1 + 0.2 + 0.3), "3fe3333333333334")
        self.assertEqual(pattern(0.1 + (0.2 + 0.3)), "3fe3333333333333")

    def test_nothing_reassociates_a_sum_that_cancels(self):
        # The cancelling triple, where reassociation is not one bit but the
        # whole answer. A compiler that rearranged this would give zero.
        large, negated, one = 1e16, -1e16, 1.0
        self.assertEqual((large + negated) + one, 1.0)
        self.assertEqual(large + (negated + one), 0.0)


class TheOracleThisPortIsMeasuredAgainst(unittest.TestCase):
    """The vectors load from here, and a bit pattern decodes to the value beside it."""

    def setUp(self):
        if not NUMBER_TEXT.exists():
            self.fail(
                f"{NUMBER_TEXT} is not there. The engine's tests read the vectors out of "
                "the repository they sit in, so a copy of engine/ on its own cannot run "
                "them. Run them from a clone."
            )
        self.rows = json.loads(NUMBER_TEXT.read_text(encoding="utf-8"))["vectors"]

    def test_the_file_holds_rows(self):
        # A test that iterates an empty list passes and proves nothing, which is
        # the same green tick as a discovery that found no tests.
        self.assertGreater(len(self.rows), 20)

    def test_every_row_packs_to_the_pattern_it_carries(self):
        for row in self.rows:
            with self.subTest(note=row["note"]):
                self.assertEqual(pattern(row["value"]), row["bits"])

    def test_every_pattern_unpacks_to_the_value_it_carries(self):
        for row in self.rows:
            with self.subTest(note=row["note"]):
                decoded = struct.unpack(">d", bytes.fromhex(row["bits"]))[0]
                # Compared as patterns, not as floats: the two zeros are equal
                # as numbers and are different rows here.
                self.assertEqual(pattern(decoded), row["bits"])
                self.assertEqual(pattern(decoded), pattern(row["value"]))
