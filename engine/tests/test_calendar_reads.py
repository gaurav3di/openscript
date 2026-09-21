"""The call sites of `stdlib.md` 12.2, 12.4 and 12.5: the manifest, and what absence does.

Two kinds of test, and the first is the one that would have caught the whole
family being written from memory. **The manifest is read out of the page.**
Section 12.2 prints one row per call with its parameters on it, and 12.4 does the
same for the session namespace, so the names and the argument counts this engine
answers are compared against those rows rather than typed again beside them: a
call the page has and this engine has not is a program refused at load, and a
call this engine holds under the wrong argument count is a manifest disagreement
at load (`compiled-program.md` section 2.5). Both are things a reader of the page
would expect to work.

The second kind is absence. `stdlib.md` section 2.4 makes absence the library's
answer to anything it cannot compute, and the calls here have four ways to reach
it that a numeric function does not have: an absent timestamp, a host that stated
no timezone, a zone this engine cannot read, and a field that is not a whole
number. Each of them is a bar drawn with a gap in it rather than a wrong date, and
each is held below.
"""

import re
import unittest

from tests.support import SPEC

from openscript import dates, zones
from openscript.civil import Civil, instant_at

#: 2024-03-09T04:05:06Z, a Saturday in the tenth week of the year and the sixty
#: ninth day of it, so that no two fields of the reading share a value and a
#: swapped pair is visible in the answer rather than in a comment.
AT = float(instant_at(Civil(2024, 3, 9, 4, 5, 6)))

UTC = "UTC"


class Bar:
    """What a stateless call may ask its caller for, with the two facts these use."""

    def __init__(self, time=None, timezone=UTC):
        self._time = time
        self._timezone = timezone

    def bar(self, fact):
        return self._time if fact == dates.BAR_TIME else None

    def host(self, fact):
        return self._timezone if fact == "timezone" else None


def call(name, *arguments, on=None):
    """One library call, dispatched the way the machine dispatches one."""
    entry = dates.table()[(name, len(arguments))]
    return entry.call(on if on is not None else Bar(), list(arguments))


def page_rows(heading: str, until: str):
    """The call signatures one section of the page prints, and which are planned."""
    text = (SPEC / "stdlib.md").read_text(encoding="utf-8")
    block = text[text.index(heading) : text.index(until)]
    found = {}
    for line in block.split("\n"):
        held = re.match(r"^\| `([A-Za-z.]+)(\(([^`]*)\))?`( \(planned\))?", line)
        if held is None:
            continue
        written = held.group(3)
        arity = 0 if written is None or written.strip() == "" else len(written.split(","))
        found[held.group(1)] = (arity, held.group(4) is not None)
    return found


class TheManifestAgainstThePage(unittest.TestCase):
    """The names and argument counts, read from `stdlib.md` rather than restated."""

    def calls_on_the_page(self):
        held = page_rows("### 12.2 The `date` namespace", "### 12.3 The format pattern")
        held.update(page_rows("### 12.4 The `session` namespace", "### 12.5 The session window"))
        return held

    def test_every_call_the_page_prints_is_in_the_manifest_with_its_own_arity(self):
        # Catches a call left out, which a program reaches as OS6004 at load, and
        # a call held under the wrong count, which is a manifest disagreement on
        # a program the first engine compiled and this engine refuses.
        table = dates.table()
        # The two facts of the namespace are derived from the record rather than
        # computed from arguments, so they are the fact seam's rows and not this
        # module's. Everything else on those two tables is here.
        elsewhere = {"session.isFirstBar", "session.isLastBar"}
        for name, (arity, planned) in self.calls_on_the_page().items():
            if planned or name in elsewhere:
                self.assertNotIn(name, {held for held, _ in table}, msg=name)
                continue
            self.assertIn((name, arity), table, msg=f"{name} with {arity} arguments")

    def test_the_manifest_holds_nothing_the_page_does_not_print(self):
        # The other direction, which is what stops a call being invented here:
        # a name this engine answers and no page has is a name the first engine
        # refuses, and the two engines disagree about whether a program loads.
        printed = self.calls_on_the_page()
        for name, _ in dates.table():
            self.assertIn(name, printed, msg=name)

    def test_every_row_holds_no_state_and_has_no_effect(self):
        # Section 2.5's other two fields, which the load-time check holds a
        # program's own table to. Catches a row copied from the stateful half,
        # under which the machine would hand the call a state region it never
        # reads and the checkpoint would carry it from bar to bar.
        for entry in dates.ENTRIES:
            self.assertFalse(entry.state, msg=entry.name)
            self.assertEqual(entry.effect, "none", msg=entry.name)

    def test_the_names_a_caller_asks_about_are_the_names_the_table_holds(self):
        # A caller declines a case whose record names a zone this engine cannot
        # read and whose program reaches the calendar, and it asks with this set.
        # Catches a set kept by hand beside the table, which is how a call added
        # later gets answered under the wrong calendar and agrees with the first
        # engine for half the year.
        self.assertEqual(dates.NAMES, {name for name, _ in dates.table()})

    def test_the_page_prints_the_calls_this_reads(self):
        # The reader above is a pattern over a document, so it is held to a count:
        # a page whose table stopped matching would otherwise leave every
        # assertion above vacuously true, which is the failure mode of every test
        # that reads its own input.
        self.assertEqual(len(self.calls_on_the_page()), 16 + 9)


class TheNineFields(unittest.TestCase):
    """12.2's table, read in the zone the host stated."""

    def test_each_read_answers_its_own_field(self):
        # Catches a table wired to the wrong field, which is invisible in any
        # test whose fixture has two fields sharing a value.
        self.assertEqual(call("date.year", AT, UTC), 2024)
        self.assertEqual(call("date.month", AT, UTC), 3)
        self.assertEqual(call("date.day", AT, UTC), 9)
        self.assertEqual(call("date.hour", AT, UTC), 4)
        self.assertEqual(call("date.minute", AT, UTC), 5)
        self.assertEqual(call("date.second", AT, UTC), 6)
        self.assertEqual(call("date.dayOfWeek", AT, UTC), 6)
        self.assertEqual(call("date.dayOfYear", AT, UTC), 69)
        self.assertEqual(call("date.weekOfYear", AT, UTC), 10)

    def test_a_field_comes_back_as_a_number_and_not_as_a_whole_number(self):
        # Every value this engine holds is a binary64, which is what the machine
        # stores and what a channel carries out.
        self.assertIsInstance(call("date.year", AT, UTC), float)


class TheZoneACallReadsIn(unittest.TestCase):
    """12.1: the chart's, unless an argument names another."""

    def test_a_call_given_no_zone_reads_the_charts(self):
        # The compiler fills the default with a read of chart.timezone, so this
        # is what arrives; catches an engine defaulting to UTC of its own accord,
        # which would disagree with the labels on the chart's own axis.
        self.assertEqual(call("date.hour", AT, UTC, on=Bar(timezone=UTC)), 4)

    def test_a_call_given_an_absent_zone_falls_back_to_the_charts(self):
        # A script that writes none, or a computed zone that was absent on this
        # bar. Catches an engine that reads an absent argument as a zone, which
        # answers absence where the first engine answers the chart's own reading.
        self.assertEqual(call("date.hour", AT, None, on=Bar(timezone=UTC)), 4)

    def test_a_host_that_states_no_timezone_leaves_every_call_absent(self):
        # 4.1's own column, and 12.1's reason: a chart with no axis to read has
        # none. Catches a fallback to UTC, which is a zone nobody chose and looks
        # right for a third of the world.
        for name in ("date.year", "date.startOfDay"):
            self.assertIsNone(call(name, AT, None, on=Bar(timezone=None)), msg=name)

    def test_a_zone_this_engine_cannot_read_is_never_answered_under_another(self):
        # The whole of the decision in zones.py: a well formed name whose offsets
        # this engine does not hold is declined, and the caller reports the case
        # unsupported. Catches an engine that reads it as UTC, which agrees with
        # the first engine for half the year and by luck.
        self.assertIsNone(call("date.hour", AT, "Europe/Paris"))
        self.assertIsNone(call("date.hour", AT, "Europe/Paris", on=Bar(timezone="Europe/Paris")))

    def test_a_name_that_is_not_a_zone_is_told_apart_from_one_this_engine_lacks(self):
        # 12.2 applies the shape rule before any database: an abbreviation is
        # ambiguous and is refused on every engine, and a well formed name this
        # engine cannot read is this engine's limit. Catches the two being one
        # answer, under which a caller cannot tell a case it must decline from a
        # script that is wrong on every engine.
        self.assertTrue(zones.named("Europe/Paris"))
        self.assertTrue(zones.named(UTC))
        for written in ("EST", "+05:30", "GMT+1", "", "Europe/"):
            self.assertFalse(zones.named(written), msg=written)
        self.assertFalse(zones.readable("Europe/Paris"))


class TheThreeBoundaries(unittest.TestCase):
    """12.2's ``startOfDay``, ``startOfWeek`` and ``startOfMonth``."""

    def reading(self, name):
        return dates.rendered(call(name, AT, UTC), "yyyy-MM-dd HH:mm:ss", UTC)

    def test_each_boundary_rounds_back_to_its_own_midnight(self):
        # The Saturday goes back five days to its Monday, not forward two to the
        # next one and not back six to a Sunday. Catches a week that starts on
        # Sunday, which moves every weekly rule in the language by a day.
        self.assertEqual(self.reading("date.startOfDay"), "2024-03-09 00:00:00")
        self.assertEqual(self.reading("date.startOfWeek"), "2024-03-04 00:00:00")
        self.assertEqual(self.reading("date.startOfMonth"), "2024-03-01 00:00:00")

    def test_a_monday_is_its_own_start_of_week(self):
        # The edge the arithmetic gets wrong in the other direction, where a
        # Monday is sent back a whole week.
        monday = float(instant_at(Civil(2024, 3, 4, 9, 15, 0)))
        self.assertEqual(call("date.startOfWeek", monday, UTC), float(instant_at(Civil(2024, 3, 4, 0, 0, 0))))

    def test_a_boundary_of_an_absent_instant_is_absent(self):
        self.assertIsNone(call("date.startOfDay", None, UTC))


class TheInstantBuiltFromFields(unittest.TestCase):
    """12.2's ``date.from``, which is the one call that goes the other way."""

    def built(self, *fields):
        return call("date.from", *fields, UTC)

    def test_a_date_and_a_time_become_the_instant_they_name(self):
        self.assertEqual(self.built(2024, 3, 9, 4, 5, 6), AT)

    def test_an_absent_hour_is_midnight_and_an_absent_day_is_no_date_at_all(self):
        # The three date fields and the three clock fields are not the same kind
        # of argument: one has a default the page prints and the other does not.
        # Catches an engine that reads an absent year as year zero, which draws a
        # date two thousand years off rather than nothing.
        self.assertEqual(self.built(2024, 3, 9, None, None, None), float(instant_at(Civil(2024, 3, 9, 0, 0, 0))))
        for absent in (0, 1, 2):
            fields = [2024, 3, 9, 0, 0, 0]
            fields[absent] = None
            self.assertIsNone(self.built(*fields), msg=str(absent))

    def test_a_field_that_is_not_a_whole_number_is_absent_rather_than_rounded(self):
        # Section 2.5's rule about a count, read onto a calendar field: a day of
        # 14.5 is a bug in the script, and rounding it hides the bug.
        self.assertIsNone(self.built(2024, 3, 9.5, 0, 0, 0))

    def test_a_year_no_instant_could_hold_is_absent_and_not_a_failure(self):
        # A year a script computed can be a number with three hundred digits in
        # it. The first engine answers absence there, because its date type has
        # no reading to give, and this package raises nothing, so the magnitude
        # is compared as a whole number. Catches a comparison written by
        # converting to a binary64 first, which raises on the way in and stops a
        # bar the other engine drew a gap on.
        self.assertIsNone(self.built(1e300, 1, 1, 0, 0, 0))
        self.assertEqual(call("date.year", 1e300, UTC), None)

    def test_a_host_with_no_timezone_builds_no_instant(self):
        # A wall clock reading is not an instant until a zone is applied, and a
        # record that states none has no zone to apply.
        self.assertIsNone(
            call("date.from", 2024, 3, 9, 0, 0, 0, None, on=Bar(timezone=None))
        )


class TheSameDayTest(unittest.TestCase):
    """12.2's ``date.isSameDay``, which is a bool and never a number."""

    def test_two_readings_of_one_day_are_the_same_day(self):
        later = AT + 3_600_000 * 6
        self.assertIs(call("date.isSameDay", AT, later, UTC), True)

    def test_a_reading_the_next_day_is_not(self):
        # Catches a comparison written on the instants rather than on the fields,
        # which answers true for any two readings less than a day apart.
        self.assertIs(call("date.isSameDay", AT, AT + 86_400_000, UTC), False)

    def test_an_absent_side_is_absent_and_not_false(self):
        # Absence is not falsehood, language.md 6.6, and a study testing this
        # would take the wrong branch through its whole warmup.
        self.assertIsNone(call("date.isSameDay", AT, None, UTC))
