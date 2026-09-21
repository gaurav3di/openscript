"""``adapter/page.py`` against the page it copies, value by value.

The engine reads no page: a package a host installs does not carry the
specification, so the figures the adapter is held to are constants in it. That
makes every one of them a fact stated twice, and this file is the other half of
the arrangement ``conformance.md`` section 6 already names for the tolerance
caps: the document is read here and the constants are held to it, so a page that
gains a file, a channel, an outcome or a bound fails this engine's tests naming
the value rather than being discovered by an adapter that quietly ran a case
under the old one.

Each test says the wrong implementation it catches. None of them is "the two
strings are equal": every one of them would fail on an adapter that had been
left behind by an edit to the page, which is the only way these constants can go
wrong.
"""

import json
import re
import unittest

from openscript.adapter import page
from tests.support import SPEC

PAGE = (SPEC / "conformance.md").read_text(encoding="utf-8")


def section(start: str, end: str) -> str:
    """The text of one section, so a pattern cannot match in another one."""
    first = PAGE.index(start)
    return PAGE[first : PAGE.index(end, first + len(start))]


def first_row_cells(text: str) -> list:
    """The first backticked name in every table row of a piece of the page."""
    found = []
    for line in text.splitlines():
        match = re.match(r"^\|\s*`([^`]+)`\s*\|", line)
        if match is not None:
            found.append(match.group(1))
    return found


def fenced(text: str, language: str = "") -> str:
    """The first fenced block of a piece of the page."""
    opened = text.index(f"```{language}\n") + len(f"```{language}\n")
    return text[opened : text.index("```", opened)]


class CaseFiles(unittest.TestCase):
    """Catches an adapter that would read a file section 2's table stopped naming,
    or refuse one it started naming, which is a case run under different input
    from the engine next door."""

    def test_the_table_names_these_files(self):
        table = section("## 2. A case on disk", "### `case.json`")
        rows = [one for one in first_row_cells(table) if one != "File"]
        named = tuple(one for one in rows if "<" not in one)
        self.assertEqual(named, page.CASE_FILES)

    def test_the_table_names_a_secondary_series_with_a_name_in_it(self):
        table = section("## 2. A case on disk", "### `case.json`")
        patterned = [one for one in first_row_cells(table) if "<" in one]
        self.assertEqual(len(patterned), 1)
        spelled = patterned[0]
        self.assertTrue(spelled.startswith(page.SECONDARY_PREFIX))
        self.assertTrue(spelled.endswith(page.SECONDARY_SUFFIX))
        self.assertTrue(page.is_secondary("bars.1D.csv"))
        self.assertFalse(page.is_secondary("bars.csv"))


class Vocabularies(unittest.TestCase):
    """Catches an adapter that accepted a channel, an outcome or a profile the
    page does not list, or refused one it does."""

    def test_the_channels_a_case_may_assert(self):
        row = [
            line
            for line in section("### `case.json`", "## 3. How bars").splitlines()
            if line.startswith("| `asserts` |")
        ]
        self.assertEqual(len(row), 1)
        self.assertEqual(tuple(re.findall(r"`([a-zA-Z]+)`", row[0])[1:]), page.CHANNELS)

    def test_the_outcomes_a_case_result_may_carry(self):
        table = section("Outcomes:", "A failing run exits non-zero")
        rows = [one for one in first_row_cells(table) if one != "Outcome"]
        self.assertEqual(tuple(rows), page.OUTCOMES)

    def test_the_profiles_and_the_order_they_include_one_another_in(self):
        table = section("## 8. Profiles", "### What a profile cannot say")
        rows = [one for one in first_row_cells(table) if one != "Profile"]
        self.assertEqual(tuple(rows), page.PROFILES)


class Inputs(unittest.TestCase):
    """Catches an adapter reading a bars file by a header the page has changed, or
    running a case under instrument facts that are no longer section 3's."""

    def test_the_header_of_a_bars_file(self):
        block = fenced(section("### `bars.csv`", "### Instrument facts"))
        self.assertEqual(tuple(block.splitlines()[0].split(",")), page.BARS_HEADER)

    def test_the_default_instrument_facts(self):
        block = fenced(section("### Instrument facts", "### Secondary series"), "json")
        self.assertEqual(json.loads(block), page.DEFAULT_INSTRUMENT)

    def test_the_fields_of_a_backtest_file(self):
        block = fenced(section("### `backtest.json`", "### Where bars come from"), "json")
        self.assertEqual(tuple(sorted(json.loads(block))), tuple(sorted(page.BACKTEST_FIELDS)))

    def test_the_frame_fields_a_case_supplies(self):
        block = fenced(section("### frames.csv", "### `backtest.json`"))
        self.assertEqual(tuple(block.splitlines()[0].split(",")), page.FRAMES_HEADER)


class Bounds(unittest.TestCase):
    """Catches the failure section 6 exists to stop: a cap widened in one place.

    The page's own sentence says these two figures are read out of it by a test
    and held to the constants an engine carries, because the engine reads no
    page. This is that test for this engine."""

    def test_the_caps_a_declared_tolerance_is_held_to(self):
        sentence = section("### Declaring a tolerance", "### Everything that is not a number")
        found = re.search(r"caps a declared tolerance at `rel = ([^`]+)` and `abs = ([^`]+)`", sentence)
        self.assertIsNotNone(found)
        self.assertEqual(float(found.group(1)), page.TOLERANCE_CAP_REL)
        self.assertEqual(float(found.group(2)), page.TOLERANCE_CAP_ABS)

    def test_absence_is_written_the_one_way(self):
        sentence = section("### `expected.csv`", "### `expected.json`")
        self.assertIn(f"An absent value is written `{page.ABSENT_TEXT}`", sentence)


if __name__ == "__main__":
    unittest.main()
