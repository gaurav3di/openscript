"""The regions, and the two questions a bar asks of each one.

Section 3.2's table has a row per region with its lifetime, what rolls back and
what a checkpoint holds, and the pieces below are the mechanisms those rows turn
into: a register that answers about bar 300 when asked about bar 300 whether or
not it still holds the entry, a cell that is uninitialised rather than absent
until ``CELL_INIT`` reaches it, and a ``live var`` that does not roll back.

The live cell is the one worth the machinery. It is the whole of ``language.md``
section 8.2, it is the one exception to the restore, and a script using it is not
reproducible by design, so an engine that rolled one back would quietly make it
reproducible and an engine that failed to roll back an ordinary cell would
quietly make every script not.
"""

import unittest

from tests import support
from tests.support import channel, program

from openscript.memory import Cells, Channels, Register, States
from openscript.run import load
from openscript.values import ABSENT

#: Two counters, one ordinary and one live, each raised by one every bar.
COUNTERS = [
    ["CELL_INIT", 0, 3],
    ["CONST", 3],
    ["STOREC", 0],
    ["CELL_INIT", 1, 6],
    ["CONST", 3],
    ["STOREC", 1],
    ["LOADC", 0],
    ["CONST", 4],
    ["ADD"],
    ["STOREC", 0],
    ["LOADC", 1],
    ["CONST", 4],
    ["ADD"],
    ["STOREC", 1],
    ["LOADC", 0],
    ["EMIT", 0],
    ["LOADC", 1],
    ["EMIT", 1],
    ["HALT"],
]


class ALiveCellDoesNotRollBack(unittest.TestCase):
    def setUp(self):
        built = program(
            COUNTERS,
            consts=support.RESERVED + [["n", 0], ["n", 1]],
            channels=[channel(0), channel(1)],
            cells=[
                {"id": 0, "kind": "var", "name": "counted"},
                {"id": 1, "kind": "live", "name": "seen"},
            ],
        )
        result = load(built)
        self.assertTrue(result.ok, msg=str(result.diagnostic))
        self.run = result.run

    def _bar(self, index, state):
        return self.run.execute_bar(index, support.flat(1.0, index), state, supplied=2)

    def test_both_count_the_same_while_every_bar_is_executed_once(self):
        self.assertEqual(self._bar(0, support.confirmed()).columns, [1.0, 1.0])
        self.assertEqual(self._bar(1, support.confirmed()).columns, [2.0, 2.0])

    def test_a_re_executed_bar_rolls_one_back_and_not_the_other(self):
        self._bar(0, support.confirmed())
        self.assertEqual(self._bar(1, support.moving()).columns, [2.0, 2.0])
        # The ordinary cell goes back to what bar 1 began with and is raised
        # again; the live one keeps what it has and is raised from there.
        self.assertEqual(self._bar(1, support.moving(2.0)).columns, [2.0, 3.0])
        self.assertEqual(self._bar(1, support.moving(3.0)).columns, [2.0, 4.0])

    def test_the_initialised_flag_rolls_back_with_its_cell(self):
        # A flag restored without its value, or a value without its flag, would
        # re-run the initialiser on a bar that had already passed it.
        self._bar(0, support.confirmed())
        self.assertEqual(self.run.cells.ready, [True, True])
        mark = self.run.checkpoint()
        self._bar(1, support.confirmed())
        self.run.restore(mark)
        self.assertEqual(self.run.cells.ready, [True, True])
        self.assertEqual(self.run.cells.values[0], 1.0)


class ARegisterAnswersAboutABarByItsNumber(unittest.TestCase):
    """Trimming moves the storage and does not move the bar numbering."""

    def _filled(self, count):
        register = Register()
        for at in range(count):
            register.current = float(at)
            register.close()
        return register

    def test_an_entry_is_read_back_by_the_bar_it_was_written_for(self):
        register = self._filled(5)
        self.assertEqual(register.at(0), 0.0)
        self.assertEqual(register.at(4), 4.0)
        self.assertEqual(register.length, 5)

    def test_a_trimmed_register_still_answers_by_the_bar_number(self):
        register = self._filled(10)
        register.trim(3)
        # Four entries kept: the depth, plus the bar just closed, because a read
        # at the depth itself is the last one the history rule does not refuse.
        self.assertEqual(len(register.history), 4)
        self.assertEqual(register.at(9), 9.0)
        self.assertEqual(register.at(6), 6.0)
        self.assertEqual(register.length, 10)

    def test_an_entry_that_was_trimmed_away_is_absent_rather_than_somebody_elses(self):
        register = self._filled(10)
        register.trim(3)
        self.assertIs(register.at(2), ABSENT)

    def test_truncating_drops_the_entries_a_re_execution_wrote(self):
        register = self._filled(5)
        register.truncate(3)
        self.assertEqual(register.length, 3)
        self.assertEqual(register.at(2), 2.0)
        self.assertIs(register.at(3), ABSENT)

    def test_truncating_a_trimmed_register_counts_from_the_bar_and_not_the_store(self):
        register = self._filled(10)
        register.trim(3)
        register.truncate(8)
        self.assertEqual(register.length, 8)
        self.assertEqual(register.at(7), 7.0)


class TheOtherRegions(unittest.TestCase):
    def test_a_cell_is_uninitialised_before_it_is_marked(self):
        cells = Cells(2)
        self.assertFalse(cells.initialised(0))
        self.assertIs(cells.read(0), ABSENT)
        cells.mark(0)
        self.assertTrue(cells.initialised(0))
        self.assertFalse(cells.initialised(1))

    def test_a_state_region_starts_empty_and_is_the_librarys_to_fill(self):
        states = States(2)
        self.assertEqual(states.region(0), {})
        states.region(0)["seen"] = 1
        self.assertEqual(states.region(1), {})

    def test_a_channel_is_absent_until_something_writes_it(self):
        channels = Channels(2)
        self.assertIs(channels.read(0), ABSENT)
        channels.write(0, 3.0)
        self.assertEqual(channels.read(0), 3.0)
        channels.clear()
        self.assertIs(channels.read(0), ABSENT)

    def test_a_negative_zero_does_not_survive_a_channel(self):
        import struct

        channels = Channels(1)
        channels.write(0, -0.0)
        self.assertEqual(struct.pack(">d", channels.read(0)).hex(), "0000000000000000")


class SharingSurvivesARestore(unittest.TestCase):
    """Two cells that held one array hold one array afterwards, section 6.2."""

    def test_a_restore_does_not_turn_one_array_into_two(self):
        built = program(
            [
                ["CELL_INIT", 0, 5],
                ["ARRAY", 0],
                ["STOREC", 0],
                ["LOADC", 0],
                ["STOREC", 1],
                ["HALT"],
            ],
            requires=["core.1", "arrays"],
            cells=[
                {"id": 0, "kind": "var", "name": "one"},
                {"id": 1, "kind": "var", "name": "other"},
            ],
        )
        result = load(built)
        self.assertTrue(result.ok, msg=str(result.diagnostic))
        run = result.run
        run.execute_bar(0, support.flat(1.0), support.confirmed())
        self.assertIs(run.cells.values[0], run.cells.values[1])
        mark = run.checkpoint()
        run.restore(mark)
        # A restore that deep copied each cell separately would leave two
        # arrays, and a push through one would stop being visible through the
        # other, which changes what the script computes.
        self.assertIs(run.cells.values[0], run.cells.values[1])


if __name__ == "__main__":
    unittest.main()
