"""The two version numbers, and the compatibility promise they carry.

Both numbers exist elsewhere and the package carries a copy, because a
distribution a host installs cannot read a specification that is not shipped
with it. A copy is only safe where a check holds it to the original, so the page
is read here by the same pattern the first engine's generator uses, and
``spec/format-history.json`` drives the list of tables a later minor added.

The history file is the input rather than a list of its own, so a version the
history gains is a case this test gains. A list here would be the third place the
same fact lives, and the third place is the one that goes stale.
"""

import json
import re
import unittest

from tests.support import SPEC

from openscript.verify_tables import ADDED_AT_MINOR, minor_of, supply_added_tables
from openscript.version import FORMAT, LANGUAGE_VERSIONS, format_major, format_minor

STATED = re.compile(r"compiled format version\s+([0-9]+(?:\.[0-9]+)*)", re.IGNORECASE)


def history():
    return json.loads((SPEC / "format-history.json").read_text(encoding="utf-8"))


def top_level(fields):
    """The tables a field path list names, which is its first segment."""
    return sorted({one.split(".")[0].split("[")[0] for one in fields})


class TheFormatVersionIsThePages(unittest.TestCase):
    def test_the_page_states_a_version_and_it_is_the_one_this_engine_declares(self):
        page = (SPEC / "compiled-program.md").read_text(encoding="utf-8")
        stated = STATED.search(page)
        self.assertIsNotNone(stated, msg="the page states no compiled format version")
        self.assertEqual(FORMAT, stated.group(1))

    def test_the_major_and_the_minor_are_read_off_it(self):
        self.assertEqual(format_major(), 1)
        self.assertEqual(format_minor(), 1)

    def test_the_history_records_the_version_this_engine_was_written_against(self):
        self.assertIn(FORMAT, [one["format"] for one in history()["versions"]])

    def test_the_language_versions_are_the_ones_the_library_has_semantics_for(self):
        self.assertEqual(LANGUAGE_VERSIONS, (1,))


class TheTablesALaterMinorAdded(unittest.TestCase):
    """Driven from the history file: a version it gains is a case this gains."""

    def setUp(self):
        self.versions = history()["versions"]
        self.added = {table: minor for table, minor in ADDED_AT_MINOR}

    def test_the_history_was_actually_read(self):
        self.assertGreater(len(self.versions), 1)

    def test_every_table_a_later_minor_defined_is_one_an_earlier_program_may_lack(self):
        for version in self.versions:
            major, minor = (int(one) for one in version["format"].split("."))
            if major != format_major() or minor == 0:
                continue
            for table in top_level(version["fields"]):
                with self.subTest(version=version["format"], table=table):
                    self.assertEqual(self.added.get(table), minor)

    def test_nothing_is_listed_as_added_that_no_version_added(self):
        defined = {}
        for version in self.versions:
            major, minor = (int(one) for one in version["format"].split("."))
            if major != format_major():
                continue
            for table in top_level(version["fields"]):
                defined[table] = minor
        for table, minor in ADDED_AT_MINOR:
            with self.subTest(table=table):
                self.assertEqual(defined.get(table), minor)

    def test_a_program_below_the_minor_is_given_the_empty_table_it_is_owed(self):
        built = {"openscript": {"format": "1.0", "language": 1}}
        supply_added_tables(built)
        for table, _minor in ADDED_AT_MINOR:
            self.assertEqual(built[table], [])

    def test_a_program_at_the_minor_is_given_nothing(self):
        # Section 2 says an empty table is written as an empty array and never
        # omitted, so its absence here is the defect check 1 exists for.
        built = {"openscript": {"format": FORMAT, "language": 1}}
        supply_added_tables(built)
        for table, _minor in ADDED_AT_MINOR:
            self.assertNotIn(table, built)

    def test_the_minor_is_read_off_the_version_the_program_carries(self):
        self.assertEqual(minor_of({"openscript": {"format": "1.4"}}), 4)
        self.assertEqual(minor_of({"openscript": {"format": "1"}}), 0)


class TheOpcodeSetIsTheOneTheHistoryRecords(unittest.TestCase):
    def test_the_first_version_defined_every_instruction_this_engine_has(self):
        from openscript.opcodes import TABLE

        first = next(one for one in history()["versions"] if one["format"] == "1.0")
        self.assertEqual(sorted(first["opcodes"]), sorted(TABLE))

    def test_no_later_minor_added_an_instruction(self):
        # A minor bump may not add an instruction, which is section 9.2's list
        # of what it may not do, and this is that sentence measured.
        for version in history()["versions"]:
            if version["format"] == "1.0":
                continue
            with self.subTest(version=version["format"]):
                self.assertEqual(version.get("opcodes", []), [])


if __name__ == "__main__":
    unittest.main()
