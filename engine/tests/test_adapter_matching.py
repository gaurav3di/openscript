"""Section 6's comparison, one test per step, each against a wrong reading of it.

The whole value of the suite rests on this function being the same in both
engines, so the tests here are written the way the page's own commentary is: each
one names the implementation it refuses, and each would pass on the right rule
and fail on that one. A comparison that is a little more forgiving in one engine
reports agreement that is not there, which is worse than reporting none at all.
"""

import unittest

from openscript.adapter.matching import (
    EXACT,
    compare_channel,
    compare_channels,
    compare_numbers,
    compare_values,
    tolerance_from,
)
from openscript.adapter.page import TOLERANCE_CAP_ABS, TOLERANCE_CAP_REL

LOOSE = (0.0, 1e-9)


class Absence(unittest.TestCase):
    """Steps 1 and 2. Catches an implementation that compared absence numerically,
    which would make a value produced one bar early pass whenever it was small."""

    def test_two_absences_match(self):
        self.assertEqual(compare_numbers(None, None, 0, 0)["outcome"], "pass")

    def test_one_absence_fails_however_loose_the_bounds(self):
        found = compare_numbers(0.0, None, 1.0, 1.0)
        self.assertEqual(found["outcome"], "fail")
        self.assertEqual(found["bound"], "absence")
        self.assertEqual(compare_numbers(None, 0.0, 1.0, 1.0)["bound"], "absence")


class NonFinite(unittest.TestCase):
    """Step 3. Catches an implementation that let an infinity inside a tolerance, or
    reported it as an ordinary numeric failure where a reader would scroll past it."""

    def test_an_infinite_answer_is_its_own_outcome(self):
        self.assertEqual(compare_numbers(float("inf"), 1.0, 1.0, 1.0)["outcome"], "nonFinite")

    def test_a_not_a_number_answer_is_its_own_outcome(self):
        self.assertEqual(compare_numbers(float("nan"), 1.0, 1.0, 1.0)["outcome"], "nonFinite")


class Zero(unittest.TestCase):
    """Step 4. Catches an implementation comparing raw bits, which would fail a case
    over a sign no script in this language can observe."""

    def test_the_two_zeros_are_one_value(self):
        self.assertEqual(compare_numbers(-0.0, 0.0, 0, 0)["outcome"], "pass")
        self.assertEqual(compare_numbers(0.0, -0.0, 0, 0)["outcome"], "pass")


class Bits(unittest.TestCase):
    """Steps 5 and 6. Catches an implementation comparing decimal renderings, where
    a formatting decision can make two different values look equal, and one that
    admitted a difference no case declared a bound for."""

    def test_equality_is_over_the_bits(self):
        self.assertEqual(compare_numbers(0.1 + 0.2, 0.30000000000000004, 0, 0)["outcome"], "pass")

    def test_the_last_bit_is_a_failure_when_nothing_was_declared(self):
        found = compare_numbers(0.1 + 0.2, 0.3, 0, 0)
        self.assertEqual(found["outcome"], "fail")
        self.assertEqual(found["bound"], "exact")


class Bounds(unittest.TestCase):
    """Step 7. Catches the additive form the page names and refuses: with
    ``abs + rel * |e|`` a value meant to be compared at ``abs`` is quietly
    compared at slightly more than ``abs``, and the failure cannot say which
    bound it broke."""

    def test_the_absolute_bound_is_in_force_near_zero(self):
        self.assertEqual(compare_numbers(0.0000000000005, 0.0, 1e-12, 1e-9)["outcome"], "pass")

    def test_the_form_is_max_and_not_a_sum(self):
        # Expected 1, actual 1 + 1.5e-9: the relative bound alone refuses it and
        # the sum of the two admits it, so this is the one case that separates
        # the two readings.
        abs_bound, rel_bound = 1e-9, 1e-9
        actual, expected = 1 + 1.5e-9, 1.0
        self.assertLessEqual(abs(actual - expected), abs_bound + rel_bound * abs(expected))
        found = compare_numbers(actual, expected, abs_bound, rel_bound)
        self.assertEqual(found["outcome"], "fail")

    def test_a_failure_names_the_bound_that_was_in_force(self):
        self.assertEqual(compare_numbers(2.0, 1.0, 0.0, 1e-9)["bound"], "rel")
        self.assertEqual(compare_numbers(2.0, 1.0, 1e-12, 0.0)["bound"], "abs")


class Kinds(unittest.TestCase):
    """Section 6's table. Catches an implementation that compared a bool against a
    number as a near miss, or folded a string's case before comparing it."""

    def test_a_bool_and_a_number_are_not_a_near_miss(self):
        self.assertEqual(compare_values(True, 1.0, LOOSE)["bound"], "kind")

    def test_a_string_is_an_exact_sequence_of_code_points(self):
        self.assertEqual(compare_values("BUY", "BUY", EXACT)["outcome"], "pass")
        self.assertEqual(compare_values("buy", "BUY", EXACT)["outcome"], "fail")
        self.assertEqual(compare_values(" BUY", "BUY", EXACT)["outcome"], "fail")


class Channels(unittest.TestCase):
    """Section 6's ordered list row, and section 4's rule for one element's fields."""

    def test_a_length_difference_is_reported_before_any_element(self):
        found = compare_channel("values", [{"a": 1.0}], [{"a": 2.0}, {"a": 3.0}], EXACT)
        self.assertEqual(found["bound"], "length")
        self.assertEqual(found["index"], 1)

    def test_the_first_differing_element_is_named_with_its_column(self):
        found = compare_channel(
            "values", [{"a": 1.0}, {"a": 4.0}], [{"a": 1.0}, {"a": 3.0}], EXACT
        )
        self.assertEqual(found["index"], 1)
        self.assertEqual(found["column"], "a")
        self.assertEqual(found["expected"], "3")
        self.assertEqual(found["actual"], "4")

    def test_a_diagnostic_is_compared_on_four_fields_and_not_on_its_wording(self):
        # Catches an adapter comparing every field of a diagnostic: the message
        # and the suggested fix are deliberately outside the comparison, so that
        # improving the wording of an error is not a breaking change.
        actual = [{"code": "OS2004", "line": 7, "column": 12, "severity": "error", "barIndex": 3}]
        expected = [
            {"code": "OS2004", "line": 7, "column": 12, "severity": "error", "barIndex": 99}
        ]
        self.assertIsNone(compare_channel("diagnostics", actual, expected, EXACT))
        differing = [{**expected[0], "code": "OS2005"}]
        self.assertIsNotNone(compare_channel("diagnostics", actual, differing, EXACT))

    def test_a_channel_is_compared_on_the_fields_the_case_names(self):
        actual = [{"side": "buy", "qty": 25.0, "orderRef": "R1"}]
        expected = [{"side": "buy", "qty": 25.0}]
        self.assertIsNone(compare_channel("orders", actual, expected, EXACT))

    def test_every_asserted_channel_is_compared_in_the_case_order(self):
        found = compare_channels(
            ("diagnostics", "values"),
            {"diagnostics": [], "values": [{"a": 2.0}]},
            {"diagnostics": [], "values": [{"a": 1.0}]},
            EXACT,
        )
        self.assertEqual(found["channel"], "values")


class Declared(unittest.TestCase):
    """The rule that stops a tolerance being the thing an engine author widens
    until the suite goes green."""

    def test_absent_means_exact(self):
        self.assertEqual(tolerance_from(None), (EXACT, None))

    def test_a_non_zero_bound_without_a_reason_is_refused(self):
        found, refused = tolerance_from({"abs": 0, "rel": 1e-12})
        self.assertIsNone(found)
        self.assertIn("reason", refused)

    def test_a_bound_past_the_cap_is_not_a_conformance_case(self):
        for declared in (
            {"abs": 0, "rel": TOLERANCE_CAP_REL * 10, "reason": "stated"},
            {"abs": TOLERANCE_CAP_ABS * 10, "rel": 0, "reason": "stated"},
        ):
            with self.subTest(declared=declared):
                found, refused = tolerance_from(declared)
                self.assertIsNone(found)
                self.assertIn("cap", refused)

    def test_a_bound_at_the_cap_with_a_reason_stands(self):
        found, refused = tolerance_from(
            {"abs": TOLERANCE_CAP_ABS, "rel": TOLERANCE_CAP_REL, "reason": "stated"}
        )
        self.assertIsNone(refused)
        self.assertEqual(found, (TOLERANCE_CAP_ABS, TOLERANCE_CAP_REL))

    def test_a_case_that_writes_its_tolerance_out_with_no_reason_at_all_is_exact(self):
        # A harvested case carries abs 0, rel 0 and a null reason, which is the
        # page's "absent means exact" written out rather than left off.
        self.assertEqual(tolerance_from({"abs": 0, "rel": 0, "reason": None}), (EXACT, None))


if __name__ == "__main__":
    unittest.main()
