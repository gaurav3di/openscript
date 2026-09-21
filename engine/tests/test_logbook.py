"""The log stream of `stdlib.md` 14.3, and the two things a host is promised about it.

``print`` is one line of the library surface and three sentences of behaviour,
and the sentences are what is measured here: the call has an effect and so is
held to step 9 rather than performed where it is written; the entry carries the
bar it was written on; and the rate limit is the host's, with a dropped line
counted rather than swallowed.

The run through a real program is next door, in ``test_time_programs.py``, which
is where the first two are measured against the machine. What is here is the
book itself, including the one behaviour no program can reach from inside: a host
that sets a limit, and what it is told about what that cost.
"""

import unittest

from openscript.library import table as stateless_table
from openscript.logbook import LOG_ENTRIES, PRINT, Line, Logbook
from openscript.values import ABSENT


class Effect:
    """A record the machine left behind, in the shape step 9 hands one over."""

    def __init__(self, name, arguments=()):
        self.name = name
        self.arguments = list(arguments)


class TheManifestRow(unittest.TestCase):
    """Section 2.5's four fields for the one call of the log."""

    def test_print_takes_one_argument_and_carries_the_log_effect(self):
        # The effect is what makes the machine hold the call until step 9. Catches
        # a row written with no effect, under which print would run where it sits
        # and a moving bar would write a line per tick.
        held = LOG_ENTRIES[(PRINT, 1)]
        self.assertEqual((held.name, held.arity, held.state, held.effect), (PRINT, 1, False, "log"))

    def test_print_is_in_no_other_table(self):
        # A name in two tables is a name whose behaviour depends on which one the
        # seam asks first. The stateless half states outright that every entry in
        # it has no effect, so print cannot be there and be what it is.
        self.assertNotIn((PRINT, 1), stateless_table())

    def test_it_takes_no_extra_argument_for_the_names_a_script_wrote(self):
        # Section 4.10 gives an order call one argument more than the language
        # shows, because two of its defaults are absence itself. print has no
        # default to tell apart from a value that came out absent, so the count is
        # one. Catches a row copied from the order table, which is a manifest
        # disagreement at load on every program that prints.
        self.assertEqual(len(LOG_ENTRIES), 1)


class WhatABarLeavesBehind(unittest.TestCase):
    """The records step 9 applied, read into lines."""

    def test_a_line_is_written_for_each_print_in_the_order_the_bar_made_them(self):
        # A script printing a heading and then a row is a script whose two lines
        # are only useful in that order. Catches a log that sorts or groups.
        log = Logbook()
        log.write([Effect(PRINT, ["first"]), Effect(PRINT, ["second"])], 3, 1_000.0)
        self.assertEqual([one.value for one in log.lines], ["first", "second"])
        self.assertEqual([one.bar for one in log.lines], [3, 3])

    def test_a_record_that_is_not_a_print_is_not_a_line(self):
        # Step 9 hands over every effect the bar left, and an order is one of
        # them. Catches a log that records whatever it was given, which would put
        # a strategy's orders in the script's log and compare them twice.
        log = Logbook()
        log.write([Effect("buy", [1]), Effect(PRINT, ["here"])], 0, 1_000.0)
        self.assertEqual(log.lines, [Line(0, 1_000.0, "here")])

    def test_a_value_that_was_absent_is_an_absent_line_and_not_an_empty_one(self):
        # A script printing a value that has not warmed up wrote an absent line,
        # and the absence is the one thing the author is looking at the log for.
        log = Logbook()
        log.write([Effect(PRINT, [ABSENT])], 0, 1_000.0)
        self.assertEqual(log.lines, [Line(0, 1_000.0, ABSENT)])
        log.write([Effect(PRINT)], 1, 2_000.0)
        self.assertEqual(log.lines[1], Line(1, 2_000.0, ABSENT))


class TheHostsRateLimit(unittest.TestCase):
    """14.3: the host limits, and says how many it dropped."""

    def test_a_run_with_no_limit_keeps_every_line(self):
        # Every conformance run: a case fixes its input in files, and a limit the
        # suite did not state would be one engine's truncation and not another's.
        log = Logbook()
        for at in range(50):
            log.add(at, float(at), at)
        self.assertEqual(len(log.lines), 50)
        self.assertEqual(log.dropped, 0)

    def test_a_limit_keeps_the_first_lines_and_counts_what_it_dropped(self):
        # "a host that drops lines must say how many it dropped rather than
        # truncating silently". Catches a limit that keeps the newest lines,
        # which loses the start of the very sequence somebody was printing to
        # find, and one that drops without counting, which is the silence the
        # page refuses.
        log = Logbook(limit=2)
        for at in range(5):
            log.add(at, float(at), at)
        self.assertEqual([one.value for one in log.lines], [0, 1])
        self.assertEqual(log.dropped, 3)


class TheShapeOfALine(unittest.TestCase):
    """The one place a field name is chosen, because no page chooses one."""

    def test_a_row_carries_the_bar_index_the_time_and_the_value(self):
        # Section 4 says the channel is a list of flat objects and names no
        # fields; section 7's example says a line carries its bar index and
        # feature-matrix.md says it carries the bar's time. Catches a row that
        # grew a nested object, which section 4 does not allow, and a field
        # quietly renamed, which would move the disagreement to whoever writes
        # the first expected file.
        log = Logbook()
        log.write([Effect(PRINT, [12.5])], 7, 1_709_957_106_000.0)
        self.assertEqual(
            log.rows(), [{"barIndex": 7, "time": 1_709_957_106_000.0, "value": 12.5}]
        )
