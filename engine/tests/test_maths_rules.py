"""The arithmetic rules that a vector file cannot catch on its own.

Every case here names the wrong implementation it exists to catch, because a
test that cannot fail is documentation with a green tick on it. The vectors
catch most of these too, and they catch them at whatever value the fixture's
price walk happens to hold; these catch them at the value the rule turns on,
which is the value a second engine's author will get wrong.

The rules are `stdlib.md` sections 8.1, 20.7 and 20.10, and section 2.4's answer
for a result with no finite real value.
"""

import math
import struct
import unittest

from openscript.library.arithmetic import (
    clamp,
    is_none,
    maximum,
    minimum,
    mod,
    or_else,
    sign,
    to_bool,
)
from openscript.library.bars import true_range
from openscript.library.elementary import log, power, sqrt, to_degrees, to_radians
from openscript.library.rounding import (
    round_half_away,
    round_to,
    round_to_step,
    round_to_tick,
    round_to_whole,
    scale_of,
)
from openscript.library.values import result


def bits(value) -> str:
    """A value as the sixteen digits a vector file would hold for it."""
    return struct.pack(">d", value).hex()


class Rounding(unittest.TestCase):
    def test_a_half_added_before_a_floor_is_not_this_function(self):
        """The wrong implementation: ``floor(x + 0.5)``.

        At the value just below a half, adding 0.5 rounds up to the next
        representable number before the floor ever runs and the answer comes out
        one too high. `stdlib.md` section 20.7 names this case and compares the
        fractional part instead.
        """
        just_below = 0.49999999999999994
        self.assertEqual(round_to_whole(just_below), 0.0)
        self.assertEqual(math.floor(just_below + 0.5), 1)

    def test_halves_go_away_from_zero_and_not_to_even(self):
        """The wrong implementation: the host's own rounding, which ties to even."""
        self.assertEqual(round_to_whole(2.5), 3.0)
        self.assertEqual(round_to_whole(-2.5), -3.0)
        self.assertEqual(round_to_whole(0.5), 1.0)
        self.assertEqual(round_to_whole(-0.5), -1.0)
        self.assertEqual(round(2.5), 2)
        self.assertEqual(round(-2.5), -2)

    def test_the_scale_is_not_a_floating_point_power(self):
        """The wrong implementation: ``pow(10, decimals)``.

        `stdlib.md` section 20.7: the scale is the binary64 nearest to the power
        of ten, the value the literal reads as. The two differ at one count of
        the 309 a binary64 can hold, and every result at that count moves.
        """
        self.assertEqual(scale_of(23), 1e23)
        self.assertNotEqual(math.pow(10, 23), 1e23)
        for count in range(0, 309):
            self.assertEqual(scale_of(count), float(10**count), count)

    def test_a_scale_past_the_last_power_produces_absence(self):
        self.assertIsNone(round_to(1.5, 309))
        self.assertTrue(math.isinf(scale_of(400)))

    def test_a_step_that_overflows_the_division_is_absent(self):
        """A result with no finite real value is absence, not an infinity."""
        self.assertIsNone(round_to_step(1e308, 0.05))
        self.assertIsNone(round_to_step(1.0, 0.0))
        self.assertIsNone(round_to_step(1.0, -1.0))

    def test_no_tick_is_absence_and_not_the_price(self):
        """The wrong implementation: returning the price when the host has no tick.

        `stdlib.md` section 8.1 states the answer and the reason: an order price
        that looks rounded and is not is refused by a venue, and a script that
        cannot round has to be able to see that it cannot.
        """
        self.assertIsNone(round_to_tick(101.237, None))
        self.assertIsNone(round_to_tick(101.237, 0.0))
        self.assertEqual(round_to_tick(101.237, 0.05), round_to_step(101.237, 0.05))

    def test_the_rounding_of_a_value_with_no_whole_number_near_it(self):
        self.assertTrue(math.isinf(round_half_away(math.inf)))


class Modulo(unittest.TestCase):
    def test_it_is_the_floored_remainder_and_not_the_truncated_one(self):
        """The wrong implementation: the truncated remainder, which is ``%``.

        The two agree for every positive divisor, which is every use that wraps
        an index, and part at every negative one. An engine that picked the other
        would disagree with every other engine at every negative argument.
        """
        self.assertEqual(mod(-7.0, 3.0), 2.0)
        self.assertEqual(mod(7.0, -3.0), -2.0)
        self.assertEqual(math.fmod(-7.0, 3.0), -1.0)
        self.assertEqual(math.fmod(7.0, -3.0), 1.0)

    def test_a_zero_divisor_is_absence(self):
        self.assertIsNone(mod(1.0, 0.0))

    def test_it_is_a_division_and_a_floor_and_not_an_exact_remainder(self):
        """The wrong implementation: the host's own floored remainder.

        It agrees at every argument a script is likely to write, and where the
        division overflows it answers with a number where the written formula has
        none. The formula is what `stdlib.md` section 8.1 states.
        """
        self.assertIsNone(mod(0.1, 1e-310))
        self.assertNotEqual(0.1 % 1e-310, 0.0)


class Association(unittest.TestCase):
    def test_the_degree_conversion_multiplies_before_it_divides(self):
        """The wrong implementation: folding the constant into one factor.

        `stdlib.md` section 20.7 measured the difference at about a quarter of
        the arguments, so an engine that wrote the obvious single multiplication
        would disagree on a quarter of the values a script converts.
        """
        x = 5 / 97
        self.assertEqual(to_degrees(x), (x * 180) / math.pi)
        self.assertNotEqual(to_degrees(x), x * (180 / math.pi))
        self.assertEqual(to_radians(x), (x * math.pi) / 180)
        self.assertNotEqual(to_radians(x), x * (math.pi / 180))


class NoFiniteRealValue(unittest.TestCase):
    """`stdlib.md` section 2.4: absence rather than a raise, an infinity or a zero."""

    def test_the_calls_with_a_domain_answer_absence_outside_it(self):
        self.assertIsNone(sqrt(-1.0))
        self.assertEqual(sqrt(0.0), 0.0)
        self.assertIsNone(log(0.0))
        self.assertIsNone(log(-1.0))
        self.assertIsNone(power(-0.5, 0.1))
        self.assertIsNone(power(0.0, -1.0))

    def test_an_overflow_is_absence(self):
        self.assertIsNone(result(math.inf))
        self.assertIsNone(result(-math.inf))
        self.assertIsNone(result(math.nan))

    def test_a_zero_result_carries_no_sign(self):
        """The wrong implementation: returning the host's own negative zero.

        Nothing in the language can observe the sign of a zero, so a rule that
        let one through would differ between two engines through ``text`` alone.
        """
        self.assertEqual(bits(result(-0.0)), bits(0.0))
        self.assertEqual(bits(minimum(-0.0, 0.0)), bits(0.0))
        self.assertEqual(bits(round_to_whole(-0.4)), bits(0.0))
        self.assertEqual(bits(sign(-0.0)), bits(0.0))


class Absence(unittest.TestCase):
    """Every windowed and every bare call propagates absence, section 2.4."""

    def test_an_absent_argument_makes_an_absent_result(self):
        self.assertIsNone(minimum(None, 1.0))
        self.assertIsNone(maximum(1.0, None))
        self.assertIsNone(clamp(1.0, None, 2.0))
        self.assertIsNone(mod(None, 1.0))

    def test_the_three_calls_that_read_absence_rather_than_propagate_it(self):
        self.assertTrue(is_none(None))
        self.assertFalse(is_none(0.0))
        self.assertEqual(or_else(None, 7.0), 7.0)
        self.assertEqual(or_else(0.0, 7.0), 0.0)
        self.assertIsNone(or_else(None, None))
        self.assertFalse(to_bool(None))
        self.assertTrue(to_bool(True))

    def test_a_number_is_not_a_bool_in_either_direction(self):
        """The wrong implementation: truthiness, which every non-zero number has.

        ``toBool`` takes absence and a bool; a number is a type error the checker
        refuses, so one arriving here is a program the verifier should not have
        accepted and false is the safe reading.
        """
        self.assertFalse(to_bool(1.0))
        self.assertFalse(to_bool(0.0))
        self.assertIsNone(minimum(True, 1.0))


class TrueRange(unittest.TestCase):
    """`stdlib.md` section 6's one exception to absence propagation."""

    def test_the_oldest_bar_is_the_bar_own_range(self):
        self.assertEqual(true_range(101.0, 99.0, None, True), 2.0)

    def test_a_later_bar_takes_the_widest_of_three(self):
        self.assertEqual(true_range(101.0, 99.0, 104.0, False), 5.0)
        self.assertEqual(true_range(101.0, 99.0, 95.0, False), 6.0)
        self.assertEqual(true_range(101.0, 99.0, 100.0, False), 2.0)

    def test_a_hole_in_the_middle_of_a_run_is_not_the_oldest_bar(self):
        """The wrong implementation: reading an absent previous close as bar 0.

        The exception belongs to the oldest bar of the dataset, which is a fact
        about the run and not about the three numbers. An engine that inferred it
        from the absence would answer a hole with the bar's own range and draw a
        value where the page draws nothing.
        """
        self.assertIsNone(true_range(101.0, 99.0, None, False))
        self.assertIsNone(true_range(None, 99.0, 100.0, False))


if __name__ == "__main__":
    unittest.main()
