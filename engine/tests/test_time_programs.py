"""A compiled program that reads the calendar and writes the log, run bar by bar.

The tests next door hold each function to the page one call at a time. This one
holds the wiring: a program whose library table names ``date.year`` and ``print``,
loaded, verified and walked by the real machine over real bars, with the values
coming out of a channel and the log coming out of step 9. Nothing here is a
double: the interpreter, the verifier, the budget and the seam are the shipped
ones.

**The seam below is the whole of what the conformance adapter still has to do.**
``Serving`` is the join between the library's tables and the machine's view of a
library, and it knows four tables: the two halves of the library, the chart and
position facts, and the order calls. The calendar is a fifth and the log is a
sixth, and this class is the twelve lines that add them. It is here rather than
in the adapter because the adapter is another stage's file; what it is doing is
stating the shape that change has to take, and measuring that the shape works.

Two facts the machine needs that only a caller can state are stated here as the
adapter states them: the bar facts before each execution, which now include the
bar's own time because ``session.isIn`` reads it, and the instrument record,
which carries the timezone every calendar call defaults to.
"""

import unittest
from typing import Any, Dict, Optional, Sequence

from tests import support
from tests.support import channel, program, register

from openscript import dates
from openscript.adapter.serving import Serving
from openscript.contracts import Bar, CallContext, LibraryEntry
from openscript.logbook import LOG_ENTRIES, PRINT, Logbook
from openscript.run import load
from openscript.verify import capabilities

#: The record a case states, ``host-interface.md`` 4.1, cut down to the facts a
#: calendar reads: the zone, and the volume flag every record must state.
INSTRUMENT = {"timezone": "UTC", "hasVolume": True}

#: 2024-03-09T04:05:06Z and the hour after it, so a year, a day and an hour are
#: all readable off the answers.
TIMES = (1_709_957_106_000.0, 1_709_960_706_000.0)


class Calendar(Serving):
    """``Serving`` with the calendar and the log beside its four tables."""

    def __init__(self) -> None:
        super().__init__()
        self._calendar = dates.table()

    def entry(self, name: str, arity: int) -> Optional[LibraryEntry]:
        held = self._calendar.get((name, arity))
        if held is not None:
            return LibraryEntry(held.name, held.arity, held.state, held.effect)
        return LOG_ENTRIES.get((name, arity)) or super().entry(name, arity)

    def call(self, name: str, arguments: Sequence[Any], state: Any, context: CallContext) -> Any:
        held = self._calendar.get((name, len(arguments)))
        if held is None:
            return super().call(name, list(arguments), state, context)
        self._context = context
        return held.call(self, list(arguments))


def row(name: str, arity: int, effect: str = "none") -> Dict[str, Any]:
    """One row of a program's own library table, section 2.5."""
    return {"name": name, "arity": arity, "state": False, "effect": effect}


def running(code, functions, **changed):
    """One program on the real engine, with the calendar and the log served."""
    listing = [list(one) for one in code]
    changed.setdefault("channels", [channel(0)])
    changed.setdefault("requires", support.tags_for(listing))
    built = program(listing, lib={"manifest": 1, "functions": list(functions)}, **changed)
    serving = Calendar()
    found = load(built, {}, serving, capabilities=capabilities())
    if not found.ok:
        raise AssertionError(f"the program was refused: {found.diagnostic}")
    return found.run, serving


def walk(run, serving, times=TIMES, log=None):
    """Every bar of a dataset, with the facts a caller states before each one."""
    columns = []
    for index, time in enumerate(times):
        bar = Bar(time=time, open=100.0, high=101.0, low=99.0, close=100.5)
        serving.at_bar({"time": time, "close": bar.close}, index == 0)
        found = run.execute_bar(
            index, bar, support.confirmed(), supplied=len(times), instrument=INSTRUMENT
        )
        if not found.ok:
            raise AssertionError(f"bar {index} failed: {found.diagnostic.code}")
        if log is not None:
            log.write(found.applied, index, time)
        columns.append(found.columns[0])
    return columns


class ACalendarCallInsideAProgram(unittest.TestCase):
    """``date.year(time)`` as the compiler emits it, run by the machine."""

    #: The compiler fills the zone default with a read of ``chart.timezone``,
    #: which is a library call of no arguments, so the program pushes the fact
    #: and then calls the calendar with two arguments.
    CODE = (
        ["SLOAD", 0],
        ["CALL_LIB", 1, 0, -1],
        ["CALL_LIB", 0, 2, -1],
        ["EMIT", 0],
        ["HALT"],
    )
    FUNCTIONS = (row("date.year", 2), row("chart.timezone", 0))

    def test_the_program_loads_and_every_bar_answers_its_own_calendar_year(self):
        # The load is half the test: section 2.5 checks every row of the
        # program's own library table against the engine's manifest, so a
        # calendar this engine did not serve would be OS6004 here rather than an
        # absent column later.
        run, serving = running(self.CODE, self.FUNCTIONS, series=[register(0, "time")])
        self.assertEqual(walk(run, serving), [2024.0, 2024.0])

    def test_a_host_that_states_no_timezone_leaves_the_column_absent(self):
        # The record is the case's and 4.1 makes the zone optional, so this is a
        # chart with no axis to read a calendar in. Catches an engine falling
        # back to UTC inside the run, which would answer a year on a record that
        # states none and pass every test written with a zone.
        run, serving = running(self.CODE, self.FUNCTIONS, series=[register(0, "time")])
        bar = Bar(time=TIMES[0], open=100.0, high=101.0, low=99.0, close=100.5)
        serving.at_bar({"time": TIMES[0]}, True)
        found = run.execute_bar(0, bar, support.confirmed(), supplied=1, instrument={})
        self.assertTrue(found.ok)
        self.assertIsNone(found.columns[0])

    def test_a_program_naming_a_planned_call_is_refused_at_load(self):
        # ``date.add`` is planned in 12.2, so it is in no manifest and a program
        # that calls it is refused by name. Catches a table that grew an entry
        # nobody wrote the arithmetic for, which would answer absence for ever.
        with self.assertRaises(AssertionError) as refused:
            running(self.CODE, (row("date.add", 4), row("chart.timezone", 0)))
        self.assertIn("OS6004", str(refused.exception))


class ThePrintEffect(unittest.TestCase):
    """14.3: a value written to the log, and nothing on the chart."""

    #: ``print(close)`` and then the plot of ``close``, which is the arrangement
    #: the claim is about: the same program with and without the call.
    WITH = (
        ["SLOAD", 0],
        ["CALL_LIB", 0, 1, -1],
        ["POP"],
        ["SLOAD", 0],
        ["EMIT", 0],
        ["HALT"],
    )
    WITHOUT = (["SLOAD", 0], ["EMIT", 0], ["HALT"])

    def test_logging_changes_no_value(self):
        # The claim feature-matrix.md makes for the log category, measured rather
        # than asserted in prose: the two programs differ by one call and their
        # columns are identical. Catches an engine that let the effect's own
        # answer reach the channel, which would publish absence on every bar.
        run, serving = running(self.WITH, (row(PRINT, 1, "log"),), series=[register(0, "close")])
        printing = walk(run, serving)
        run, serving = running(self.WITHOUT, (), series=[register(0, "close")])
        self.assertEqual(printing, walk(run, serving))

    def test_every_line_carries_its_bar_and_the_bars_own_time(self):
        # Section 7's example of a log case is a line carrying its bar index, and
        # feature-matrix.md adds the time, so both are on the line. Catches a log
        # that records the value alone, which cannot be matched to a bar by
        # anybody reading it afterwards.
        run, serving = running(self.WITH, (row(PRINT, 1, "log"),), series=[register(0, "close")])
        log = Logbook()
        walk(run, serving, log=log)
        self.assertEqual([one.bar for one in log.lines], [0, 1])
        self.assertEqual([one.time for one in log.lines], list(TIMES))
        self.assertEqual([one.value for one in log.lines], [100.5, 100.5])

    def test_a_moving_bar_that_is_not_decided_writes_nothing(self):
        # Step 9 applies the records of a bar the engine decided, so a print on a
        # still moving bar leaves nothing behind. Catches a log written at the
        # call rather than at step 9, which would write a line per tick and put
        # the rollback question of 14.3 in front of a user who never asked it.
        run, serving = running(self.WITH, (row(PRINT, 1, "log"),), series=[register(0, "close")])
        bar = Bar(time=TIMES[0], open=100.0, high=101.0, low=99.0, close=100.5)
        serving.at_bar({"time": TIMES[0], "close": 100.5}, True)
        found = run.execute_bar(0, bar, support.moving(), supplied=1, instrument=INSTRUMENT)
        log = Logbook()
        log.write(found.applied, 0, TIMES[0])
        self.assertEqual(log.lines, [])
