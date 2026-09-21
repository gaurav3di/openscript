"""How a number becomes text, held to the vectors and to the rule's own shape.

`language.md` section 5.5 is one rule for every number that becomes text, and
what can be wrong about an implementation of it is the layout: which side of a
threshold a value falls on, how an exponent is spelled, what a zero is. So the
writer is held to three things, each catching a different wrong implementation.

**The vectors.** `spec/vectors/number-text.json` is the file a second engine is
told to check itself against, so this engine is checked against the same file, in
both directions: writing the value gives the text and reading the text gives the
value. A writer that turned to an exponent at sixteen digits or at four decimal
places, wrote a sign on an exponent, or wrote a point and a zero after a whole
number fails a row.

**The host's own writing is not this rule**, and that is asserted rather than
assumed, because this host's shortest form is right about the digits and wrong
about the layout at four kinds of value. An engine that returned it would be
quick, would look correct in a console, and would disagree with the other engine
on a label, a constant and an expected column.

**A sweep.** Two rules hold of every finite number and neither is in the vector
file: the text reads back as the value it was written from, and it carries an
exponent on exactly the values outside the positional range. A threshold moved by
one decade passes every row of a file that happens not to hold that decade, and
fails here on the first value that lands between the two.
"""

import struct
import unittest
from pathlib import Path

import openscript
from openscript.canonical import canonical_number
from openscript.library import number_text
from openscript.library.number_text import fixed, fixed_length, to_number
from openscript.library.rounding import round_half_away, scale_of
from tests import vectors

# The positional range of 5.5: from ten to the minus sixth up to, and not
# including, ten to the twenty first. Written as the two values the page names
# rather than as the two exponents, so that a reader can compare them with the
# sentence.
LOWEST_POSITIONAL = 1e-6
FIRST_EXPONENT = 1e21

# A sweep wide enough to cross every threshold, built from a recurrence rather
# than from a source of randomness: two runs of this file compare the same
# values, which is the determinism rule of `language.md` section 7.6 applied to
# the test that checks it.
SWEEP = 20000
_MULTIPLIER = 6364136223846793005
_INCREMENT = 1442695040888963407
_MASK = (1 << 64) - 1


def sweep():
    """Finite binary64 values spread over the whole range, in a fixed order."""
    state = 0x243F6A8885A308D3
    seen = 0
    while seen < SWEEP:
        state = (state * _MULTIPLIER + _INCREMENT) & _MASK
        (value,) = struct.unpack(">d", state.to_bytes(8, "big"))
        if value == value and abs(value) != float("inf"):
            seen += 1
            yield value


def bits_of(value: float) -> str:
    return struct.pack(">d", value).hex()


class NumberText(unittest.TestCase):
    def setUp(self):
        self.rows = vectors.read(vectors.NUMBER_TEXT)["vectors"]
        self.assertGreater(len(self.rows), 0, "the vector file holds rows")

    def test_every_row_is_written_as_the_file_spells_it(self):
        wrong = []
        for row in self.rows:
            value = vectors.number_of(row["bits"])
            got = canonical_number(value)
            if got != row["text"]:
                wrong.append(f"{row['bits']}: this engine {got!r}, the file {row['text']!r}")
        self.assertEqual(wrong, [])

    def test_every_row_reads_back_as_the_value_it_spells(self):
        """The other direction, which a writer can pass while losing a digit."""
        for row in self.rows:
            read_back = float(row["text"])
            expected = row["bits"]
            if expected == bits_of(-0.0):
                # A negative zero is written as zero and reads back as zero: the
                # language holds one zero, so this is the one row where the
                # round trip is deliberately not a round trip.
                expected = bits_of(0.0)
            self.assertEqual(bits_of(read_back), expected, row["note"])

    def test_the_two_spellings_of_a_row_are_one_value(self):
        """A row's bit pattern and its decimal have to be the same number.

        The decimal is what a reader of the file sees and the bits are what an
        engine compares, and a row where they parted would quietly hold two
        different tests.
        """
        for row in self.rows:
            self.assertEqual(bits_of(float(row["value"])), row["bits"], row["note"])

    def test_the_host_own_writing_is_not_this_rule(self):
        """The wrong implementation this file exists to catch.

        If the host's shortest form were the rule, returning it would be the
        whole of the writer. It is not, in four ways at once: a point and a zero
        after a whole number, an exponent at ten to the sixteenth and at ten to
        the minus fifth, a plus on a positive exponent, and a leading zero in a
        small one. The rows are not typed in here; what is asserted is that a
        good part of the file separates the two, so a host whose writing quietly
        became the rule is read about rather than passed over.
        """
        differing = [
            row["text"]
            for row in self.rows
            if repr(vectors.number_of(row["bits"])) != row["text"]
        ]
        self.assertGreater(
            len(differing),
            len(self.rows) // 4,
            "the host's own writing now matches the rule on nearly every row, which "
            "would mean either the host changed or the rule did",
        )

    def test_the_writer_round_trips_over_the_whole_range(self):
        wrong = []
        for value in sweep():
            written = canonical_number(value)
            if bits_of(float(written)) != bits_of(value if value != 0 else 0.0):
                wrong.append(f"{bits_of(value)} was written {written!r}")
                break
        self.assertEqual(wrong, [])

    def test_an_exponent_appears_on_exactly_the_values_outside_the_range(self):
        """The thresholds, which a vector file can only test where it holds a row."""
        wrong = []
        for value in sweep():
            magnitude = abs(value)
            written = canonical_number(value)
            positional = LOWEST_POSITIONAL <= magnitude < FIRST_EXPONENT
            if ("e" in written) == positional:
                wrong.append(f"{bits_of(value)} was written {written!r}")
                break
        self.assertEqual(wrong, [])

    def test_nothing_written_carries_a_sign_or_a_point_it_should_not(self):
        for value in sweep():
            written = canonical_number(value)
            self.assertNotIn("+", written)
            self.assertNotIn("E", written)
            self.assertFalse(written.endswith(".0"), written)
            self.assertFalse(written.startswith("."), written)


class OneWriter(unittest.TestCase):
    """5.5 is one rule, and in this engine it is one function rather than two.

    It was two for a stage: the layout was written out in ``canonical.py`` and
    again in the library, with the two thresholds typed into each. Both passed
    the vectors, so the copy cost nothing on the day it was made. What it cost
    was the day one of the two moved, when a label a script writes and the text
    a recorded hash is taken over would have parted with nothing failing
    anywhere.

    Two checks, because one of them is narrow. The first holds both roads to the
    same rows and catches a second implementation the row after it drifts; it
    does not catch one that still agrees. The second catches the copy itself and
    is narrower still: it reads the package for the two threshold names, so a
    copy spelling them something else is caught by the first check and not by
    this one.
    """

    #: The package this engine is, read as text for the check below.
    PACKAGE = Path(openscript.__file__).parent

    def test_the_text_a_script_asks_for_is_the_encoder_own_writing(self):
        for row in vectors.read(vectors.NUMBER_TEXT)["vectors"]:
            value = vectors.number_of(row["bits"])
            self.assertEqual(number_text.spell(value), canonical_number(value), row["note"])

    def test_the_layout_thresholds_are_stated_in_one_file(self):
        for name in ("_HIGHEST_POSITIONAL", "_LOWEST_POSITIONAL"):
            stating = sorted(
                str(path.relative_to(self.PACKAGE)).replace("\\", "/")
                for path in self.PACKAGE.rglob("*.py")
                if f"{name} = " in path.read_text(encoding="utf-8")
            )
            self.assertEqual(stating, ["canonical.py"], name)


class FixedDecimals(unittest.TestCase):
    """``text(x, decimals)``: positional at every magnitude, halves away from zero."""

    def test_the_digits_are_the_rounded_and_scaled_whole_number(self):
        """An oracle built from whole number arithmetic rather than from a format.

        Below two to the fifty third the scaled and rounded value has no digits
        but its own, so the answer is that whole number with a point cut into it,
        computed here with no floating point on the way. Above it the shortest
        digits are the rule and this oracle says nothing, which is why the range
        is stated rather than assumed.
        """
        wrong = []
        for value in sweep():
            for decimals in (0, 1, 2, 5):
                scaled = round_half_away(value * scale_of(decimals))
                if abs(scaled) >= 2**53 or scaled != scaled or abs(scaled) == float("inf"):
                    continue
                whole = abs(int(scaled))
                digits = str(whole).rjust(decimals + 1, "0")
                sign = "-" if scaled < 0 else ""
                expected = (
                    sign + digits
                    if decimals == 0
                    else sign + digits[: len(digits) - decimals] + "." + digits[len(digits) - decimals :]
                )
                got = fixed(value, decimals)
                if got != expected:
                    wrong.append(f"{bits_of(value)} at {decimals}: {got!r} against {expected!r}")
                    break
        self.assertEqual(wrong, [])

    def test_it_is_not_the_host_fixed_point_formatting(self):
        """The wrong implementation: the host rounds the exact binary expansion.

        `stdlib.md` section 10 and `compiled-program.md` section 8.3 fix this
        conversion as halves away from zero over the **scaled** value, because it
        is a display conversion and half up is what a reader of a price expects.
        The host's own fixed point writing rounds the exact binary expansion with
        halves to even, and the two part at values a price lands on every day.
        """
        # An exact half at two places: the tie rule alone decides it.
        self.assertEqual(fixed(0.125, 2), "0.13")
        self.assertEqual(f"{0.125:.2f}", "0.12")
        # Not an exact half: the value is a shade below one and the scaling
        # brings it up to one, where the exact expansion never gets there.
        self.assertEqual(fixed(0.015, 2), "0.02")
        self.assertEqual(f"{0.015:.2f}", "0.01")
        # A negative at no places, where away from zero and to even part again.
        self.assertEqual(fixed(-2.5, 0), "-3")
        self.assertEqual(f"{-2.5:.0f}", "-2")

    def test_it_never_turns_to_an_exponent(self):
        """A label that changed shape above a threshold is the failure here."""
        for value in (1e21, 1e100, 5e-324, -1e23):
            self.assertNotIn("e", fixed(value, 2))

    def test_the_length_is_measured_before_the_string_is_built(self):
        """A floor on the length, for the ceiling a script can ask an engine to pass."""
        for value in (0.0, 1.0, -1234.5, 1e21, 5e-324):
            for decimals in (0, 2, 9):
                self.assertLessEqual(fixed_length(value, decimals), len(fixed(value, decimals)))


class TextToNumber(unittest.TestCase):
    """``toNumber(s)``: the grammar of `stdlib.md` section 10, and nothing else."""

    def test_it_reads_what_the_grammar_allows(self):
        for text, expected in (
            ("1", 1.0),
            ("-1.5", -1.5),
            ("+2", 2.0),
            (".5", 0.5),
            ("5.", 5.0),
            ("1e3", 1000.0),
            ("1E-3", 0.001),
            ("  1.5  ", 1.5),
            (" 1.5　", 1.5),
        ):
            self.assertEqual(to_number(text), expected, text)

    def test_it_refuses_what_the_host_reader_would_have_accepted(self):
        """The wrong implementation: handing the text to the host's own reader.

        Each of these is a number to this host and is not a number in this
        language, and the last is the one no reviewer would think of: the host's
        digit test accepts the decimal digits of every script Unicode has.
        """
        for text in ("inf", "-Infinity", "nan", "1_000", "0x10", "1d", "", "e3", "1e", "١٢٣"):
            self.assertIsNone(to_number(text), text)

    def test_a_value_with_no_finite_number_is_absent(self):
        self.assertIsNone(to_number("1e400"))
        self.assertEqual(to_number("1e-400"), 0.0)

    def test_the_zero_it_reads_has_no_sign(self):
        self.assertEqual(bits_of(to_number("-0")), bits_of(0.0))


if __name__ == "__main__":
    unittest.main()
