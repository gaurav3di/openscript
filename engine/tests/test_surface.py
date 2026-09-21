"""The markers, the levels and the two paints, against the rules the pages fix.

Each test here was written from the sentence it holds, and each was run against
the wrong implementation it is meant to catch before it was kept: a marker that
ignores deferral, a projection that counts a moving bar once per execution, a
level read from the first bar instead of the last, a paint that writes a row for
a bar nobody painted. A test that cannot fail is documentation with a green tick
on it, and the comment above each one says what made it fail.

The channel names are read out of ``conformance.md`` section 2 rather than
written down here, because a name this engine invents is a channel no case can
ever assert and no comparison would ever notice.
"""

import json
import re
import unittest

from tests import surface_support as fixture
from tests.support import SPEC

from openscript.adapter.matching import EXACT, compare_channel
from openscript.adapter.spellings import as_reported
from openscript.diagnostics import NO_POSITION, failure
from openscript.run import BarResult
from openscript.surface import ANSWERED, UNANSWERED, surface_channels

#: The row of section 2's ``case.json`` table that lists what a case may assert.
ASSERTS = re.compile(r"^\| `asserts` \|(.+)\|\s*$")


def page_channels():
    """Every channel name section 2 lets a case assert, read off the page."""
    text = (SPEC / "conformance.md").read_text(encoding="utf-8")
    for line in text.replace("\r\n", "\n").splitlines():
        found = ASSERTS.match(line)
        if found is not None:
            return re.findall(r"`([A-Za-z]+)`", found.group(1))
    return []


def channels_of(run, executions):
    """The surface channels of a run, spelled as a case file writes them."""
    return surface_channels(run.program, executions, as_reported)


def started(raw):
    """A run of a program, or the diagnostic that refused it, said out loud."""
    result = fixture.started(raw)
    if not result.ok:
        raise AssertionError(f"the fixture program was refused: {result.diagnostic}")
    return result.run


class TheChannelNames(unittest.TestCase):
    """What this package answers by, held to the vocabulary a case is written in."""

    def setUp(self):
        self.names = page_channels()

    def test_the_page_was_actually_read(self):
        # Without this the two tests below pass over an empty list, which is the
        # shape of every check this repository has had to write twice.
        self.assertIn("values", self.names)
        self.assertGreaterEqual(len(self.names), 10)

    def test_every_channel_this_package_answers_is_one_a_case_can_assert(self):
        # Caught a name spelled barColours, which no case could ever have named
        # and no comparison would ever have reported.
        for name in ANSWERED:
            with self.subTest(channel=name):
                self.assertIn(name, self.names)

    def test_every_channel_it_refuses_is_one_a_case_can_assert(self):
        for name in UNANSWERED:
            with self.subTest(channel=name):
                self.assertIn(name, self.names)

    def test_a_channel_is_answered_or_named_and_never_both(self):
        self.assertEqual(set(ANSWERED) & set(UNANSWERED), set())


class TheMarkersChannel(unittest.TestCase):
    """2.8: a marker is emitted when its channel holds a string, and not otherwise."""

    def test_a_marker_is_drawn_on_the_bars_whose_channel_held_a_string(self):
        run = started(fixture.marking())
        found = channels_of(run, fixture.executed(run, [99.0, 101.0, 98.0, 105.0]))
        # A projection that wrote a row per bar gives four rows, and one that
        # read the declaration rather than the channel gives one.
        self.assertEqual(
            found["markers"],
            [
                {"barIndex": 1, "key": "m0", "text": "UP"},
                {"barIndex": 3, "key": "m0", "text": "UP"},
            ],
        )

    def test_a_channel_holding_a_number_draws_nothing(self):
        # The same program writing a number into the marker channel. "And not
        # otherwise" is the half of the sentence that is easy to drop: a
        # projection testing for presence instead of for a string draws two.
        run = started(fixture.marking(kind="number", constant=fixture.HUNDRED))
        executions = fixture.executed(run, [99.0, 101.0, 105.0])
        self.assertEqual(executions[1].columns[0], 100.0)
        self.assertEqual(channels_of(run, executions)["markers"], [])

    def test_a_marker_is_held_back_on_a_bar_the_engine_did_not_decide(self):
        run = started(fixture.marking())
        executions = fixture.executed(run, [105.0], confirmed=[False])
        # Step 8 published the text and step 9 threw it away (5.4). A projection
        # reading the column without asking whether it reached the host draws a
        # marker on a bar that never decided anything, which is the defect the
        # deferral rule exists to prevent.
        self.assertEqual(executions[0].columns[0], "UP")
        self.assertEqual(executions[0].applied_channels, [])
        self.assertEqual(channels_of(run, executions)["markers"], [])

    def test_the_last_execution_of_a_moving_bar_is_the_bar(self):
        run = started(fixture.marking())
        executions = fixture.executed(
            run, [105.0, 99.0], confirmed=[False, True], indexes=[0, 0]
        )
        # Section 6.4: the set after five updates is the set after one. A
        # projection appending per execution draws the marker the first
        # execution wrote and the bar in the end did not.
        self.assertEqual(channels_of(run, executions)["markers"], [])

    def test_a_marker_the_decided_execution_wrote_is_drawn(self):
        run = started(fixture.marking())
        executions = fixture.executed(
            run, [99.0, 105.0], confirmed=[False, True], indexes=[0, 0]
        )
        self.assertEqual(
            channels_of(run, executions)["markers"],
            [{"barIndex": 0, "key": "m0", "text": "UP"}],
        )

    def test_a_bar_that_drew_on_every_execution_still_draws_one_marker(self):
        # A study declaring onUnconfirmed applies its deferred channels on a bar
        # that is still moving (5.4), so both executions here drew. Section 6.4:
        # the set after five updates is the set after one, and a host redrawing
        # what it is handed accumulates nothing. A projection folding every
        # execution in draws the same marker twice on one bar.
        raw = fixture.marking()
        raw["meta"]["onUnconfirmed"] = True
        run = started(raw)
        executions = fixture.executed(
            run, [105.0, 106.0], confirmed=[False, True], indexes=[0, 0]
        )
        self.assertEqual(len(executions[0].applied_channels), 1)
        self.assertEqual(
            channels_of(run, executions)["markers"],
            [{"barIndex": 0, "key": "m0", "text": "UP"}],
        )

    def test_a_bar_that_raised_draws_nothing(self):
        # An error during step 6 stops the bar: steps 7 to 11 do not run, so the
        # columns that execution carries are the ones the bar began with and
        # nothing in them reached a host. A projection folding the failed
        # execution in draws a marker for a bar that raised.
        run = started(fixture.marking())
        executions = fixture.executed(run, [105.0])
        stopped = BarResult(1, ["UP"], [0], [], [], failure("OS4004", NO_POSITION))
        found = channels_of(run, list(executions) + [stopped])
        self.assertEqual([row["barIndex"] for row in found["markers"]], [0])


class TheLevelsChannel(unittest.TestCase):
    """2.8: the level drawn is the one from the last bar executed."""

    def test_a_level_carries_the_value_the_last_bar_left(self):
        run = started(fixture.levelling())
        found = channels_of(run, fixture.executed(run, [99.0, 101.0, 103.0]))
        # Reading the first bar gives 99, reading every bar gives three rows,
        # and both are what a level is not.
        self.assertEqual(found["levels"], [{"level": 0, "value": 103.0}])

    def test_a_level_nothing_wrote_is_not_drawn_and_the_ordinal_says_which(self):
        run = started(fixture.levelling())
        found = channels_of(run, fixture.executed(run, [99.0]))
        # The second declared level has no row at all, and the first says it is
        # the first. A projection writing a row with a null value for it puts a
        # line on the chart at no price.
        self.assertEqual([row["level"] for row in found["levels"]], [0])

    def test_a_run_with_no_bars_draws_no_level(self):
        run = started(fixture.levelling())
        self.assertEqual(channels_of(run, [])["levels"], [])


class ThePaintChannels(unittest.TestCase):
    """14.3: an absent colour leaves the bar alone, and that is not an error."""

    def test_only_a_painted_bar_has_a_row(self):
        run = started(fixture.painting("barColor"))
        found = channels_of(run, fixture.executed(run, [99.0, 101.0, 98.0]))
        # A projection writing a row per bar paints every bar, since a row with
        # a null colour is indistinguishable from one a host should ignore.
        self.assertEqual(found["barColors"], [{"barIndex": 1, "color": "#112233ff"}])

    def test_the_background_is_read_from_its_own_field(self):
        run = started(fixture.painting("background"))
        found = channels_of(run, fixture.executed(run, [101.0]))
        # Caught a projection reading one field of outputs for both paints,
        # which answered the bar colouring with the background's channel.
        self.assertEqual(found["background"], [{"barIndex": 0, "color": "#112233ff"}])
        self.assertEqual(found["barColors"], [])

    def test_a_moving_bar_is_one_row_however_many_times_it_executed(self):
        # A paint is not deferred, so every execution of a moving bar published
        # one. The bar is still one bar, and one row.
        run = started(fixture.painting("barColor"))
        executions = fixture.executed(
            run, [105.0, 103.0, 101.0], confirmed=[False, False, True], indexes=[0, 0, 0]
        )
        self.assertEqual(
            channels_of(run, executions)["barColors"], [{"barIndex": 0, "color": "#112233ff"}]
        )

    def test_a_program_that_paints_nothing_answers_two_empty_channels(self):
        run = started(fixture.marking())
        found = channels_of(run, fixture.executed(run, [105.0]))
        self.assertEqual(found["barColors"], [])
        self.assertEqual(found["background"], [])

    def test_a_paint_is_held_to_the_same_deferral_rule_as_everything_else(self):
        # The compiler declares no paint channel deferred, so this is about the
        # rule rather than about a program: a channel that was not applied did
        # not reach a host, whichever surface it belongs to.
        raw = fixture.painting("barColor")
        raw["channels"][0]["defer"] = True
        raw["channels"][0]["once"] = False
        run = started(raw)
        executions = fixture.executed(run, [105.0], confirmed=[False])
        self.assertEqual(channels_of(run, executions)["barColors"], [])


class ANamedColourAtTheContractBoundary(unittest.TestCase):
    """Section 6: four integer channels, after 3.1's one way alpha conversion."""

    def setUp(self):
        self.authority = json.loads(
            (SPEC / "colours.json").read_text(encoding="utf-8")
        )["channels"]

    def painted(self, colour):
        run = started(fixture.painting("barColor", colour=colour))
        found = channels_of(run, fixture.executed(run, [105.0]))
        return found["barColors"][0]["color"]

    def test_every_named_colour_reaches_the_channel_as_the_authority_states_it(self):
        # The values are read from spec/colours.json and not written here: two
        # copies that agree with each other and with nothing published are still
        # a contract nobody can implement against.
        self.assertEqual(len(self.authority), 19)
        for name, channels in self.authority.items():
            with self.subTest(colour=name):
                red, green, blue = channels
                self.assertEqual(self.painted([red, green, blue, 1]), f"#{red:02x}{green:02x}{blue:02x}ff")

    def test_the_alpha_becomes_a_byte_by_halves_away_from_zero(self):
        # 3.1: the conversion is round(alpha * 255) with the language's own
        # rounding, halves away from zero. This alpha multiplies out to exactly
        # 126.5, where rounding to even gives 7e and truncating gives 7e as
        # well, so the byte below is the one thing the two wrong rules cannot
        # produce.
        self.assertEqual(self.painted([255, 136, 0, 126.5 / 255]), "#ff88007f")

    def test_the_conversion_is_one_way_and_the_page_says_so(self):
        # 3.1's own two examples: #ff880080 parses to 128 divided by 255 and
        # serialises back to 80, and an alpha of 0.12 serialises to 1f, which
        # reads back as a different number.
        self.assertEqual(self.painted([255, 136, 0, 128 / 255]), "#ff880080")
        self.assertEqual(self.painted([255, 136, 0, 0.12]), "#ff88001f")


class TheRowsACaseFileCanHold(unittest.TestCase):
    """Section 4: an ordered list of flat objects, compared field by field.

    A row is only an answer if the suite can compare it and a case file can hold
    it. Both are checked here rather than assumed, because a row carrying a
    value of the machine's own kinds, a colour object rather than its spelling,
    reads perfectly in a test and cannot be written into ``expected.json`` at
    all.
    """

    def setUp(self):
        run = started(fixture.painting("barColor"))
        self.found = channels_of(run, fixture.executed(run, [101.0, 99.0, 105.0]))

    def test_every_channel_is_json_and_survives_the_round_trip(self):
        # A colour reaching a row as the machine holds it raises here, and a
        # non-finite number reaching one comes back as a word no reader parses.
        text = json.dumps(self.found, allow_nan=False)
        self.assertEqual(json.loads(text), self.found)

    def test_a_channel_compares_equal_to_itself(self):
        rows = self.found["barColors"]
        self.assertIsNone(compare_channel("barColors", rows, rows, EXACT))

    def test_a_difference_is_reported_at_the_row_and_the_field_it_is_in(self):
        rows = self.found["barColors"]
        changed = [dict(one) for one in rows]
        changed[1]["color"] = "#00000000"
        found = compare_channel("barColors", changed, rows, EXACT)
        # The comparison the adapter runs, over the rows this package builds: a
        # row whose fields it could not read would report a kind difference
        # rather than a colour difference, at no field at all.
        self.assertEqual(found["outcome"], "fail")
        self.assertEqual(found["index"], 1)
        self.assertEqual(found["column"], "color")

    def test_a_missing_row_is_reported_as_a_length_before_any_field(self):
        rows = self.found["barColors"]
        found = compare_channel("barColors", rows[:1], rows, EXACT)
        # Which is what a bar that should have been painted and was not looks
        # like, and section 6 puts the length first for exactly that reason.
        self.assertEqual(found["bound"], "length")


if __name__ == "__main__":
    unittest.main()
