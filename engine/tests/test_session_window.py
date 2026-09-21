"""One range of wall clock hours, read two ways: the record's session and the script's window.

``host-interface.md`` 4.3 states the instrument's session and `stdlib.md` 12.5
lets a script write its own, and the two are spelled differently on purpose: a
host writes ``"09:00"`` in a record and a script writes ``"0915-1530:12345"`` in
a call. Underneath they are one arithmetic (``hours.py``), and the last class here
is the test of that sentence: the same window written both ways holds the same
bars. Until it did, the two spellings could part company over midnight, which is
the one boundary no fixture written in the middle of a trading day reaches.

The rest is the arithmetic itself. An open that is inclusive and a close that is
exclusive, so two ranges written back to back cover every minute once; a window
whose end is before its start crossing midnight, which is what an overnight
session needs; and a day list read against the day the session opened on rather
than the day the reading falls on, which is what keeps a Friday night session one
session instead of two halves belonging to different days.
"""

import unittest

from openscript import dates, hours, intervals
from openscript.adapter.sessions import (
    Session,
    first_bars,
    last_bars,
    opening_day,
    session_from,
)
from openscript.adapter.spellings import Malformed
from openscript.civil import Civil, instant_at

#: A Monday, so that a day list of the working week is easy to read off a test.
MONDAY = instant_at(Civil(2024, 3, 4, 0, 0, 0))

HOUR = 3_600_000
MINUTE = 60_000

#: A wall clock time written in digits that are not the ten this file is written
#: in. The interpreter reads them as a number and the first engine's reader does
#: not, so the two engines would disagree about whether such a record loads. It is
#: built from its code points so that every byte of this file stays plain.
DIGITS_NO_CALENDAR_HOLDS = chr(0x669) + chr(0x669) + ":" + chr(0x660) + chr(0x660)

#: The window a suite's default instrument would state, as minutes from midnight.
MORNING = Session(9 * 60, 12 * 60, tuple(range(1, 8)))


def at(day: int, hour: int, minute: int = 0) -> int:
    """An instant on the day after the Monday above, at a wall clock reading."""
    return MONDAY + day * 24 * HOUR + hour * HOUR + minute * MINUTE


class TheEdgesOfARange(unittest.TestCase):
    """The open is inclusive and the close is exclusive."""

    def inside(self, hour, minute=0):
        return hours.standing_in(MORNING, _reading(at(0, hour, minute))).inside

    def test_a_bar_on_the_opening_minute_is_in_the_session(self):
        self.assertIs(self.inside(9), True)

    def test_a_bar_on_the_last_minute_before_the_close_is_still_in_it(self):
        self.assertIs(self.inside(11, 59), True)

    def test_a_bar_on_the_closing_minute_is_not(self):
        # Catches an inclusive close, under which two windows written back to
        # back both hold the minute between them and a session study fires twice
        # at the handover.
        self.assertIs(self.inside(12), False)

    def test_a_bar_a_minute_before_the_open_is_not(self):
        self.assertIs(self.inside(8, 59), False)

    def test_a_window_of_no_length_holds_nothing(self):
        # Catches a zero length range read as a whole day, which is what the
        # crossing midnight branch does to it if the equal case is not named.
        empty = Session(9 * 60, 9 * 60, tuple(range(1, 8)))
        self.assertEqual(first_bars([at(0, 9), at(0, 15)], empty), (False, False))


class AWindowThatCrossesMidnight(unittest.TestCase):
    """4.3: an end earlier than its start is read as an overnight session."""

    NIGHT = Session(22 * 60, 2 * 60, (1,))

    def test_the_evening_and_the_morning_are_one_session(self):
        # The day list names Monday alone, so the small hours of Tuesday belong
        # to it: they opened on Monday. Catches a list read against the reading's
        # own day, which drops half of every overnight session and keeps the
        # wrong half.
        times = [at(0, 22), at(0, 23), at(1, 0), at(1, 1)]
        self.assertEqual(first_bars(times, self.NIGHT), (True, False, False, False))

    def test_the_next_evening_is_a_different_session_and_not_this_one(self):
        # Tuesday evening is not on the list, so nothing opens; Catches an engine
        # that opens a session at midnight in the middle of a night.
        self.assertEqual(first_bars([at(1, 22)], self.NIGHT), (False,))

    def test_a_bar_in_the_middle_of_the_day_is_in_no_session(self):
        self.assertEqual(first_bars([at(0, 12)], self.NIGHT), (False,))


class TheLastBarOfTheSchedule(unittest.TestCase):
    """4.3's one fact that earns the session its place, and the interval it needs."""

    #: Nine to five on every day, and an hourly chart.
    DAY = Session(9 * 60, 17 * 60, tuple(range(1, 8)))
    TIMES = [at(0, hour) for hour in range(8, 18)]

    def test_the_bar_that_covers_the_close_is_the_last_one(self):
        # The 16:00 bar of an hourly chart is the bar that reaches 17:00.
        # Catches an engine that answers the bar at the close itself, which is
        # outside the session and arrives after everything a strategy needed to
        # do before it.
        held = last_bars(self.TIMES, self.DAY, "60")
        self.assertEqual([one for one, flag in zip(self.TIMES, held) if flag], [at(0, 16)])

    def test_it_is_true_even_when_the_feed_stopped_early(self):
        # The whole reason the field exists: the schedule is the host's and the
        # trading is the venue's. Catches an engine that answers the last bar it
        # was handed, which is the reading a live engine cannot make.
        stopped = [at(0, hour) for hour in range(9, 17)]
        held = last_bars(stopped, self.DAY, "60")
        self.assertEqual([one for one, flag in zip(stopped, held) if flag], [at(0, 16)])

    def test_a_longer_bar_reaches_the_close_sooner(self):
        # A four hour chart's 13:00 bar covers the close, and its 09:00 bar does
        # not. Catches a slot measured in a fixed number of minutes rather than in
        # the interval the host stated.
        times = [at(0, 9), at(0, 13)]
        self.assertEqual(last_bars(times, self.DAY, "4h"), (False, True))

    def test_an_interval_this_engine_cannot_read_leaves_the_fact_absent(self):
        # Without a bar's length there is no slot. Catches an engine that falls
        # back to the spacing of the bars, which the specification does not
        # promise is uniform.
        self.assertEqual(last_bars(self.TIMES, self.DAY, None), tuple(None for _ in self.TIMES))
        self.assertEqual(last_bars(self.TIMES, self.DAY, "half an hour"), tuple(None for _ in self.TIMES))

    def test_a_record_with_no_session_leaves_it_absent_as_well(self):
        self.assertEqual(last_bars(self.TIMES, None, "60"), tuple(None for _ in self.TIMES))


class TheIntervalString(unittest.TestCase):
    """15.2's spelling, and the one number the session facts take from it."""

    def test_a_bare_number_is_minutes_and_the_letters_are_case_sensitive(self):
        # 15.2 in one test: "60" and "1h" are the same interval, and "1M" is a
        # month while "1m" is a minute. Catches a reader that lower cases the
        # unit, which turns a monthly chart into a one minute one.
        self.assertEqual(intervals.bar_minutes_of("60"), 60)
        self.assertEqual(intervals.bar_minutes_of("1h"), 60)
        self.assertEqual(intervals.bar_minutes_of("1m"), 1)
        self.assertEqual(intervals.bar_minutes_of("1M"), 43200)
        self.assertEqual(intervals.bar_minutes_of("1D"), 1440)
        self.assertEqual(intervals.bar_minutes_of("1W"), 10080)

    def test_a_string_the_grammar_has_not_is_absent(self):
        for written in ("", "0", "m", "1s", "-5", "1.5h", "1 h", None, 60):
            self.assertIsNone(intervals.bar_minutes_of(written), msg=repr(written))


class TheWindowSpecOfTwelveFive(unittest.TestCase):
    """``"HHMM-HHMM"`` with an optional day list, and what a malformed one answers."""

    def test_the_grammar_is_the_one_the_page_prints(self):
        self.assertEqual(hours.window_of("0915-1530"), hours.Hours(555, 930, None))
        self.assertEqual(hours.window_of("0915-1530:12345"), hours.Hours(555, 930, (1, 2, 3, 4, 5)))
        self.assertEqual(hours.window_of("2200-2400"), hours.Hours(1320, 1440, None))

    def test_a_malformed_spec_is_absent_rather_than_a_refusal(self):
        # A literal is OS3008 at compile time, which is the checker's; a computed
        # one that is malformed is absence, because the alternative stops a chart
        # on a string the script built on one bar out of forty thousand.
        for written in ("0915", "915-1530", "0915-1530:0", "2500-2600", "0960-1000", "0915-1530:", ""):
            self.assertIsNone(hours.window_of(written), msg=repr(written))

    def test_a_clock_time_in_a_record_is_the_spelling_four_three_fixes(self):
        self.assertEqual(hours.clock_minutes("09:15"), 555)
        self.assertEqual(hours.clock_minutes("24:00"), 1440)
        for written in ("9:00", "24:30", "25:00", "0900", "09:60", None):
            self.assertIsNone(hours.clock_minutes(written), msg=repr(written))

    def test_a_record_written_in_digits_no_calendar_holds_is_refused(self):
        # The interpreter reads a string of eastern arabic digits as a number and
        # the first engine's own reader does not, so a record spelled in them
        # would be a session on one engine and a refusal on the other.
        with self.assertRaises(Malformed):
            session_from({"timezone": "UTC", "session": {"start": DIGITS_NO_CALENDAR_HOLDS, "end": "17:00", "days": [1]}})


class TheCallAScriptWrites(unittest.TestCase):
    """``session.isIn``, which reads the bar's own time and the script's window."""

    class Bar:
        def __init__(self, time):
            self._time = time

        def bar(self, fact):
            return self._time if fact == dates.BAR_TIME else None

        def host(self, fact):
            return "UTC" if fact == "timezone" else None

    def held(self, spec, time):
        entry = dates.table()[("session.isIn", 2)]
        return entry.call(self.Bar(time), [spec, "UTC"])

    def test_a_bar_inside_the_window_holds_and_one_outside_does_not(self):
        self.assertIs(self.held("0900-1200", at(0, 9)), True)
        self.assertIs(self.held("0900-1200", at(0, 12)), False)

    def test_a_day_list_is_read_against_the_day_the_window_opened(self):
        # Monday is 1, and the Tuesday bar is not in a Monday window.
        self.assertIs(self.held("0900-1200:1", at(0, 10)), True)
        self.assertIs(self.held("0900-1200:1", at(1, 10)), False)

    def test_a_bar_whose_time_the_caller_never_stated_is_absent(self):
        # The seam states the bar facts a call reads, and a fact it does not
        # state is absent rather than read from somewhere else. Catches a call
        # answering false, which is a window that holds no bar and says nothing.
        self.assertIsNone(self.held("0900-1200", None))

    def test_a_malformed_window_is_absent_and_not_false(self):
        self.assertIsNone(self.held("0900", at(0, 10)))


class TheTwoSpellingsOfOneWindow(unittest.TestCase):
    """The sentence ``hours.py`` exists for, made mechanical."""

    def test_a_record_and_a_script_window_hold_exactly_the_same_bars(self):
        # The record says 22:00 to 02:00 on Monday and the script says the same
        # thing in 12.5's spelling. Catches the two arithmetics drifting apart,
        # which they would do first over midnight and over which day the list is
        # read against, on the dataset nobody writes a fixture for.
        record = session_from(
            {"timezone": "UTC", "session": {"start": "22:00", "end": "02:00", "days": [1]}}
        )
        written = hours.window_of("2200-0200:1")
        self.assertEqual(record, written)
        entry = dates.table()[("session.isIn", 2)]
        answered = 0
        for day in range(0, 3):
            for hour in range(0, 24):
                time = at(day, hour)
                by_record = opening_day(time, record) is not None
                by_script = entry.call(TheCallAScriptWrites.Bar(time), ["2200-0200:1", "UTC"])
                self.assertIs(by_record, by_script, msg=f"day {day} hour {hour}")
                answered += 1 if by_record else 0
        # A test where both sides answered false everywhere would pass on two
        # windows that hold nothing, so the count of bars inside is asserted too.
        self.assertEqual(answered, 4)


def _reading(time):
    """The civil reading of an instant in the zone this engine reads."""
    from openscript.zones import READABLE, fields_in

    return fields_in(time, READABLE)
