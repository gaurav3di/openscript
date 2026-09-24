"""Drawing objects and grids, ``objects.py``, each against the first engine's rule.

Issue 0021 found this engine had no drawing objects and no grids. The cases under
``cases/draw``, ``cases/obj`` and ``cases/table`` hold what a finished run
leaves across both engines; this file holds what no case can reach, above all
the rollback of a re-executed bar, which the conformance adapter declines
because ``ticks.csv`` is not written down well enough to replay.

Each test names the wrong implementation it catches.
"""

import copy
import gc
import unittest

from openscript.arrays import Refused
from openscript.contracts import LibraryEntry
from openscript.objects import CALLS, Grid, Handle, Objects, clears_a_grid
from openscript.run import load
from openscript.values import ABSENT, ArrayValue
from openscript.verify import capabilities

from tests import support
from tests.support import POOL, Library, channel, program


def call(objects, name, *arguments, bar=0):
    return CALLS[(name, len(arguments))](objects, bar, list(arguments))


def label(objects, text="a", bar=0):
    return call(objects, "draw.label", 1.0, 2.0, text, ABSENT, ABSENT, "center", "", bar=bar)


class Roster(unittest.TestCase):
    def test_creation_order_is_kept_through_a_setter(self):
        # Catches a roster that moves a changed object to the end.
        objects = Objects(10)
        first, second = label(objects, "first"), label(objects, "second")
        call(objects, "draw.setText", first, "changed")
        texts = [style["text"] for _, _, style in objects.drawings()]
        self.assertEqual(texts, ["changed", "second"])
        self.assertIsNot(first, second)

    def test_a_setter_on_a_deleted_object_is_os4005_naming_the_bar(self):
        # Catches a setter that quietly does nothing on a deleted object.
        objects = Objects(10)
        held = label(objects)
        call(objects, "draw.delete", held, bar=3)
        with self.assertRaises(Refused) as raised:
            call(objects, "draw.setText", held, "late", bar=5)
        self.assertEqual(raised.exception.code, "OS4005")
        self.assertEqual(raised.exception.values["bar"], 3)

    def test_deleting_twice_and_an_absent_handle_do_nothing(self):
        # Catches an engine that refuses a second delete, or a setter given none.
        objects = Objects(10)
        held = label(objects)
        call(objects, "draw.delete", held, bar=1)
        call(objects, "draw.delete", held, bar=2)
        self.assertIs(call(objects, "draw.setText", ABSENT, "x"), ABSENT)
        self.assertEqual(objects.deleted[held], 1)

    def test_the_object_past_the_ceiling_is_os5010_and_nothing_is_dropped(self):
        # Catches a roster that drops the oldest to make room.
        objects = Objects(2)
        label(objects, "one")
        label(objects, "two")
        with self.assertRaises(Refused) as raised:
            label(objects, "three")
        self.assertEqual(raised.exception.code, "OS5010")
        self.assertEqual([s["text"] for _, _, s in objects.drawings()], ["one", "two"])

    def test_a_deleted_object_is_forgotten_once_no_handle_names_it(self):
        # Catches a record per deletion kept for the life of the chart.
        objects = Objects(10)
        held = label(objects)
        call(objects, "draw.delete", held)
        self.assertEqual(len(objects.deleted), 1)
        del held
        gc.collect()
        self.assertEqual(len(objects.deleted), 0)

    def test_a_handle_and_a_grid_copy_to_themselves(self):
        # Catches a checkpoint that turns one object into two, so == changes answer.
        handle, grid = Handle(0, "line"), Grid("t0", "A grid", 1, 1)
        copied = copy.deepcopy([handle, grid, handle])
        self.assertIs(copied[0], handle)
        self.assertIs(copied[2], handle)
        self.assertIs(copied[1], grid)

    def test_a_path_is_paired_over_the_longer_array_and_copied(self):
        # Catches a path cut to the shorter array, and one that tracks a later push.
        objects = Objects(10)
        times, prices = ArrayValue([1.0, 2.0, 3.0]), ArrayValue([10.0, "x"])
        call(objects, "draw.polyline", times, prices, ABSENT, 1.0, False, ABSENT, 0.12)
        times.elements.append(4.0)
        (_, anchors, _), = objects.drawings()
        self.assertEqual(anchors, [(1.0, 10.0), (2.0, ABSENT), (3.0, ABSENT)])


class Rollback(unittest.TestCase):
    def test_a_mark_restores_creation_and_deletion_alike(self):
        # Catches a deletion that survives a rollback, and a creation that does.
        objects = Objects(10)
        kept = label(objects, "kept")
        mark = objects.mark()
        call(objects, "draw.delete", kept, bar=1)
        label(objects, "made on the moving bar", bar=1)
        objects.restore(mark)
        self.assertEqual([s["text"] for _, _, s in objects.drawings()], ["kept"])
        self.assertIs(call(objects, "draw.setText", kept, "still alive"), ABSENT)

    def test_a_moving_bar_executed_three_times_leaves_one_label(self):
        # Catches a run that does not take the roster into its checkpoint: every
        # re-execution of the moving bar would add a label.
        entries = {
            "draw.label": LibraryEntry("draw.label", 7, False, "none"),
            "draw.count": LibraryEntry("draw.count", 0, False, "none"),
        }

        def body(name):
            return lambda arguments, state, context: CALLS[(name, len(arguments))](
                context.objects, context.bar_index, arguments
            )

        library = Library(entries, {name: body(name) for name in entries})
        pushes = [["CONST", 4], ["CONST", 5], ["CONST", 8], ["CONST", 0], ["CONST", 0], ["CONST", 9], ["CONST", 9]]
        built = program(
            pushes + [["CALL_LIB", 0, 7, -1], ["POP"], ["CALL_LIB", 1, 0, -1], ["EMIT", 0], ["HALT"]],
            consts=list(POOL),
            channels=[channel(0)],
            requires=["core.1", "objects"],
            lib={"manifest": 1, "functions": [
                {"name": "draw.label", "arity": 7, "state": False, "effect": "none"},
                {"name": "draw.count", "arity": 0, "state": False, "effect": "none"},
            ]},
        )
        result = load(built, {}, library, capabilities=capabilities("objects"))
        self.assertTrue(result.ok, msg=str(result.diagnostic))
        run = result.run
        run.execute_bar(0, support.flat(1.0, 0), support.confirmed())
        counts = [run.execute_bar(1, support.flat(1.0, 1), support.moving()).columns[0] for _ in range(3)]
        self.assertEqual(counts, [2.0, 2.0, 2.0])
        self.assertEqual(len(run.objects.drawings()), 2)


class Grids(unittest.TestCase):
    def test_a_cell_outside_the_grid_is_os4008_and_a_bad_row_os4003(self):
        # Catches a clamp, and a row read as absence when it is not whole.
        grid = Grid("t0", "A grid", 2, 1)
        with self.assertRaises(Refused) as raised:
            call(Objects(1), "cell", grid, 2.0, 0.0, "x", ABSENT, ABSENT, "left")
        self.assertEqual(raised.exception.code, "OS4008")
        for row in (-1.0, 0.5, "0"):
            with self.assertRaises(Refused) as raised:
                call(Objects(1), "cell", grid, row, 0.0, "x", ABSENT, ABSENT, "left")
            self.assertEqual(raised.exception.code, "OS4003")

    def test_an_absent_row_writes_nothing_and_clear_empties(self):
        # Catches an absent row written as row zero, and a clear that misses a grid.
        grid = Grid("t0", "A grid", 2, 2)
        call(Objects(1), "cell", grid, ABSENT, 0.0, "x", ABSENT, ABSENT, "left")
        self.assertEqual(grid.cells, [])
        call(Objects(1), "cell", grid, 1.0, 1.0, "y", ABSENT, ABSENT, "right")
        self.assertEqual(grid.cells, [(1, 1, "y", ABSENT, ABSENT, "right")])
        self.assertTrue(clears_a_grid([grid]))
        self.assertEqual(grid.cells, [])
        self.assertFalse(clears_a_grid([ArrayValue([1.0])]))


if __name__ == "__main__":
    unittest.main()
