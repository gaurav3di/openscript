"""The stateful library against `spec/vectors/library/`, bit for bit.

This is the test the stateful half was written under, and it is what makes "the
two engines agree" worth saying: `ROADMAP.md` Phase 6 gates a release on the
agreement, and an engine ported by reading the other engine's source would agree
with it for the same reason a copy agrees with its original. The vectors are the
first engine's arithmetic written down as bits, so reproducing one is a statement
about the accumulation order `stdlib.md` section 20 fixes and not about either
implementation.

**What this run refuses, beyond a wrong number.** A driver missing for a function
the index names, an entry of this half the index has never heard of, a name this
half and the stateless half both claim, a case that compared nothing, and a
comparison that would pass a wrong engine. Each of those is a way for a file like
this one to report a pass it has not earned.

Every stateful reading is held to exact bits. The exponential and logarithmic
kernels now have portable algorithms, so their derived studies need no platform
tolerance. Sections 20.3 and 20.6 also specify the arrangements selected for the
remaining window and scaling choices.
"""

import copy
import unittest

from openscript.library import stateful_table
from tests import vectors

class CaseBar:
    """The bar and the heap as one vector case holds them.

    A case carries a column per bar fact the function was seen to read, which for
    this half is the four prices, the volume and whether the bar opened a
    session. The heap is a list: a function with more than one output answers an
    array (`stdlib.md` section 2.3), and the array a driver hands back has to be
    something the comparison can walk.
    """

    def __init__(self, case, at: int):
        self._bar = case.get("bar") or {}
        self._host = case.get("host") or {}
        self._at = at

    def bar(self, fact):
        column = self._bar.get(fact)
        return None if column is None else vectors.column_value(column, self._at)

    def host(self, fact):
        return vectors.number_of(self._host.get(fact))

    def first_bar(self) -> bool:
        return self._at == 0

    def kind_of(self, reference):
        return "array" if isinstance(reference, list) else "none"

    def items_of(self, reference):
        return list(reference) if isinstance(reference, list) else None

    def make_array(self, items):
        return list(items)


def outputs_of(answer, count: int):
    """One bar's answer as the columns a case holds for it.

    A single output is the value itself and several are the array's elements in
    the order the entry documents. A short array is padded with absence rather
    than trimmed silently, because a function that stopped returning an element
    is exactly the defect this file is for.
    """
    if count == 1:
        return [answer]
    if isinstance(answer, list):
        return list(answer) + [None] * (count - len(answer))
    return [None] * count


def drive(entry, case):
    """Every bar of one case, as (bar, which output, what it gave, what the file holds).

    A fresh state region per case, which is what `docs/integrating/library-vectors.md`
    tells an implementer to do and what the engine does at the start of a run.
    """
    state = {}
    columns = case["outputs"]
    for at in range(case["bars"]):
        arguments = [vectors.column_value(column, at) for column in case["args"]]
        given = outputs_of(entry.call(CaseBar(case, at), arguments, state), len(columns))
        for which, column in enumerate(columns):
            yield at, which, vectors.cell_of(given[which]), column["values"][at]


def stateful_rows():
    """The index's rows for functions that carry state across bars."""
    return [row for row in vectors.index()["functions"] if row["state"]]


class StatefulVectors(unittest.TestCase):
    def setUp(self):
        self.entries = stateful_table()
        self.rows = stateful_rows()

    def test_every_stateful_function_the_index_names_has_a_binding(self):
        """A function with a vector file and no driver is a silent gap in the run."""
        missing = [
            f"{row['name']}/{row['arity']}"
            for row in self.rows
            if (row["name"], row["arity"]) not in self.entries
        ]
        self.assertEqual(
            missing,
            [],
            "the index names these stateful functions and this half binds none of them, "
            "so their vectors were never compared with anything",
        )

    def test_every_entry_of_this_half_is_a_name_the_index_knows(self):
        """A name or an arity this half invented would match no program's table.

        `compiled-program.md` section 2.5 has an engine check a program's library
        table against its manifest at load, by name and by arity. A function
        spelled differently here is refused there, which is a failure at the worst
        moment: a host has already accepted the engine.
        """
        known = {f"{row['name']}/{row['arity']}" for row in vectors.index()["functions"]}
        for group in vectors.index()["notReached"]:
            known.update(group["functions"])
        unknown = [
            f"{name}/{arity}" for (name, arity) in self.entries if f"{name}/{arity}" not in known
        ]
        self.assertEqual(
            unknown,
            [],
            "these entries are not in the library manifest the index was written from",
        )

    def test_every_row_here_says_it_holds_state_and_has_no_effect(self):
        """A row that lied about either field is refused at load, not at the bar.

        Section 2.5 compares ``state`` and ``effect`` as well as the name and the
        arity, so a function in this half whose row said it holds nothing would be
        handed no region and would quietly answer absence for the whole run.
        """
        wrong = [
            f"{entry.name}/{entry.arity}"
            for entry in self.entries.values()
            if not entry.state or entry.effect != "none"
        ]
        self.assertEqual(wrong, [])

    def test_the_two_halves_claim_no_name_between_them(self):
        """One function is in one half, or a merged table drops whichever came second."""
        from openscript.library import table as stateless_table

        both = sorted(set(self.entries) & set(stateless_table()))
        self.assertEqual(
            both,
            [],
            "these names are in both halves of the manifest, so which one a caller "
            "reaches depends on how the two tables were merged",
        )

    def test_every_vector_this_page_fixes_is_reproduced_bit_for_bit(self):
        """The whole of the stage: the arithmetic, held to the file."""
        compared = 0
        wrong = []
        for row in self.rows:
            entry = self.entries[(row["name"], row["arity"])]
            for case in vectors.vectors_for(row["file"])["cases"]:
                for at, which, got, want in drive(entry, case):
                    compared += 1
                    if got != want and not wrong:
                        wrong.append(
                            f"{row['name']}/{row['arity']} case {case['id']} bar {at} "
                            f"output {which}: this engine {got}, the file {want}"
                        )
        self.assertEqual(wrong, [], "the first cell that differs")
        self.assertGreater(compared, 0, "no cell was compared, so this test proved nothing")

    def test_no_stateful_case_carries_a_platform_math_exclusion(self):
        for row in self.rows:
            self.assertNotIn(1, row["gaps"], row["name"])
            for case in vectors.vectors_for(row["file"])["cases"]:
                self.assertNotIn(1, case["gaps"], (row["name"], case["id"]))

    def test_a_region_is_a_mechanical_copy_and_rolls_back_to_it(self):
        """`compiled-program.md` section 2.11 and section 6, put to every function.

        The engine copies a region without knowing whose it is and restores it on
        a rollback, so a function that kept anything outside the region, in a
        module level dictionary or in a closure, would carry the discarded bars
        forward. This drives every case twice: once straight through, and once
        with a copy taken partway, some bars run and thrown away, and the copy put
        back. The two runs have to agree cell for cell.
        """
        compared = 0
        wrong = []
        for row in self.rows:
            entry = self.entries[(row["name"], row["arity"])]
            for case in vectors.vectors_for(row["file"])["cases"]:
                straight = list(drive(entry, case))
                replayed = self._with_a_rollback(entry, case)
                compared += len(straight)
                if [cell for _at, _which, cell, _want in straight] != replayed and not wrong:
                    wrong.append(f"{row['name']}/{row['arity']} case {case['id']}")
        self.assertEqual(wrong, [], "these functions kept state outside their region")
        self.assertGreater(compared, 0)

    def _with_a_rollback(self, entry, case):
        """One case driven with a checkpoint taken at its middle and restored."""
        state = {}
        mark = case["bars"] // 2
        kept = None
        given = []
        for at in range(case["bars"]):
            if at == mark:
                kept = copy.deepcopy(state)
                for ahead in range(mark, case["bars"]):
                    entry.call(
                        CaseBar(case, ahead),
                        [vectors.column_value(column, ahead) for column in case["args"]],
                        state,
                    )
                state = kept
            arguments = [vectors.column_value(column, at) for column in case["args"]]
            answer = outputs_of(entry.call(CaseBar(case, at), arguments, state), len(case["outputs"]))
            given.extend(vectors.cell_of(one) for one in answer)
        return given

    def test_two_call_sites_of_one_function_do_not_share_anything(self):
        """`language.md` section 11.4: a call site is a state slot of its own.

        Two calls of the same function on the same bars, driven one after the
        other into two regions, have to give the same answers as either one on its
        own. A module level buffer or a cached kernel would show up here as the
        second call seeing the first call's bars.
        """
        wrong = []
        for row in self.rows:
            entry = self.entries[(row["name"], row["arity"])]
            case = vectors.vectors_for(row["file"])["cases"][0]
            alone = [cell for _at, _which, cell, _want in drive(entry, case)]
            first, second = {}, {}
            together = []
            for at in range(case["bars"]):
                arguments = [vectors.column_value(column, at) for column in case["args"]]
                entry.call(CaseBar(case, at), arguments, second)
                answer = outputs_of(
                    entry.call(CaseBar(case, at), arguments, first), len(case["outputs"])
                )
                together.extend(vectors.cell_of(one) for one in answer)
            if alone != together:
                wrong.append(f"{row['name']}/{row['arity']}")
        self.assertEqual(wrong, [], "these functions share state between call sites")

    def test_the_comparison_would_catch_a_wrong_engine(self):
        """The check on the check.

        A comparison that compared floats would call these pairs equal, and this
        file would then pass over an engine that was wrong in the last bit, wrong
        about the sign of a zero and wrong about absence.
        """
        self.assertNotEqual(vectors.cell_of(1.0), vectors.cell_of(1.0000000000000002))
        self.assertNotEqual(vectors.cell_of(0.0), vectors.cell_of(-0.0))
        self.assertNotEqual(vectors.cell_of(0.0), vectors.cell_of(None))
        self.assertNotEqual(vectors.cell_of(1.0), vectors.cell_of(True))
        self.assertEqual(outputs_of(None, 3), [None, None, None])
        self.assertEqual(outputs_of([1.0], 2), [1.0, None])


if __name__ == "__main__":
    unittest.main()
