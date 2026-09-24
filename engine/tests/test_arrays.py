"""The array calls of ``arrays.py``, each against the answer the first engine gives.

Issue 0020 found this engine had no array calls at all, and the two engine gate
had been green because no case reached one. The cases now in ``cases/array``
hold the two refusals across both engines; this file holds the answers, so a
call that drifted from ``src/core/engine/library/arrays.ts`` fails here before
it fails a case that happens to read it.

Each test names what it catches.
"""

import math
import unittest

from openscript.arrays import CALLS, ELEMENT_CEILING, Refused, element, literal
from openscript.values import ABSENT, ArrayValue


def call(name, *arguments):
    return CALLS[(name, len(arguments))](list(arguments))


class Reading(unittest.TestCase):
    def test_size_and_element(self):
        held = literal([1.0, 2.0, 3.0])
        self.assertEqual(call("size", held), 3.0)
        self.assertEqual(call("element", held, 2), 3.0)

    def test_an_index_outside_the_extent_is_os4004_not_absence(self):
        # Catches the history rule applied to an array, and a clamp.
        held = literal([1.0, 2.0])
        for index in (2, -1, 0.5, ABSENT):
            with self.assertRaises(Refused) as raised:
                element(held, index)
            self.assertEqual(raised.exception.code, "OS4004")

    def test_an_absent_array_answers_absence(self):
        # A handle that is absent is a gap, as every other reference is.
        self.assertIs(call("size", ABSENT), ABSENT)
        self.assertIs(call("sum", ABSENT), ABSENT)


class Changing(unittest.TestCase):
    def test_push_pop_shift_unshift_insert_remove(self):
        held = literal([])
        call("push", held, 1.0)
        call("push", held, 2.0)
        call("unshift", held, 0.0)
        call("insert", held, 3, 9.0)
        self.assertEqual(held.elements, [0.0, 1.0, 2.0, 9.0], "insert at size appends")
        self.assertEqual(call("remove", held, 1), 1.0)
        self.assertEqual(call("pop", held), 9.0)
        self.assertEqual(call("shift", held), 0.0)
        self.assertEqual(held.elements, [2.0])

    def test_taking_from_an_empty_array_is_os4004(self):
        # Catches an engine that answers absence and leaves the script running
        # on a queue it believes is not empty.
        for name in ("pop", "shift"):
            with self.assertRaises(Refused) as raised:
                call(name, literal([]))
            self.assertEqual(raised.exception.code, "OS4004")

    def test_the_element_past_the_ceiling_is_os5002(self):
        # Catches a ceiling applied at rather than past the limit.
        held = ArrayValue([0.0] * (ELEMENT_CEILING - 1))
        call("push", held, 1.0)
        with self.assertRaises(Refused) as raised:
            call("push", held, 1.0)
        self.assertEqual(raised.exception.code, "OS5002")

    def test_set_clear_reverse(self):
        held = literal([1.0, 2.0, 3.0])
        call("set", held, 0, 7.0)
        call("reverse", held)
        self.assertEqual(held.elements, [3.0, 2.0, 7.0])
        call("clear", held)
        self.assertEqual(held.elements, [])


class Copying(unittest.TestCase):
    def test_copy_and_slice_are_new_arrays(self):
        held = literal([1.0, 2.0, 3.0])
        copied = call("copy", held)
        sliced = call("slice", held, 1, 5)
        self.assertIsNot(copied, held)
        self.assertEqual(sliced.elements, [2.0, 3.0], "a range past the end is clipped")
        self.assertIs(call("arrayEqual", held, copied), True)
        self.assertIs(call("arrayEqual", held, sliced), False)

    def test_a_fractional_slice_bound_is_os4003(self):
        with self.assertRaises(Refused) as raised:
            call("slice", literal([1.0]), 0.5, 1)
        self.assertEqual(raised.exception.code, "OS4003")

    def test_index_of_answers_minus_one_when_absent(self):
        held = literal(["a", "b"])
        self.assertEqual(call("indexOf", held, "b"), 1.0)
        self.assertEqual(call("indexOf", held, "c"), -1.0)


class Ordering(unittest.TestCase):
    def test_absence_sorts_last_ascending_and_first_descending(self):
        # Catches a sort that falls back to the host's order, and a descending
        # sort written as the ascending one reversed, which moves ties.
        held = literal([3.0, ABSENT, 1.0, 2.0])
        call("sort", held, "asc")
        self.assertEqual(held.elements, [1.0, 2.0, 3.0, ABSENT])
        call("sort", held, "desc")
        self.assertEqual(held.elements, [ABSENT, 3.0, 2.0, 1.0])

    def test_strings_sort_by_code_point(self):
        held = literal(["b", "B", "a"])
        call("sort", held, "asc")
        self.assertEqual(held.elements, ["B", "a", "b"])


class Reducing(unittest.TestCase):
    def test_the_five_reductions_in_index_order(self):
        held = literal([1.0, 2.0, 4.0])
        self.assertEqual(call("sum", held), 7.0)
        self.assertEqual(call("avg", held), 7.0 / 3.0)
        self.assertEqual(call("min", held), 1.0)
        self.assertEqual(call("max", held), 4.0)
        mean = 7.0 / 3.0
        squares = (1.0 - mean) ** 2 + (2.0 - mean) ** 2 + (4.0 - mean) ** 2
        self.assertEqual(call("stdev", held), math.sqrt(squares / 3.0))

    def test_an_absent_element_makes_a_reduction_absent(self):
        # Catches a reduction that skips the hole and averages fewer values
        # than the script thinks it has.
        held = literal([1.0, ABSENT])
        for name in ("sum", "avg", "min", "max", "stdev"):
            self.assertIs(call(name, held), ABSENT, name)

    def test_an_empty_array_has_a_sum_and_no_mean(self):
        held = literal([])
        self.assertEqual(call("sum", held), 0.0)
        for name in ("avg", "min", "max", "stdev"):
            self.assertIs(call(name, held), ABSENT, name)


if __name__ == "__main__":
    unittest.main()
