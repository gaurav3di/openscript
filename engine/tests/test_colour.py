"""Colour: the table held to its authority, and the two arrangements 20.9 fixes.

**The channel values are a fact this repository holds in one place**, and a
package a host installs cannot read a specification file at run time, so the
table in the engine is a copy. `spec/colours.json` is the authority, `stdlib.md`
section 11.1 makes those values part of the conformance suite, and gap 4 of
section 20.11 records that the prose does not write them out. This file is what
keeps the copy honest: it compares the engine's table with the authority, name by
name and channel by channel. Two copies that agree with each other and with
nothing published are still a contract nobody can implement against, which is
what the check on the first engine's two tables was written to stop.

The arithmetic here is small and every part of it had an alternative that is
mathematically equal and differs in the last bit, so each case below names the
one that was not chosen.
"""

import unittest

from openscript.library.colour import (
    NAMES,
    Colour,
    alpha,
    fade,
    hex_byte,
    make,
    mix,
    named,
    rgb,
    rgba,
    with_alpha,
)
from openscript.library.number_text import spell
from tests import vectors

AUTHORITY = vectors.ROOT / "spec" / "colours.json"

# Full opacity, as section 11.1 states it and `compiled-program.md` 2.9 writes it.
OPAQUE = 1.0


class NamedColours(unittest.TestCase):
    def setUp(self):
        self.page = vectors.read(AUTHORITY)["channels"]

    def test_the_authority_was_read_and_held_names(self):
        self.assertGreater(len(self.page), 0)

    def test_every_name_the_authority_holds_is_in_the_engine_table(self):
        missing = [name for name in self.page if named(name) is None]
        self.assertEqual(missing, [])

    def test_every_name_the_engine_holds_is_in_the_authority(self):
        """The direction that catches a name this engine invented."""
        extra = [name for name in NAMES if name not in self.page]
        self.assertEqual(extra, [])

    def test_every_channel_is_the_authority_channel_at_full_opacity(self):
        for name, channels in self.page.items():
            red, green, blue = channels
            self.assertEqual(
                named(name),
                Colour(float(red), float(green), float(blue), OPAQUE),
                name,
            )

    def test_a_name_nobody_defined_is_absence(self):
        self.assertIsNone(named("chartreuse"))


class Arrangements(unittest.TestCase):
    def test_fade_subtracts_before_it_divides(self):
        """The wrong implementation: ``1 - percent / 100``.

        `stdlib.md` section 20.9 measured the two as different numbers at 40 of
        the 101 whole percentages. That is not a rarity a contrived argument has
        to reach for: it is two in five of the values a reader writes.
        """
        self.assertEqual(alpha(fade(named("aqua"), 33.0)), (100 - 33) / 100)
        self.assertNotEqual((100 - 33) / 100, 1 - 33 / 100)

    def test_fade_sets_the_alpha_rather_than_scaling_it(self):
        """The wrong implementation: multiplying the alpha the colour carried.

        Section 11.2 states the identity and the nesting that follows from it:
        two fades are the outer one, because the second call replaces the alpha
        the first set rather than fading what was already faded.
        """
        once = fade(named("aqua"), 50.0)
        twice = fade(once, 50.0)
        self.assertEqual(twice, once)

    def test_mix_interpolates_from_the_first_colour_toward_the_second(self):
        """The wrong implementation: ``from * (1 - weight) + to * weight``.

        The two are mathematically equal and differ in the last bit, and section
        20.9 states this one. The difference shows on the alpha, which is not
        rounded afterwards; on a channel the rounding usually hides it, which is
        exactly why the page had to choose rather than leave it.
        """
        first = rgba(0.0, 0.0, 0.0, 0.25)
        second = rgba(255.0, 255.0, 255.0, 0.75)
        weight = 0.06
        blended = mix(first, second, weight)
        self.assertEqual(blended.a, 0.25 + (0.75 - 0.25) * weight)
        self.assertNotEqual(0.25 + (0.75 - 0.25) * weight, 0.25 * (1 - weight) + 0.75 * weight)

    def test_mix_returns_the_first_colour_exactly_at_a_weight_of_zero(self):
        """Which the other arrangement also does, and 20.9 says so.

        Neither arrangement is the safer one at an endpoint, and choosing on that
        ground would be choosing on the case a blend is never asked for. This is
        here to record that the endpoint is not the reason, not to claim it is.
        """
        first = rgba(10.0, 20.0, 30.0, 0.4)
        self.assertEqual(mix(first, named("white"), 0.0), first)


class ChannelInvariant(unittest.TestCase):
    """`compiled-program.md` 3.1: whole channels, and an alpha that is not."""

    def test_a_computed_channel_is_rounded_with_the_language_rounding(self):
        blended = mix(rgb(0.0, 0.0, 0.0), rgb(255.0, 255.0, 255.0), 0.5)
        self.assertEqual(blended.r, 128.0)
        self.assertEqual(blended, make(127.5, 127.5, 127.5, OPAQUE))

    def test_the_alpha_is_not_rounded(self):
        self.assertEqual(alpha(with_alpha(named("aqua"), 0.123456)), 0.123456)

    def test_a_channel_outside_the_range_is_held_inside_it(self):
        self.assertEqual(rgb(300.0, -5.0, 128.4), Colour(255.0, 0.0, 128.0, OPAQUE))

    def test_an_alpha_outside_the_range_is_held_inside_it(self):
        self.assertEqual(alpha(rgba(0.0, 0.0, 0.0, 5.0)), 1.0)
        self.assertEqual(alpha(rgba(0.0, 0.0, 0.0, -5.0)), 0.0)

    def test_an_absent_argument_makes_an_absent_colour(self):
        self.assertIsNone(rgb(None, 0.0, 0.0))
        self.assertIsNone(fade(None, 50.0))
        self.assertIsNone(mix(named("aqua"), None, 0.5))
        self.assertIsNone(alpha(1.0))


class ToText(unittest.TestCase):
    """The wire form, which is what the conformance suite compares."""

    def test_a_colour_is_spelled_with_an_alpha_byte(self):
        self.assertEqual(spell(named("aqua")), "#00ffffff")
        self.assertEqual(spell(rgba(255.0, 136.0, 0.0, 0.5019607843137255)), "#ff880080")

    def test_the_alpha_byte_is_the_rounded_alpha_and_is_not_a_round_trip(self):
        """Section 11.2's own example, which an engine has to reproduce.

        A fade to 88 is an alpha of 0.12, and 0.12 times 255 rounds to 31, which
        is written ``1f``. Reading ``1f`` back gives 31 divided by 255, which is
        not 0.12: the conversion is one way, and nothing in the language observes
        the difference because a script reads an alpha from the machine value.
        """
        faded = fade(named("aqua"), 88.0)
        self.assertEqual(spell(faded), "#00ffff1f")
        self.assertNotEqual(alpha(faded), 31 / 255)

    def test_a_byte_is_written_from_a_table_and_not_by_a_number_writer(self):
        self.assertEqual(hex_byte(0.0), "00")
        self.assertEqual(hex_byte(255.0), "ff")
        self.assertEqual(hex_byte(16.0), "10")


if __name__ == "__main__":
    unittest.main()
