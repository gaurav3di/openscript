"""The instructions that address a table, and the tables they address.

A register, an array, a loop and a call each need a program with something in it:
a series table, a capability tag, a loop table with a line in it, a function body
and a call site. So these cases build more than the ones in ``test_machine.py``
do, and each one is about the table as much as about the instruction.

The four wrong implementations this file is written against. A history read past
the start of the dataset clamped to the oldest bar instead of answering absence.
An array index outside the array answering absence instead of refusing, which is
the one place the language does refuse. A loop budget counted in anything but
``TICK`` executions, which would make two engines stop at different iterations. And
a call site's cell base ignored, which gives a stateful helper called from two
places one counter instead of two, and is the example ``language.md`` section
11.4 uses to explain why state is per call site at all.
"""

import unittest

from tests import support
from tests.support import Library, POOL, answer, channel, program, refusal, register, run_one

from openscript.contracts import LibraryEntry
from openscript.run import load
from openscript.values import ABSENT, ArrayValue
from openscript.verify import capabilities


class Series(unittest.TestCase):
    """``HIST`` resolved in the order section 4.4 gives, case by case."""

    def _over(self, closes, back, retained=None, bars=None):
        built = program(
            [["CONST", back], ["HIST", 0], ["EMIT", 0], ["HALT"]],
            consts=list(POOL),
            channels=[channel(0)],
            series=[register(0, "close")],
            limits={"loops": 2000000, "history": retained},
        )
        result = load(built, {}, None, capabilities=capabilities())
        self.assertTrue(result.ok, msg=str(result.diagnostic))
        out = None
        for at, close in enumerate(closes):
            out = result.run.execute_bar(
                at, support.flat(close, at), support.confirmed(), supplied=len(closes)
            )
        return out

    def test_offset_zero_is_this_bar(self):
        self.assertEqual(self._over([10.0, 20.0, 30.0], 3).columns[0], 30.0)

    def test_an_offset_reaches_back(self):
        self.assertEqual(self._over([10.0, 20.0, 30.0], 5).columns[0], 10.0)

    def test_an_absent_offset_is_absent(self):
        self.assertIs(self._over([10.0, 20.0], 0).columns[0], ABSENT)

    def test_an_offset_past_the_start_of_the_dataset_is_absent(self):
        # Absent, not clamped and not zero: the value never existed.
        self.assertIs(self._over([10.0, 20.0], 7).columns[0], ABSENT)

    def test_a_negative_offset_is_refused(self):
        out = self._over([10.0, 20.0], 11)
        self.assertFalse(out.ok)
        self.assertEqual(out.diagnostic.code, "OS4001")

    def test_an_offset_past_the_retained_depth_is_refused(self):
        # Different from an offset past the start of the dataset on purpose: in
        # one the value never existed, in the other the engine threw it away.
        closes = [float(one) for one in range(20)]
        out = self._over(closes, 12, retained=4)
        self.assertFalse(out.ok)
        self.assertEqual(out.diagnostic.code, "OS4002")
        self.assertEqual(out.diagnostic.values["depth"], 4)


class Arrays(unittest.TestCase):
    def test_a_literal_builds_a_new_array_holding_its_values_in_order(self):
        held = answer([["CONST", 4], ["CONST", 5], ["CONST", 6], ["ARRAY", 3]])
        self.assertIsInstance(held, ArrayValue)
        self.assertEqual(held.elements, [1.0, 2.0, 3.0])

    def test_an_empty_literal_is_an_empty_array(self):
        self.assertEqual(answer([["ARRAY", 0]]).elements, [])

    def test_a_subscript_reads_an_element(self):
        code = [["CONST", 4], ["CONST", 5], ["ARRAY", 2], ["CONST", 4], ["ELEM"]]
        self.assertEqual(answer(code), 2.0)

    def test_an_index_outside_the_array_is_refused_rather_than_absent(self):
        # The opposite of a history read past the start of the dataset: an array
        # has an extent the script chose, so an index outside it is a mistake.
        code = [["CONST", 4], ["ARRAY", 1], ["CONST", 5], ["ELEM"]]
        self.assertEqual(refusal(code).code, "OS4004")

    def test_an_absent_index_is_refused(self):
        code = [["CONST", 4], ["ARRAY", 1], ["CONST", 0], ["ELEM"]]
        self.assertEqual(refusal(code).code, "OS4004")


class Loops(unittest.TestCase):
    """``FOR_INIT``, ``FOR_NEXT`` and the budget ``TICK`` charges."""

    def _counting(self, start, limit, step, budget=2000000):
        """A loop that adds one to a slot each turn, and emits the slot."""
        code = [
            ["CONST", 3],
            ["STORE", 3],
            ["CONST", start],
            ["CONST", limit],
            ["CONST", step],
            ["FOR_INIT", 0, 0, 1, 2, 12],
            ["TICK", 0],
            ["LOAD", 3],
            ["CONST", 4],
            ["ADD"],
            ["STORE", 3],
            ["FOR_NEXT", 0, 0, 1, 2, 6],
            ["LOAD", 3],
        ]
        return run_one(
            code,
            frame={"slots": 4},
            loops=[{"id": 0, "kind": "for", "line": 7, "col": 5}],
            limits={"loops": budget, "history": None},
            requires=["core.1", "loops"],
        )

    def test_a_loop_runs_the_turns_its_bounds_ask_for(self):
        out = self._counting(3, 12, 4)
        self.assertTrue(out.ok, msg=str(out.diagnostic))
        self.assertEqual(out.columns[0], 10.0)

    def test_a_descending_range_with_a_positive_step_runs_zero_times(self):
        # Never silently reversed: the loop simply does not run.
        out = self._counting(12, 3, 4)
        self.assertEqual(out.columns[0], 0.0)

    def test_an_absent_bound_is_refused_rather_than_run_zero_times(self):
        out = self._counting(0, 12, 4)
        self.assertEqual(out.diagnostic.code, "OS4013")
        self.assertEqual(out.diagnostic.values["bound"], "start")

    def test_a_zero_step_is_refused(self):
        out = self._counting(3, 12, 3)
        self.assertEqual(out.diagnostic.code, "OS3004")
        self.assertEqual(out.diagnostic.values["argument"], "step")

    def test_the_budget_stops_the_bar_and_names_the_loop(self):
        out = self._counting(3, 12, 4, budget=4)
        self.assertFalse(out.ok)
        self.assertEqual(out.diagnostic.code, "OS5001")
        self.assertEqual(out.diagnostic.values["budget"], 4)
        # The line of the loop header, not the line of whatever was executing.
        self.assertEqual(out.diagnostic.values["line"], 7)

    def test_the_budget_stops_at_the_turn_the_page_counts_and_not_one_either_side(self):
        # Ten turns, so ten ticks. Two engines must fail at the same iteration
        # of the same loop on the same bar, so the boundary is the test: a
        # budget of ten completes and a budget of nine does not.
        self.assertTrue(self._counting(3, 12, 4, budget=10).ok)
        out = self._counting(3, 12, 4, budget=9)
        self.assertFalse(out.ok)
        self.assertEqual(out.diagnostic.code, "OS5001")
        self.assertEqual(out.diagnostic.values["budget"], 9)

    def test_the_budget_is_counted_in_ticks_and_not_in_instructions(self):
        # Ten turns of a five instruction body is fifty instructions and ten
        # ticks. An engine counting its own instructions would stop here and no
        # two engines would stop at the same place.
        out = self._counting(3, 12, 4, budget=10)
        self.assertTrue(out.ok, msg=str(out.diagnostic))


class Calls(unittest.TestCase):
    """``CALL_FN``, and the bases that make one body serve many call sites."""

    def _two_sites(self):
        """A body that counts its own calls in a cell, called from two sites."""
        body = [
            ["CELL_INIT", 0, 3],
            ["CONST", 3],
            ["STOREC", 0],
            ["LOADC", 0],
            ["CONST", 4],
            ["ADD"],
            ["STOREC", 0],
            ["LOADC", 0],
            ["RET"],
        ]
        return program(
            [
                ["CALL_FN", 0],
                ["POP"],
                ["CALL_FN", 0],
                ["POP"],
                ["CALL_FN", 1],
                ["EMIT", 0],
                ["HALT"],
            ],
            consts=list(POOL),
            channels=[channel(0)],
            requires=["core.1", "functions"],
            cells=[
                {"id": 0, "kind": "var", "name": "a"},
                {"id": 1, "kind": "var", "name": "b"},
            ],
            functions=[{"name": "counted", "params": 0, "slots": 1, "code": body}],
            callSites=[
                {"fn": 0, "argc": 0, "cellBase": 0, "stateBase": 0, "series": []},
                {"fn": 0, "argc": 0, "cellBase": 1, "stateBase": 0, "series": []},
            ],
            debug={
                "pos": [[0, 1, 1]],
                "fnPos": [[0, [[0, 2, 1]]]],
                "names": {"slots": [], "cells": [], "series": [], "channels": []},
                "retain": False,
            },
        )

    def test_one_body_reaches_a_different_cell_from_a_different_site(self):
        # The second site has been called once, so its counter is one while the
        # first site's is two. An engine that ignored cellBase would answer
        # three, which is one counter shared by two calls.
        result = load(self._two_sites(), {}, None, capabilities=capabilities())
        self.assertTrue(result.ok, msg=str(result.diagnostic))
        out = result.run.execute_bar(0, support.flat(1.0), support.confirmed())
        self.assertTrue(out.ok, msg=str(out.diagnostic))
        self.assertEqual(out.columns[0], 1.0)
        self.assertEqual(result.run.cells.values, [2.0, 1.0])

    def test_an_argument_lands_in_the_first_slot(self):
        body = [["LOAD", 0], ["RET"]]
        built = program(
            [["CONST", 6], ["CALL_FN", 0], ["EMIT", 0], ["HALT"]],
            consts=list(POOL),
            channels=[channel(0)],
            requires=["core.1", "functions"],
            functions=[{"name": "same", "params": 1, "slots": 1, "code": body}],
            callSites=[{"fn": 0, "argc": 1, "cellBase": 0, "stateBase": 0, "series": []}],
        )
        result = load(built, {}, None, capabilities=capabilities())
        self.assertTrue(result.ok, msg=str(result.diagnostic))
        out = result.run.execute_bar(0, support.flat(1.0), support.confirmed())
        self.assertEqual(out.columns[0], 3.0)


class LibraryCalls(unittest.TestCase):
    def test_a_stateful_call_keeps_its_region_between_bars(self):
        def counting(arguments, state, context):
            state["seen"] = state.get("seen", 0) + 1
            return float(state["seen"])

        library = Library(
            {"count": LibraryEntry("count", 0, True, "none")}, {"count": counting}
        )
        built = program(
            [["CALL_LIB", 0, 0, 0], ["EMIT", 0], ["HALT"]],
            consts=list(POOL),
            channels=[channel(0)],
            lib={"manifest": 1, "functions": [
                {"name": "count", "arity": 0, "state": True, "effect": "none"}
            ]},
            states=[{"id": 0, "fn": 0}],
        )
        result = load(built, {}, library, capabilities=capabilities())
        self.assertTrue(result.ok, msg=str(result.diagnostic))
        answers = []
        for at in range(3):
            out = result.run.execute_bar(at, support.flat(1.0, at), support.confirmed())
            answers.append(out.columns[0])
        self.assertEqual(answers, [1.0, 2.0, 3.0])

    def test_a_call_with_an_effect_performs_nothing_and_answers_absence(self):
        called = []

        library = Library(
            {"place": LibraryEntry("place", 1, False, "order")},
            {"place": lambda arguments, state, context: called.append(arguments)},
        )
        built = program(
            [["CONST", 4], ["CALL_LIB", 0, 1, -1], ["EMIT", 0], ["HALT"]],
            consts=list(POOL),
            channels=[channel(0)],
            requires=["core.1", "orders"],
            lib={"manifest": 1, "functions": [
                {"name": "place", "arity": 1, "state": False, "effect": "order"}
            ]},
        )
        result = load(built, {}, library, capabilities=capabilities("orders"))
        self.assertTrue(result.ok, msg=str(result.diagnostic))
        out = result.run.execute_bar(0, support.flat(1.0), support.confirmed())
        # The record is pending and the function was never called: inventing an
        # order id at call time would hand the script an identifier for
        # something that may never exist.
        self.assertIs(out.columns[0], ABSENT)
        self.assertEqual(called, [])
        self.assertEqual([one.name for one in out.applied], ["place"])
        self.assertEqual(out.applied[0].arguments, [1.0])


if __name__ == "__main__":
    unittest.main()
