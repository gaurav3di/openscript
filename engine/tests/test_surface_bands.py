"""The fills channel, and the two refusals a band's own names can earn.

A band is the one surface whose declaration names something other than a
channel: ``compiled-program.md`` 2.8 carries its two sides as plot keys, and the
colour beside each side may be a channel the script computes per bar. Both are
places a program can name something that is not there, and this engine's
verification reads neither: 3.5 check 1 holds the required channel indexes in
range and a band's are nullable, so nothing before this point has looked. The
tests at the bottom are what keeps that from being read as a null colour and a
band drawn nowhere.
"""

import unittest

from tests import support, surface_support as fixture

from openscript.adapter.spellings import as_reported
from openscript.diagnostics import ScriptError
from openscript.surface import surface_channels


def channels_of(run, executions):
    return surface_channels(run.program, executions, as_reported)


def started(raw):
    result = fixture.started(raw)
    if not result.ok:
        raise AssertionError(f"the fixture program was refused: {result.diagnostic}")
    return result.run


def drawn(found):
    """The bars a band was drawn on, which is what the rows are a list of."""
    return [row["barIndex"] for row in found["fills"]]


class TheFillsChannel(unittest.TestCase):
    """stdlib.md 18: an absent value reaching a surface is a gap, and a band stops."""

    def test_a_band_is_drawn_where_both_of_its_columns_have_a_value(self):
        run = started(fixture.banding())
        found = channels_of(
            run,
            fixture.executed(run, [99.0, 101.0, 103.0], highs=[100.0, None, 104.0]),
        )
        # The middle bar has no value in the second column, so the band stops
        # there. A projection reading only the first column draws all three,
        # which is the surface case conformance.md section 7 names.
        self.assertEqual(drawn(found), [0, 2])

    def test_a_band_stops_where_the_first_column_has_a_gap_as_well(self):
        run = started(fixture.banding())
        found = channels_of(
            run,
            fixture.executed(run, [99.0, None, 103.0], highs=[100.0, 101.0, 104.0]),
        )
        # The same rule from the other side: a projection that checked only the
        # second column passes the test above and fails this one.
        self.assertEqual(drawn(found), [0, 2])

    def test_a_band_that_declares_its_colours_computes_none_per_bar(self):
        run = started(fixture.banding())
        found = channels_of(run, fixture.executed(run, [101.0], highs=[102.0]))
        # Null means the bar computed no colour for that side, and the colour
        # the band was declared with is in the program both engines read.
        self.assertEqual(
            found["fills"],
            [{"barIndex": 0, "fill": 0, "colorUp": None, "colorDown": None}],
        )

    def test_a_per_bar_colour_is_read_from_the_channel_the_band_names(self):
        run = started(fixture.banding(coloured=True))
        found = channels_of(
            run, fixture.executed(run, [99.0, 105.0], highs=[100.0, 106.0])
        )
        # The channel is written on the bars above a hundred only, so the first
        # row carries null and the second the colour. A projection reading the
        # declaration instead of the channel gives two nulls.
        self.assertEqual([row["colorUp"] for row in found["fills"]], [None, "#112233ff"])
        self.assertEqual([row["colorDown"] for row in found["fills"]], [None, None])

    def test_a_row_says_which_band_it_belongs_to(self):
        raw = fixture.banding()
        raw["outputs"]["fills"].append(fixture.band("b", "a"))
        run = started(raw)
        found = channels_of(run, fixture.executed(run, [99.0, 101.0], highs=[100.0, 102.0]))
        # Two bands over two bars, bar by bar and in declaration order inside a
        # bar. A projection numbering the rows rather than the declarations
        # gives 0, 1, 2, 3, and a case could never say which band it meant.
        self.assertEqual(
            [(row["barIndex"], row["fill"]) for row in found["fills"]],
            [(0, 0), (0, 1), (1, 0), (1, 1)],
        )

    def test_a_program_with_no_band_answers_an_empty_channel(self):
        run = started(fixture.marking())
        self.assertEqual(channels_of(run, fixture.executed(run, [105.0]))["fills"], [])


class WhatABandMayName(unittest.TestCase):
    """OS6018: a program that names something it does not have is refused, not read."""

    def setUp(self):
        self.catalogue = {one["code"] for one in support.catalogue()["entries"]}

    def refusal(self, raw):
        """The diagnostic the projection of this program raises."""
        run = started(raw)
        executions = fixture.executed(run, [101.0], highs=[102.0])
        with self.assertRaises(ScriptError) as caught:
            channels_of(run, executions)
        return caught.exception.diagnostic

    def test_the_code_is_one_the_catalogue_has(self):
        # A code this engine invented would be a refusal no host could look up.
        self.assertIn("OS6018", self.catalogue)

    def test_a_band_drawn_between_a_plot_this_program_does_not_declare(self):
        raw = fixture.banding()
        raw["outputs"]["fills"][0]["between"] = ["a", "nothing"]
        found = self.refusal(raw)
        # Verification does not reach this pair of names, so without the refusal
        # the band is drawn on no bar and nothing anywhere says why.
        self.assertEqual(found.code, "OS6018")
        self.assertEqual(found.values["location"], "outputs.fills[0].between[1]")

    def test_a_colour_channel_past_the_end_of_the_channel_table(self):
        raw = fixture.banding(coloured=True)
        raw["outputs"]["fills"][0]["colorUpChannel"] = 9
        found = self.refusal(raw)
        # The program loads: 3.5 check 1 reads the required channel indexes and
        # this field is nullable, so it is not among them. Read without a check
        # it is a colour nobody wrote, reported as null on every row.
        self.assertEqual(found.code, "OS6018")
        self.assertEqual(found.values["location"], "outputs.fills[0].colorUpChannel")

    def test_a_band_that_does_not_name_two_sides(self):
        raw = fixture.banding()
        raw["outputs"]["fills"][0]["between"] = ["a"]
        found = self.refusal(raw)
        self.assertEqual(found.code, "OS6018")
        self.assertEqual(found.values["location"], "outputs.fills[0].between")

    def test_a_program_that_names_everything_it_has_raises_nothing(self):
        # The other half of every refusal above: the fixture they are mutations
        # of is projected without one, so the tests are about the mutation.
        run = started(fixture.banding(coloured=True))
        self.assertEqual(len(channels_of(run, fixture.executed(run, [105.0], highs=[106.0]))["fills"]), 1)


if __name__ == "__main__":
    unittest.main()
