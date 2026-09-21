"""Each arrangement `stdlib.md` section 20 refuses, built and measured against this half.

The vector files say this engine agrees with the other one. They do not say
**why**, and a reader who wanted to change one of these functions would have no
way to tell which lines carry the agreement and which are incidental. So every
test here builds the arrangement the page names as the one it is not, runs both
over the vectors' own source column, and measures how many bars the two part
company on.

**A test that measured zero would be a test that cannot fail**, which is
documentation with a green tick on it. Each assertion below therefore demands a
difference and prints the count when it is missing: if this half were rewritten
into the refused arrangement, the count goes to zero and the test fails. That is
the wrong implementation each one catches, named in its own first line.

The counts are not quoted from the page. Section 20 prints its own figures over
its own fixture, and `scripts/check-section-20.mjs` is what holds those to a test
on the other side of the tree; these are measured here over the eighty bars of
`spec/vectors/library/`, which is a different population and would be a different
number.
"""

import unittest

from openscript.library import averages, composites, counting, deviation, extremes
from openscript.library import bookkeeping, flows, strength
from openscript.library.series import contributed, mean, region, window
from tests import vectors


def column(file_name: str, case_id: str = "full-0", name: str = "src"):
    """One vector case's named column, as the values a walk is measured over."""
    for case in vectors.vectors_for(file_name)["cases"]:
        if case["id"] != case_id:
            continue
        for held in case["args"]:
            if held["name"] == name:
                return [vectors.column_value(held, at) for at in range(case["bars"])]
    raise LookupError(f"{file_name} has no column {name} in case {case_id}")


def walk(of, values):
    """One kernel over a series of values, as the cells a comparison is made on."""
    state = {}
    return [vectors.cell_of(of(state, value)) for value in values]


class Bar:
    """One bar as the two readings below need it, for a case no vector file holds.

    The vectors cover what the first engine was driven over, and two sentences of
    section 20.6 are about bars that walk does not contain: an anchor bar whose
    own source is absent, and a bar whose typical price did not move. Both are
    stated on the page, so both are held here, over bars written for them.
    """

    def __init__(self, **facts):
        self._facts = facts

    def bar(self, fact):
        return self._facts.get(fact)

    def first_bar(self) -> bool:
        return False

    def make_array(self, items):
        return list(items)


def apart(left, right) -> int:
    """How many bars two walks part company on."""
    return sum(1 for one, other in zip(left, right) if one != other)


class TheTwoShapes(unittest.TestCase):
    """Section 20.2, which almost every length taking function is built out of."""

    def setUp(self):
        self.values = column("sma-2.json")
        self.length = 20

    def test_the_window_sum_is_taken_fresh_and_is_not_carried_forward(self):
        """Catches: a total carried from bar to bar with the leaving value subtracted.

        The same quantity in exact arithmetic and a different number in binary64,
        whose error grows with the history rather than with the window.
        `compiled-program.md` section 8.3 refuses it outright.
        """
        mine = walk(lambda state, value: averages.simple(state, value, self.length), self.values)
        carried = []
        running = 0.0
        for at, value in enumerate(self.values):
            running = running + value
            if at >= self.length:
                running = running - self.values[at - self.length]
            ready = at >= self.length - 1
            carried.append(vectors.cell_of(running / self.length if ready else None))
        self.assertGreater(
            apart(mine, carried),
            0,
            "the fresh window sum and the carried total agree on every bar of this "
            "walk, so this half could be either and the vectors would not say which",
        )

    def test_the_recurrence_seeds_on_the_window_mean_and_not_on_the_first_bar(self):
        """Catches: seeding from bar 0 with the first value as the running value.

        The common and cheaper alternative. It draws a line where there should be
        a gap and stays materially wrong until the seed decays away.
        """
        mine = walk(
            lambda state, value: averages.exponential(state, value, self.length), self.values
        )
        weight = 2 / (self.length + 1)
        rest = 1 - weight
        early = []
        running = None
        for value in self.values:
            running = value if running is None else value * weight + running * rest
            early.append(vectors.cell_of(running))
        self.assertGreater(apart(mine, early), 0)

    def test_a_hole_freezes_the_recurrence_rather_than_re_seeding_it(self):
        """Catches: an absent bar that restarts the average from its own window.

        One missing bar would restart a two hundred bar average, so the two
        readings are different studies rather than different last bits.
        """
        values = column("ema-2.json", "holes-0")
        mine = walk(lambda state, value: averages.exponential(state, value, self.length), values)
        weight = 2 / (self.length + 1)
        rest = 1 - weight
        restarted = []
        running = None
        held = []
        for value in values:
            if value is None:
                running = None
                held = []
                restarted.append(None)
                continue
            held.append(value)
            if running is None:
                if len(held) < self.length:
                    restarted.append(None)
                    continue
                running = mean(list(reversed(held[-self.length :])), self.length)
            else:
                running = value * weight + running * rest
            restarted.append(vectors.cell_of(running))
        self.assertGreater(apart(mine, restarted), 0)


class TheMeans(unittest.TestCase):
    """Section 20.3, where every entry names the arrangement it is not."""

    def setUp(self):
        self.values = column("sma-2.json")
        self.length = 20

    def test_the_exponential_step_is_two_products_added(self):
        """Catches: ``running + (value - running) * weight``.

        A third arrangement of the same algebra and a third set of last bits, and
        the one an engine reaches for because it is one multiplication rather than
        two.
        """
        mine = walk(
            lambda state, value: averages.exponential(state, value, self.length), self.values
        )
        weight = 2 / (self.length + 1)
        other = self._recurrence(lambda running, value: running + (value - running) * weight)
        self.assertGreater(apart(mine, other), 0)

    def test_the_smoothed_step_is_not_the_exponential_one_at_a_weight_of_one_over_the_length(self):
        """Catches: ``value * (1 / len) + running * (1 - 1 / len)``.

        A conforming implementation of a different function. The difference
        propagates into the strength reading, the average true range, the trailing
        band and the directional index.
        """
        mine = walk(lambda state, value: averages.smoothed(state, value, self.length), self.values)
        weight = 1 / self.length
        rest = 1 - weight
        other = self._recurrence(lambda running, value: value * weight + running * rest)
        self.assertGreater(apart(mine, other), 0)

    def test_the_smoothed_step_is_not_the_difference_form_either(self):
        """Catches: ``running + (value - running) / len``, the third arrangement."""
        mine = walk(lambda state, value: averages.smoothed(state, value, self.length), self.values)
        other = self._recurrence(lambda running, value: running + (value - running) / self.length)
        self.assertGreater(apart(mine, other), 0)

    def test_the_linear_mean_divides_once_at_the_end(self):
        """Catches: dividing each term by the divisor as it is added."""
        mine = walk(lambda state, value: averages.linear(state, value, self.length), self.values)
        divisor = (self.length * (self.length + 1)) / 2
        termwise = []
        for at in range(len(self.values)):
            if at < self.length - 1:
                termwise.append(None)
                continue
            held = list(reversed(self.values[at - self.length + 1 : at + 1]))
            running = 0.0
            for position in range(self.length):
                running = running + (held[self.length - 1 - position] * (position + 1)) / divisor
            termwise.append(vectors.cell_of(running))
        self.assertGreater(apart(mine, termwise), 0)

    def test_the_four_bar_mean_is_added_left_to_right(self):
        """Catches: regrouping the middle pair, and adding the terms right to left."""
        mine = walk(lambda state, value: averages.symmetric(state, value), self.values)
        regrouped = []
        backwards = []
        for at in range(len(self.values)):
            if at < 3:
                regrouped.append(None)
                backwards.append(None)
                continue
            w = list(reversed(self.values[at - 3 : at + 1]))
            regrouped.append(vectors.cell_of(((w[3] + 2 * w[2]) + (2 * w[1] + w[0])) / 6))
            running = w[0]
            running = running + 2 * w[1]
            running = running + 2 * w[2]
            running = running + w[3]
            backwards.append(vectors.cell_of(running / 6))
        self.assertGreater(apart(mine, regrouped), 0)
        self.assertGreater(apart(mine, backwards), 0)

    def test_the_triple_mean_is_three_terms_added_left_to_right(self):
        """Catches: ``3 * (e1 - e2) + e3``."""
        mine = walk(lambda state, value: composites.tripled(state, value, self.length), self.values)
        state = {}
        other = []
        for value in self.values:
            first = averages.exponential(region(state, "one"), value, self.length)
            second = averages.exponential(region(state, "two"), first, self.length)
            third = averages.exponential(region(state, "three"), second, self.length)
            if isinstance(first, float) and isinstance(second, float) and isinstance(third, float):
                other.append(vectors.cell_of(3 * (first - second) + third))
            else:
                other.append(None)
        self.assertGreater(apart(mine, other), 0)

    def test_the_fit_takes_one_product_divided_once_for_its_sum_of_squares(self):
        """Catches: splitting the 6 so each half of the product meets its own divisor.

        Every intermediate is held below the whole product, which is a different
        number: over the whole lengths from 1 to 100000 the two part company at a
        length of 15, where the split gives 1014.9999999999999 against 1015.
        """
        stated = ((15 - 1) * 15 * (2 * 15 - 1)) / 6
        split = (((15 - 1) * 15) / 2) * ((2 * 15 - 1) / 3)
        self.assertNotEqual(vectors.cell_of(stated), vectors.cell_of(split))

    def _recurrence(self, step):
        """The same seeded shape as section 20.2.2, with another step in it."""
        given = []
        running = None
        held = []
        for value in self.values:
            held.append(value)
            if running is None:
                if len(held) < self.length:
                    given.append(None)
                    continue
                running = mean(list(reversed(held[-self.length :])), self.length)
            else:
                running = step(running, value)
            given.append(vectors.cell_of(running))
        return given


class TheReadings(unittest.TestCase):
    """The arrangements sections 20.4, 20.5 and 20.8 name."""

    def setUp(self):
        self.values = column("sma-2.json")
        self.length = 20

    def test_the_strength_line_is_not_the_hundred_times_up_over_the_total_form(self):
        """Catches: ``100 * up / (up + down)``.

        Mathematically equal and one unit in the last place away on ordinary
        data, which is the difference a chart reproduces or does not.
        """
        mine = []
        other = []
        state = {}
        for value in self.values:
            mine.append(vectors.cell_of(strength.strength(state, value, 14)))
        sides = {}
        for value in self.values:
            values = contributed(sides, "src", value, 2)
            up, down = strength.rises_and_falls(values)
            average_up = averages.smoothed(region(sides, "up"), up, 14)
            average_down = averages.smoothed(region(sides, "down"), down, 14)
            if isinstance(average_up, float) and isinstance(average_down, float):
                divisor = average_up + average_down
                other.append(
                    vectors.cell_of(None if divisor == 0 else (100 * average_up) / divisor)
                )
            else:
                other.append(None)
        self.assertGreater(apart(mine, other), 0)

    def test_the_variance_is_two_passes_and_not_the_mean_of_the_squares(self):
        """Catches: the mean of the squares less the square of the mean.

        It loses most of its significant digits on a price series where the values
        are large and their spread is small, and can return a negative variance
        that then has to be floored at zero.
        """
        mine = walk(
            lambda state, value: deviation.variance(state, value, self.length, False), self.values
        )
        state = {}
        other = []
        for value in self.values:
            held = window(contributed(state, "src", value, self.length), self.length)
            if held is None:
                other.append(None)
                continue
            squares = 0.0
            for at in range(self.length - 1, -1, -1):
                squares = squares + held[at] * held[at]
            middle = mean(held, self.length)
            other.append(vectors.cell_of(squares / self.length - middle * middle))
        self.assertGreater(apart(mine, other), 0)

    def test_the_correlation_divides_by_a_product_of_roots(self):
        """Catches: dividing by the square root of the product of the two spreads."""
        import math

        left = column("correlation-3.json", "full-0", "a")
        right = column("correlation-3.json", "full-0", "b")
        state = {}
        mine = []
        other = []
        pairs = {}
        for one, two in zip(left, right):
            mine.append(vectors.cell_of(counting.correlation(state, one, two, self.length)))
            first = window(contributed(pairs, "a", one, self.length), self.length)
            second = window(contributed(pairs, "b", two, self.length), self.length)
            if first is None or second is None:
                other.append(None)
                continue
            cross = 0.0
            squares_left = 0.0
            squares_right = 0.0
            mean_left = mean(first, self.length)
            mean_right = mean(second, self.length)
            for at in range(self.length - 1, -1, -1):
                cross = cross + (first[at] - mean_left) * (second[at] - mean_right)
                squares_left = squares_left + (first[at] - mean_left) * (first[at] - mean_left)
                squares_right = squares_right + (second[at] - mean_right) * (second[at] - mean_right)
            divisor = math.sqrt((squares_left / self.length) * (squares_right / self.length))
            other.append(vectors.cell_of(None if divisor == 0 else (cross / self.length) / divisor))
        self.assertGreater(apart(mine, other), 0)

    def test_the_rank_interpolates_rather_than_taking_the_nearest_member(self):
        """Catches: the nearest rank method, which returns a member of the window."""
        mine = walk(
            lambda state, value: counting.middle(state, value, self.length), self.values
        )
        state = {}
        nearest = []
        for value in self.values:
            held = window(contributed(state, "src", value, self.length), self.length)
            if held is None:
                nearest.append(None)
                continue
            ascending = sorted(held)
            nearest.append(vectors.cell_of(ascending[self.length // 2]))
        self.assertGreater(apart(mine, nearest), 0)

    def test_an_extreme_goes_to_the_most_recent_bar_that_set_it(self):
        """Catches: a scan that keeps the oldest of the bars holding an equal value.

        The tie rule shows in the two calls that report an age, and it shows on
        every flat stretch of a series, so a run of equal values is what this is
        measured over rather than the price walk.
        """
        flat = [1.0, 2.0, 2.0, 2.0, 1.5]
        mine = walk(lambda state, value: extremes.highest_bars(state, value, 4), flat)
        state = {}
        oldest = []
        for value in flat:
            held = window(contributed(state, "src", value, 4), 4)
            if held is None:
                oldest.append(None)
                continue
            at = len(held) - 1
            for age in range(len(held) - 2, -1, -1):
                if held[age] > held[at]:
                    at = age
            oldest.append(vectors.cell_of(float(at)))
        self.assertGreater(apart(mine, oldest), 0)

    def test_an_anchor_bar_resets_the_totals_even_where_its_own_source_is_absent(self):
        """Catches: a reset that only happens on a bar that has a term to add.

        Section 20.6 resets both totals on an anchor bar, before that bar's own
        term is added. A reset conditional on the term would carry the previous
        session's flow across an anchor bar that happened to have no price, which
        is the one bar a reader would never look at and the one that decides
        every value after it.
        """
        state = {}
        flows.anchored_average(state, Bar(volume=100.0), 10.0, True)
        flows.anchored_average(state, Bar(volume=100.0), 20.0, False)
        flows.anchored_average(state, Bar(volume=100.0), None, True)
        after = flows.anchored_average(state, Bar(volume=50.0), 40.0, False)
        self.assertEqual(after, 40.0)

    def test_an_unchanged_typical_price_contributes_to_neither_side(self):
        """Catches: an unchanged bar counted on the rising side.

        Section 20.6 says an exact zero to both sides. Counting it as a rise turns
        a window that only fell into a window with flow on both sides, which moves
        the reading off its floor of 0.
        """
        state = {}
        flat = Bar(high=10.0, low=10.0, close=10.0, volume=100.0)
        walked = [
            Bar(high=12.0, low=12.0, close=12.0, volume=100.0),
            Bar(high=11.0, low=11.0, close=11.0, volume=100.0),
            flat,
            flat,
        ]
        reading = None
        for one in walked:
            reading = flows.money_flow(state, one, 3)
        self.assertEqual(reading, 0.0)

    def test_a_crossing_is_at_or_below_and_then_above(self):
        """Catches: the strictly below test, which loses a touch and a separation.

        Common on instruments with a coarse tick, and the reason section 9 states
        the inclusive form rather than leaving it to an engine.
        """
        first = [1.0, 1.0, 2.0]
        second = [2.0, 1.0, 1.0]
        state = {}
        strict = {}
        mine = []
        other = []
        for one, two in zip(first, second):
            mine.append(bookkeeping.crossed_up(state, one, two))
            values = contributed(strict, "a", one, 2)
            others = contributed(strict, "b", two, 2)
            if len(values) < 2 or len(others) < 2:
                other.append(None)
                continue
            other.append(values[0] < others[0] and values[1] > others[1])
        self.assertNotEqual(mine, other)
        self.assertIn(True, mine)


if __name__ == "__main__":
    unittest.main()
