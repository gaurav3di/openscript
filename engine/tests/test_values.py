"""Absence, which is the language's central idea and the machine's one branch.

Section 7 says it plainly: an engine that gets five rules right has the whole of
``language.md`` section 6, and an engine that special cases absence anywhere else
has a bug. The five are here, each against the wrong implementation that would
otherwise pass.

**Ordering answers absence and not false.** The mistake every engine makes once,
because ``false`` is what a host language's comparison against a null gives back.
A study whose average has not warmed up would then take the else branch on every
bar of its warmup and draw a confident line through it.

**Equality is total.** The opposite mistake, and the reason the two are split: an
operator that could itself be absent gives a script no way to ask whether a value
is absent at all.

**The logical operators are three valued, and the two tables here are read out of
the page.** An engine that treated absence as false under ``and`` would answer
``false`` where the page answers absence, and the difference is invisible until a
script branches on it.

**A branch absorbs absence.** The one place it is absorbed rather than
propagated, and it is unavoidable: execution has to go somewhere.

**A boolean is not a number.** This interpreter's own ``True`` equals ``1`` and
orders against it, so every rule above has to read the tag before the value.
"""

import re
import unittest

from tests.support import SPEC

from openscript.values import (
    ABSENT,
    ArrayValue,
    Colour,
    conjunction,
    disjunction,
    equal,
    finite,
    is_number,
    is_whole,
    negation,
    ordered,
    stored,
    tag,
    truthy,
)

CELL = re.compile(r"^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$")


def page_rows(heading: str, title: str):
    """One of section 4.7's two tables, read out of the page as three columns."""
    page = (SPEC / "compiled-program.md").read_text(encoding="utf-8")
    start = page.index(heading)
    block = page[start : page.index("### 4.8 Branching and loops")]
    rows = []
    wanted = False
    for line in block.splitlines():
        if title in line:
            wanted = True
            continue
        matched = CELL.match(line)
        if matched is None:
            if wanted and line.strip() == "":
                wanted = False
            continue
        left, right, answer = (one.strip("`") for one in matched.groups())
        if left in ("true", "false", "absent") and wanted:
            rows.append((left, right, answer))
    return rows


def as_value(written: str):
    return {"true": True, "false": False, "absent": ABSENT}[written]


class TheLogicTablesArePages(unittest.TestCase):
    def setUp(self):
        self.conjunction = page_rows("### 4.7 Logic", "a and b")
        self.disjunction = page_rows("### 4.7 Logic", "a or b")

    def test_both_tables_were_actually_read(self):
        self.assertEqual(len(self.conjunction), 9)
        self.assertEqual(len(self.disjunction), 9)

    def test_every_conjunction_row_is_what_this_engine_answers(self):
        for left, right, answer in self.conjunction:
            with self.subTest(row=f"{left} and {right}"):
                self.assertIs(conjunction(as_value(left), as_value(right)), as_value(answer))

    def test_every_disjunction_row_is_what_this_engine_answers(self):
        for left, right, answer in self.disjunction:
            with self.subTest(row=f"{left} or {right}"):
                self.assertIs(disjunction(as_value(left), as_value(right)), as_value(answer))

    def test_a_row_the_short_circuit_decides_answers_as_the_language_does(self):
        # The compiler emits a bare OR for the values of a switch case, so a
        # true left operand does reach the instruction. This file once answered
        # it with absence, and `case 1, 2` then matched only its last value:
        # cases/flow/switch-value is the case that found it.
        self.assertIs(conjunction(False, True), False)
        self.assertIs(conjunction(False, ABSENT), False)
        self.assertIs(disjunction(True, False), True)
        self.assertIs(disjunction(True, ABSENT), True)


class OrderingPropagatesAbsence(unittest.TestCase):
    def test_a_comparison_with_an_absent_side_is_absent(self):
        self.assertIs(ordered(ABSENT, 1.0), ABSENT)
        self.assertIs(ordered(1.0, ABSENT), ABSENT)
        self.assertIs(ordered(ABSENT, ABSENT), ABSENT)

    def test_two_numbers_compare_numerically(self):
        self.assertEqual(ordered(1.0, 2.0), -1.0)
        self.assertEqual(ordered(2.0, 1.0), 1.0)
        self.assertEqual(ordered(2.0, 2.0), 0.0)

    def test_two_strings_compare_by_code_point(self):
        self.assertEqual(ordered("a", "b"), -1.0)
        self.assertEqual(ordered("B", "a"), -1.0)
        self.assertEqual(ordered("a", "a"), 0.0)

    def test_a_boolean_does_not_order_against_a_number(self):
        # True is 1 to this interpreter, so an engine that compared the values
        # rather than the tags would answer that true is not less than two.
        self.assertIs(ordered(True, 2.0), ABSENT)
        self.assertIs(ordered(2.0, True), ABSENT)


class EqualityIsTotal(unittest.TestCase):
    def test_absent_equals_absent_and_nothing_else(self):
        self.assertTrue(equal(ABSENT, ABSENT))
        self.assertFalse(equal(ABSENT, 0.0))
        self.assertFalse(equal(ABSENT, False))
        self.assertFalse(equal(ABSENT, ""))

    def test_a_boolean_is_not_its_number(self):
        self.assertFalse(equal(True, 1.0))
        self.assertFalse(equal(False, 0.0))
        self.assertTrue(equal(True, True))

    def test_two_colours_are_equal_when_all_four_channels_match(self):
        self.assertTrue(equal(Colour(1, 2, 3, 0.5), Colour(1, 2, 3, 0.5)))
        self.assertFalse(equal(Colour(1, 2, 3, 0.5), Colour(1, 2, 3, 0.25)))

    def test_two_references_are_equal_when_they_are_the_same_object(self):
        one = ArrayValue([1.0, 2.0])
        same = ArrayValue([1.0, 2.0])
        self.assertTrue(equal(one, one))
        self.assertFalse(equal(one, same))


class ABranchAbsorbsAbsence(unittest.TestCase):
    def test_only_true_goes_the_true_way(self):
        self.assertTrue(truthy(True))
        self.assertFalse(truthy(False))
        self.assertFalse(truthy(ABSENT))

    def test_a_number_is_not_a_condition(self):
        # The language has no truthiness. A one that branched would make every
        # non-empty string and every non-zero price a condition.
        self.assertFalse(truthy(1.0))
        self.assertFalse(truthy("yes"))


class NegationIsThreeValued(unittest.TestCase):
    def test_absence_stays_absent(self):
        self.assertIs(negation(ABSENT), ABSENT)
        self.assertIs(negation(True), False)
        self.assertIs(negation(False), True)

    def test_a_value_that_is_not_a_boolean_is_absent(self):
        self.assertIs(negation(1.0), ABSENT)


class ANumberIsAlwaysFinite(unittest.TestCase):
    def test_an_overflow_becomes_absence(self):
        self.assertIs(finite(float("inf")), ABSENT)
        self.assertIs(finite(float("-inf")), ABSENT)
        self.assertIs(finite(float("nan")), ABSENT)

    def test_a_negative_zero_is_normalised_at_a_result_and_at_a_store(self):
        # Compared as a bit pattern rather than as a number, because the two
        # zeros are equal as numbers and are the difference this rule is about.
        import struct

        self.assertEqual(struct.pack(">d", finite(-0.0)).hex(), "0000000000000000")
        self.assertEqual(struct.pack(">d", stored(-0.0)).hex(), "0000000000000000")

    def test_a_subnormal_survives(self):
        # No flush to zero and no denormals as zero: a subnormal is computed
        # exactly as the arithmetic says.
        smallest = 5e-324
        self.assertEqual(finite(smallest), smallest)


class TheTagOfAValue(unittest.TestCase):
    def test_each_of_the_six(self):
        self.assertEqual(tag(ABSENT), "absent")
        self.assertEqual(tag(1.0), "number")
        self.assertEqual(tag(True), "bool")
        self.assertEqual(tag("a"), "string")
        self.assertEqual(tag(Colour(0, 0, 0, 1)), "color")
        self.assertEqual(tag(ArrayValue([])), "reference")

    def test_a_boolean_is_read_before_a_number(self):
        self.assertFalse(is_number(True))
        self.assertFalse(is_whole(True))
        self.assertTrue(is_number(1.0))
        self.assertTrue(is_whole(2.0))
        self.assertFalse(is_whole(2.5))


if __name__ == "__main__":
    unittest.main()
