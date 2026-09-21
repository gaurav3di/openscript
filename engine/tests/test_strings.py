"""The string rules, with the page as the input rather than as the reference.

`stdlib.md` section 10 writes out exactly which code points ``str.trim`` removes
and ``toNumber`` ignores, and says why: one host's own trim takes the byte order
mark as well, another takes the four information separators and leaves the byte
order mark, so neither host's default is the set. A test that listed the set
again would be a third copy, and the copy this engine was written from at that.
So the table is read out of the page and every code point of the basic plane is
walked against it.

The other rule that has to be shared is the order of two strings, by code point,
which matters at the first symbol outside the basic plane: an engine whose
strings are sixteen bit units orders one below the last thousands of the plane
and every other engine orders it above them.
"""

import unittest

from openscript.library.code_points import compare, is_whitespace, trimmed
from openscript.library.number_text import to_number
from openscript.library.strings import (
    ends_with,
    index_of,
    join,
    length,
    lower,
    pad_left,
    pad_right,
    repeat,
    repeat_length,
    replace,
    replace_all,
    split,
    starts_with,
    substring,
    trim,
    upper,
)
from tests import vectors

PAGE = vectors.ROOT / "spec" / "stdlib.md"

# The line the table's rows are spelled on, as the page spells them: a cell
# holding a code point in backticks, and a second cell naming it. The range row
# spells two code points with the word "to" between them.
_ROW_MARK = "| `U+"


def whitespace_from_the_page() -> set[int]:
    """Every code point section 10's table lists, read out of the page."""
    found: set[int] = set()
    for line in PAGE.read_text(encoding="utf-8").splitlines():
        if not line.startswith(_ROW_MARK):
            continue
        cell = line.split("|")[1]
        points = [int(piece.strip().strip("`")[2:], 16) for piece in cell.split(" to ")]
        if len(points) == 1:
            found.add(points[0])
        else:
            found.update(range(points[0], points[1] + 1))
    return found


class WhitespaceTable(unittest.TestCase):
    def setUp(self):
        self.page = whitespace_from_the_page()

    def test_the_page_was_read_and_held_a_table(self):
        """A parser that matched nothing would pass every case below it."""
        self.assertGreater(len(self.page), 20)

    def test_every_code_point_of_the_basic_plane_agrees_with_the_page(self):
        wrong = []
        for point in range(0x10000):
            if is_whitespace(point) != (point in self.page):
                wrong.append(f"U+{point:04X}")
        self.assertEqual(wrong, [])

    def test_the_host_own_trim_is_not_this_set(self):
        """The wrong implementation: the host's own strip.

        It takes the four information separators U+001C to U+001F, which this set
        does not, and that is the whole reason the set is written down on the
        page. A second engine's host leaves those and takes the byte order mark
        instead, so neither default is the rule.
        """
        separators = "\u001c\u001d\u001e\u001f"
        self.assertEqual(trimmed(separators + "x" + separators), separators + "x" + separators)
        self.assertEqual((separators + "x" + separators).strip(), "x")
        self.assertEqual(trimmed("﻿x﻿"), "﻿x﻿")
        self.assertEqual(trimmed("​x​"), "​x​")

    def test_the_set_is_what_a_number_read_ignores(self):
        self.assertEqual(to_number(" 　 1.5  "), 1.5)
        self.assertIsNone(to_number("\u001f1.5"))


class Order(unittest.TestCase):
    def test_two_strings_are_ordered_by_code_point(self):
        self.assertEqual(compare("a", "a"), 0)
        self.assertLess(compare("a", "b"), 0)
        self.assertLess(compare("ab", "abc"), 0)
        self.assertGreater(compare("abc", "ab"), 0)

    def test_a_symbol_outside_the_basic_plane_orders_above_the_plane(self):
        """The wrong implementation: comparing sixteen bit units.

        A symbol outside the basic plane is stored as a pair beginning at
        U+D800 on such a host, which puts it below every code point from U+E000
        up. The page fixes the other order, and an engine that sorted an array of
        symbols would put one name in a different place from every other engine.
        """
        above_the_plane = "\U00010000"
        inside = "�"
        self.assertGreater(compare(above_the_plane, inside), 0)
        self.assertEqual(length(above_the_plane), 1.0)


class StringCalls(unittest.TestCase):
    """`stdlib.md` section 10, including what each call does with absence."""

    def test_length_and_indexing_count_code_points(self):
        text = "a\U0001f600b"
        self.assertEqual(length(text), 3.0)
        self.assertEqual(index_of(text, "b"), 2.0)
        self.assertEqual(substring(text, 1.0, 2.0), "\U0001f600")
        self.assertEqual(substring(text, 1.0, None), "\U0001f600b")

    def test_an_empty_separator_splits_into_code_points(self):
        """The wrong implementation: splitting into the host's storage units.

        `compiled-program.md` section 3.1 makes a string a sequence of code
        points, so the parts of a split are code points. A host whose strings are
        sixteen bit units splits a symbol outside the basic plane into two halves
        of a pair, neither of which is a value this language has.
        """
        self.assertEqual(split("a\U0001f600", ""), ["a", "\U0001f600"])
        self.assertEqual(split("a,b", ","), ["a", "b"])
        self.assertIsNone(split(None, ","))

    def test_the_tests_that_answer_a_bool(self):
        self.assertTrue(starts_with("abc", "ab"))
        self.assertFalse(ends_with("abc", "ab"))
        self.assertIsNone(starts_with(None, "ab"))

    def test_replace_touches_one_and_replace_all_touches_every(self):
        self.assertEqual(replace("aaa", "a", "b"), "baa")
        self.assertEqual(replace_all("aaa", "a", "b"), "bbb")

    def test_case_conversion_is_not_locale_aware(self):
        self.assertEqual(upper("abc"), "ABC")
        self.assertEqual(lower("ABC"), "abc")

    def test_padding_cuts_the_fill_where_the_width_falls(self):
        self.assertEqual(pad_left("7", 4.0, "-"), "---7")
        self.assertEqual(pad_right("7", 4.0, "-"), "7---")
        self.assertEqual(pad_left("7", 4.0, "ab"), "aba7")
        self.assertEqual(pad_left("7", 1.0, "-"), "7")
        self.assertEqual(pad_left("7", 4.0, None), "   7")
        self.assertEqual(pad_left("7", 4.0, ""), "7")

    def test_join_spells_an_element_as_text_spells_it(self):
        self.assertEqual(join([1.0, None, True, "x"], ","), "1,none,true,x")

    def test_repeat_can_be_measured_before_it_is_built(self):
        self.assertEqual(repeat("ab", 3.0), "ababab")
        self.assertEqual(repeat_length("ab", 3.0), 6)
        self.assertEqual(repeat_length("ab", 1e9), 2000000000)
        self.assertEqual(repeat("ab", 0.0), "")

    def test_a_count_that_is_not_whole_is_absence_rather_than_a_guess(self):
        self.assertIsNone(repeat("ab", 1.5))
        self.assertIsNone(substring("abc", 1.5, None))
        self.assertEqual(pad_left("7", 1.5, "-"), "7")

    def test_trim_is_the_page_set(self):
        self.assertEqual(trim("  x 　"), "x")
        self.assertIsNone(trim(None))


if __name__ == "__main__":
    unittest.main()
