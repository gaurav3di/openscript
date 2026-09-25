"""The stateless library against `spec/vectors/library/`, bit for bit.

This is the test the stateless half was written under, and it is the only thing
that makes "the two engines agree" worth saying: `ROADMAP.md` Phase 6 gates a
release on the agreement, and an engine ported by reading the other engine's
source would agree with it for the same reason a copy agrees with its original.
The vectors are the first engine's arithmetic written down as bits, so
reproducing one is a statement about the accumulation order `stdlib.md` section
20 fixes and not about either implementation.

**What the run refuses, beyond a wrong number.** A driver missing for a function
the index names, an entry of this half the index has never heard of, a case that
compared nothing, and a comparison that would pass a wrong engine. Each of those
is a way for this file to report a pass it has not earned, and this repository has
paid for that shape of failure often enough to write the refusals down first.

Every scalar vector is compared exactly. No platform-math exemption or
numerical tolerance remains in this driver.
"""

import unittest

from openscript.library import table
from openscript.library.stateless import Context
from tests import vectors

class CaseBar(Context):
    """The bar, the host and the heap as one vector case holds them.

    A case carries a column per bar fact the function was seen to read and a
    single value per host fact, which is the whole of what the stateless half
    asks a caller for. The heap answers nothing: no function with a vector file
    touches it, and a driver that quietly made an array would be inventing an
    input the file does not hold.
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
        return "none"

    def items_of(self, reference):
        return None

    def make_array(self, items):
        return None


def arguments(case, at: int):
    """This bar's arguments, in the order the file's parameters are in."""
    return [vectors.column_value(column, at) for column in case["args"]]


def drive(entry, case):
    """Every bar of one case, as (bar, what the engine gave, what the file holds)."""
    outputs = case["outputs"]
    for at in range(case["bars"]):
        got = entry.call(CaseBar(case, at), arguments(case, at))
        yield at, vectors.cell_of(got), outputs[0]["values"][at]


def stateless_functions():
    """The index's rows for functions that hold nothing across bars."""
    return [row for row in vectors.index()["functions"] if not row["state"]]


class LibraryVectors(unittest.TestCase):
    def setUp(self):
        self.entries = table()
        self.rows = stateless_functions()

    def test_every_stateless_function_the_index_names_has_a_binding(self):
        """A function with a vector file and no driver is a silent gap in the run."""
        missing = [
            f"{row['name']}/{row['arity']}"
            for row in self.rows
            if (row["name"], row["arity"]) not in self.entries
        ]
        self.assertEqual(
            missing,
            [],
            "the index names these stateless functions and this half binds none of them, "
            "so their vectors were never compared with anything",
        )

    def test_every_entry_of_this_half_is_a_name_the_index_knows(self):
        """A name or an arity this half invented would match no program's table.

        `compiled-program.md` section 2.5 has an engine check a program's library
        table against its manifest at load, by name and by arity. A function
        spelled differently here is refused there, which is a failure at the
        worst moment: a host has already accepted the engine.
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

    def test_every_stateless_vector_is_reproduced_bit_for_bit(self):
        """The whole of the stage: the arithmetic, held to the file."""
        compared = 0
        wrong = []
        for row in self.rows:
            entry = self.entries[(row["name"], row["arity"])]
            for case in vectors.vectors_for(row["file"])["cases"]:
                for at, got, want in drive(entry, case):
                    compared += 1
                    if got != want and not wrong:
                        wrong.append(
                            f"{row['name']}/{row['arity']} case {case['id']} bar {at}: "
                            f"this engine {got}, the file {want}"
                        )
        self.assertEqual(wrong, [], "the first cell that differs")
        self.assertGreater(compared, 0, "no cell was compared, so this test proved nothing")

    def test_no_scalar_case_carries_a_platform_math_exclusion(self):
        self.assertTrue(any(row['name'] == 'pow' for row in self.rows))
        for row in self.rows:
            self.assertEqual(row['gaps'], [], row['name'])
            for case in vectors.vectors_for(row['file'])['cases']:
                self.assertEqual(case['gaps'], [], (row['name'], case['id']))

    def test_the_comparison_would_catch_a_wrong_engine(self):
        """The check on the check.

        A comparison that compared floats would call these three pairs equal, and
        this file would then pass over an engine that was wrong in the last bit,
        wrong about the sign of a zero and wrong about absence. Before trusting
        the run above, the encoding is put through all three.
        """
        self.assertNotEqual(vectors.cell_of(1.0), vectors.cell_of(1.0000000000000002))
        self.assertNotEqual(vectors.cell_of(0.0), vectors.cell_of(-0.0))
        self.assertNotEqual(vectors.cell_of(0.0), vectors.cell_of(None))
        self.assertNotEqual(vectors.cell_of(1.0), vectors.cell_of(True))


if __name__ == "__main__":
    unittest.main()
