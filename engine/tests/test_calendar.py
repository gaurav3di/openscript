"""The calendar arithmetic of `stdlib.md` 12.2 and 12.3, against a reference nobody here wrote.

`conformance.md` section 4 sets the bar for a library number: the expected values
"must also agree with an independently written reference implementation of the
same function", because "a function that only agrees with itself has been tested
for stability, not for correctness". There is no vector file for the calendar,
because ``spec/vectors/library`` holds the functions a bar series can be walked
through and a calendar needs an instant and a zone instead. So the reference is
the interpreter's own date library, which was written by other people from the
same civil calendar: it is not imported by the engine (``civil.py`` says why),
and it is exactly what an independent reference is supposed to be.

**Where the reference cannot follow, the test does not stop.** That library holds
a year to the range 1 to 9999 and raises outside it, and the language's
timestamps are not held to anything of the kind. The two classes below are
divided on that line: one measures agreement where there is something to agree
with, and the other measures the instants the reference refuses, which is where
an engine that had been built on it would stop a bar.
"""

import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from openscript import civil, dates
from openscript.civil import Civil

#: Where the shipped package lives, for the one test that reads it rather than
#: runs it.
PACKAGE = Path(__file__).resolve().parent.parent / "openscript"

EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)

#: The day number of 1970-01-01 on the reference's own counting, so that the two
#: origins can be compared without either being adjusted by hand twice.
EPOCH_ORDINAL = date(1970, 1, 1).toordinal()


def reference_fields(instant: int) -> Civil:
    """The reference's reading of a whole millisecond count, in UTC."""
    at = EPOCH + timedelta(milliseconds=instant)
    return Civil(at.year, at.month, at.day, at.hour, at.minute, at.second)


#: A spread of instants: the epoch, a leap day, the turn of a century, a negative
#: one, and the awkward seconds either side of midnight.
SAMPLES = (
    0,
    1,
    -1,
    86_399_999,
    86_400_000,
    -86_400_000,
    951_782_400_000,  # 2000-02-29
    1_735_689_600_000,  # 2025-01-01
    -2_208_988_800_000,  # 1900-01-01, which is not a leap year
    4_102_444_800_000,  # 2100-01-01, which is not one either
)


class TheCivilArithmetic(unittest.TestCase):
    """``civil.py`` against the interpreter's own calendar."""

    def test_a_day_number_counts_the_same_days_the_reference_counts(self):
        # Catches the classic off-by-one in the era shifted formula, which is
        # right for most of a year and wrong across a leap day: every calendar
        # field of every bar after the first of March would move by a day.
        for ordinal in range(date(1, 1, 1).toordinal(), date(2400, 1, 1).toordinal(), 37):
            held = date.fromordinal(ordinal)
            self.assertEqual(
                civil.day_number(held.year, held.month, held.day),
                ordinal - EPOCH_ORDINAL,
                msg=str(held),
            )

    def test_the_inverse_is_exact_on_every_day_it_is_tried(self):
        # Catches an inverse that agrees with the forward direction only where
        # the two were tested together, which is what an iterative one does at
        # the ends of a century.
        for days in range(-800_000, 800_000, 997):
            self.assertEqual(
                civil.day_number(*civil.date_of_day(days)), days, msg=str(days)
            )

    def test_the_week_starts_on_monday_and_the_year_starts_on_a_thursday(self):
        # Two rules in one sentence of 12.2, and the year turn is where they part
        # company with the other common reading. Catches Sunday numbered as 1,
        # which splits a trading week across the ends of the range, and a week
        # counted from the first of January, which differs by a whole week at the
        # turn of most years.
        for ordinal in range(date(1990, 12, 20).toordinal(), date(2030, 1, 10).toordinal()):
            held = date.fromordinal(ordinal)
            days = civil.day_number(held.year, held.month, held.day)
            self.assertEqual(civil.weekday_of_day(days), held.isoweekday(), msg=str(held))
            self.assertEqual(
                civil.week_of_year_of(held.year, held.month, held.day),
                held.isocalendar()[1],
                msg=str(held),
            )
            self.assertEqual(
                civil.day_of_year_of(held.year, held.month, held.day),
                held.timetuple().tm_yday,
                msg=str(held),
            )

    def test_a_reading_of_an_instant_agrees_with_the_reference_on_every_field(self):
        # Catches a reading built by dividing a negative instant towards zero,
        # which puts every bar before the epoch on the day after the one that
        # holds it, and the hour of that bar an hour out.
        for instant in SAMPLES:
            self.assertEqual(civil.fields_at(instant), reference_fields(instant), msg=str(instant))
        for step in range(-4000, 4000, 7):
            instant = step * 3_600_007
            self.assertEqual(civil.fields_at(instant), reference_fields(instant), msg=str(instant))

    def test_an_instant_built_from_fields_is_the_instant_it_reads_back_as(self):
        # The round trip in the other direction, which is what date.from is.
        for instant in SAMPLES:
            fields = civil.fields_at(instant)
            self.assertEqual(civil.instant_at(fields), instant - instant % 1000, msg=str(instant))

    def test_every_field_of_a_built_instant_carries(self):
        # The first engine builds date.from on a date object whose setters carry,
        # so a month of 13 is January of the next year and an hour of 25 is one
        # in the morning of the next day. Catches an engine that refused an out of
        # range field, which would answer absence where the first answers an
        # instant, and section 6 compares absence for presence.
        carried = (
            (Civil(2024, 13, 1, 0, 0, 0), Civil(2025, 1, 1, 0, 0, 0)),
            (Civil(2024, 0, 1, 0, 0, 0), Civil(2023, 12, 1, 0, 0, 0)),
            (Civil(2024, 1, 32, 0, 0, 0), Civil(2024, 2, 1, 0, 0, 0)),
            (Civil(2024, 3, 1, 25, 0, 0), Civil(2024, 3, 2, 1, 0, 0)),
            (Civil(2024, 3, 1, 0, -1, 0), Civil(2024, 2, 29, 23, 59, 0)),
        )
        for written, meant in carried:
            self.assertEqual(
                civil.fields_at(civil.instant_at(written)), meant, msg=str(written)
            )


class TheEndsOfTheCalendar(unittest.TestCase):
    """The instants the reference refuses, which are instants the language has."""

    def test_a_year_outside_the_reference_range_is_still_answered(self):
        # This is the test that would have caught an engine built on the
        # interpreter's own date type: it raises outside year 1 to 9999, and a
        # raise inside a library call stops a bar over a number language.md 5.1
        # says is an ordinary number.
        with self.assertRaises(OverflowError):
            EPOCH + timedelta(milliseconds=400_000_000_000_000)
        self.assertEqual(civil.fields_at(400_000_000_000_000), Civil(14645, 6, 30, 15, 6, 40))
        self.assertEqual(civil.fields_at(-80_000_000_000_000), Civil(-566, 11, 26, 1, 46, 40))

    def test_a_timestamp_is_truncated_towards_zero_before_it_is_read(self):
        # What the first engine's date reader does with a fraction. Catches a
        # floor, which reads a negative fractional millisecond as the millisecond
        # before it, and one bar an aeon would differ.
        self.assertEqual(civil.whole_instant(1.9), 1)
        self.assertEqual(civil.whole_instant(-1.9), -1)

    def test_an_instant_past_the_largest_one_has_no_fields_at_all(self):
        # The first engine's reader has no fields past this magnitude, so a call
        # there is absent. Catches an engine that answers a year, which would be
        # a value where the other engine has none, and absence is never inside a
        # tolerance.
        self.assertEqual(civil.whole_instant(civil.MAX_INSTANT), int(civil.MAX_INSTANT))
        self.assertIsNone(civil.whole_instant(civil.MAX_INSTANT + 1e3))
        self.assertIsNone(civil.whole_instant(float("inf")))


def counted_days(year: int, month: int, day: int) -> int:
    """Days from 1970-01-01, counted a year and a month at a time.

    A second reference, and deliberately the slow one: it is a different
    algorithm rather than the same closed formula written twice, so it agrees
    with ``civil.py`` only where both are right. The interpreter's own calendar
    cannot be asked here, because the dates this is for are outside its range,
    and that is exactly the region where the published form of the closed formula
    goes wrong on a language whose division floors.
    """
    leap = lambda one: one % 4 == 0 and (one % 100 != 0 or one % 400 == 0)
    total = 0
    if year >= 1970:
        for one in range(1970, year):
            total += 366 if leap(one) else 365
    else:
        for one in range(year, 1970):
            total -= 366 if leap(one) else 365
    lengths = (31, 29 if leap(year) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
    return total + sum(lengths[: month - 1]) + day - 1


class TheYearsBeforeTheCommonEra(unittest.TestCase):
    """Where the published algorithm is written for a division that truncates."""

    def test_a_date_before_the_common_era_is_the_date_the_counting_reaches(self):
        # The wrong implementation this catches is the one the first engine has
        # and this engine had for an hour: the era is computed as a floor
        # division of the year less 399, which is how the published form makes a
        # truncating division behave like a floor. Do both and every date before
        # the first of March in year -1 moves by a day. The two engines part
        # company at -62193657600000 and no case reaches it, which is why this is
        # reported rather than treated as agreement.
        for year in range(-1200, 40, 17):
            for month, day in ((1, 1), (2, 28), (3, 1), (12, 31)):
                self.assertEqual(
                    civil.day_number(year, month, day),
                    counted_days(year, month, day),
                    msg=f"{year}-{month}-{day}",
                )

    def test_the_inverse_agrees_with_the_counting_there_as_well(self):
        # A pair that is wrong in both directions round trips perfectly and
        # answers the wrong day, so the inverse is held to the second reference
        # rather than to its own forward direction.
        for days in range(-1_200_000, 0, 6_133):
            year, month, day = civil.date_of_day(days)
            self.assertEqual(counted_days(year, month, day), days, msg=str(days))


class ThePatternOfTwelveThree(unittest.TestCase):
    """12.3: a closed set of eight placeholders, and every other character copied."""

    #: 2024-03-09T04:05:06Z, a Saturday, so that every field differs from every
    #: other and a swapped pair is visible.
    AT = 1_709_957_106_000.0

    def rendered(self, pattern):
        return dates.rendered(self.AT, pattern, "UTC")

    def test_each_placeholder_renders_its_own_field(self):
        self.assertEqual(self.rendered("yyyy-MM-dd HH:mm:ss"), "2024-03-09 04:05:06")

    def test_the_longest_placeholder_at_a_position_wins(self):
        # Catches a scan that reads MM first and leaves a stray M behind, which
        # turns a month name into "03M" and does it only for the patterns a
        # reader writes for a chart label.
        self.assertEqual(self.rendered("MMM"), "Mar")
        self.assertEqual(self.rendered("EEE"), "Sat")
        self.assertEqual(self.rendered("MMMM"), "MarM")

    def test_every_other_character_is_copied_through(self):
        # The set is closed, so a letter that is not a placeholder is itself.
        self.assertEqual(self.rendered("[dd] of MMM, yyyy!"), "[09] of Mar, 2024!")
        self.assertEqual(self.rendered(""), "")

    def test_a_year_before_the_common_era_keeps_its_sign_outside_the_filling(self):
        # Catches padding that counts the minus sign as a digit, which would
        # write a four digit year as three digits and a sign.
        long_ago = float(civil.instant_at(Civil(-44, 3, 15, 0, 0, 0)))
        self.assertEqual(dates.rendered(long_ago, "yyyy-MM-dd", "UTC"), "-0044-03-15")

    def test_a_pattern_is_absent_where_the_reading_is(self):
        self.assertIsNone(dates.rendered(None, "yyyy", "UTC"))
        self.assertIsNone(dates.rendered(self.AT, None, "UTC"))
        self.assertIsNone(dates.rendered(self.AT, "yyyy", None))


class TheDatabaseThisEngineDoesNotCarry(unittest.TestCase):
    """The dependency rule, read rather than promised."""

    def test_the_shipped_package_imports_no_timezone_database(self):
        # The interpreter's own zone module is in the standard library and the
        # table behind it is not: where the operating system ships none, it falls
        # back to a separately installed package of the same data, which is a
        # dependency a host never accepted and which check-python.mjs cannot see,
        # because the import it reads is the interpreter's own. Catches the
        # afternoon somebody reaches for it to make one case pass.
        wanted = "zone" + "info"
        found = [
            str(one.relative_to(PACKAGE))
            for one in PACKAGE.rglob("*.py")
            if wanted in one.read_text(encoding="utf-8")
        ]
        self.assertEqual(found, [])
