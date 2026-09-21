"""How a case file's values are read and how a report writes them.

The test each of these is written against is the same one: an adapter that used
the interpreter's own number reader. That reader is wider than the decimal
``conformance.md`` section 3 describes, and every spelling it accepts beyond one
is a value ``language.md`` section 5.1 says never appears in this language. A
case carrying one would be run rather than refused, and the engine would be
blamed for arithmetic over an infinity that the case handed it.
"""

import unittest

from openscript.adapter.spellings import (
    Malformed,
    colour_text,
    read_cell,
    read_colour,
    read_number,
    read_whole,
    written,
)
from openscript.library.colour import Colour as LibraryColour
from openscript.values import Colour as MachineColour


class Numbers(unittest.TestCase):
    """Catches an adapter that handed a case file's text to the interpreter's own
    reader, which takes each of these and gives back a value the language holds
    none of."""

    def test_a_decimal_is_the_value_it_names(self):
        self.assertEqual(read_number("101.25", "here"), 101.25)
        self.assertEqual(read_number("-0.5", "here"), -0.5)
        self.assertEqual(read_number("1e-7", "here"), 1e-7)
        self.assertEqual(read_number("15000", "here"), 15000.0)

    def test_the_spellings_a_case_file_does_not_hold(self):
        for text in ("inf", "-inf", "Infinity", "nan", "1_0", "0x10", " 1", "1 ", "", "1d0"):
            with self.subTest(text=text):
                with self.assertRaises(Malformed):
                    read_number(text, "here")

    def test_a_decimal_past_the_finite_range_is_refused_rather_than_read(self):
        with self.assertRaises(Malformed):
            read_number("1e400", "here")

    def test_a_time_is_a_whole_number(self):
        self.assertEqual(read_whole("1735689600000", "here"), 1735689600000)
        with self.assertRaises(Malformed):
            read_whole("1735689600000.0", "here")


class Absence(unittest.TestCase):
    """Catches an adapter that read the four letters of absence as a string value,
    or an empty field as one, on a channel whose type is a string."""

    def test_absence_is_read_from_either_spelling_on_every_type(self):
        for kind in ("number", "bool", "string", "color"):
            with self.subTest(kind=kind):
                self.assertIsNone(read_cell("none", kind, "here"))
                self.assertIsNone(read_cell("", kind, "here"))

    def test_a_cell_is_read_as_the_channel_type_and_not_as_its_shape(self):
        self.assertEqual(read_cell("true", "string", "here"), "true")
        self.assertIs(read_cell("true", "bool", "here"), True)
        self.assertEqual(read_cell("2", "string", "here"), "2")
        self.assertEqual(read_cell("2", "number", "here"), 2.0)


class Colours(unittest.TestCase):
    """Catches an adapter that compared a colour before the alpha became a byte, or
    that rounded the byte to nearest even rather than halves away from zero."""

    def test_the_alpha_becomes_a_byte_with_halves_away_from_zero(self):
        self.assertEqual(colour_text(MachineColour(255, 136, 0, 128 / 255)), "#ff880080")
        self.assertEqual(colour_text(MachineColour(0, 0, 0, 0.5)), "#00000080")
        # 0.3 times 255 is exactly 76.5, where halves away from zero gives 77
        # and nearest even gives 76. The one alpha that separates the two.
        self.assertEqual(colour_text(MachineColour(0, 0, 0, 0.3)), "#0000004d")
        self.assertEqual(colour_text(MachineColour(0, 0, 0, 1)), "#000000ff")
        self.assertEqual(colour_text(MachineColour(0, 0, 0, 0)), "#00000000")

    def test_both_shapes_of_colour_this_package_holds_spell_the_same_way(self):
        self.assertEqual(
            colour_text(MachineColour(1, 2, 3, 0.25)), colour_text(LibraryColour(1, 2, 3, 0.25))
        )

    def test_a_colour_is_read_as_the_eight_digits_it_is_compared_as(self):
        self.assertEqual(read_colour("#00ff7f40", "here"), "#00ff7f40")
        for text in ("#00FF7F40", "#00ff7f", "00ff7f40", "#00ff7f4", "#gg000000"):
            with self.subTest(text=text):
                with self.assertRaises(Malformed):
                    read_colour(text, "here")


class Written(unittest.TestCase):
    """Catches a report that rounded a difference away by printing it, which is the
    one thing section 9 says the reporting may not do."""

    def test_a_number_is_the_shortest_decimal_that_reads_back(self):
        self.assertEqual(written(0.1 + 0.2), "0.30000000000000004")
        self.assertEqual(written(68.21847374634196), "68.21847374634196")
        self.assertEqual(written(1e-7), "1e-7")
        self.assertEqual(written(1.0), "1")
        self.assertEqual(written(-0.0), "0")

    def test_absence_and_the_two_bools(self):
        self.assertEqual(written(None), "none")
        self.assertEqual(written(True), "true")
        self.assertEqual(written(False), "false")


if __name__ == "__main__":
    unittest.main()
