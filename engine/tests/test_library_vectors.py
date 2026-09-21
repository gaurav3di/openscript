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

**The gap 1 family is held to something weaker, and says so.**
`stdlib.md` section 20.11 gap 1 and `conformance.md` section 8: the
transcendental calls have no portable reference algorithm, so no case may assert
a value that reaches them and a difference there is not a defect. What is still
asked of them is absence for absence, which is a question about the domain rules
and not about the last bit, and a distance of at most one representable value,
which is what two correct maths libraries differ by and is far tighter than a
wrong implementation would ever land.
"""

import unittest

from openscript.library import table
from openscript.library.stateless import Context
from tests import vectors

# What one maths library may differ from another by, in representable values.
# A real difference between two correctly rounded implementations is one; a
# wrong argument order, a wrong branch or a wrong constant is astronomically
# more, so this separates the gap from a defect rather than excusing both.
GAP_TOLERANCE = 1


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
                if case["gaps"]:
                    continue
                for at, got, want in drive(entry, case):
                    compared += 1
                    if got != want and not wrong:
                        wrong.append(
                            f"{row['name']}/{row['arity']} case {case['id']} bar {at}: "
                            f"this engine {got}, the file {want}"
                        )
        self.assertEqual(wrong, [], "the first cell that differs")
        self.assertGreater(compared, 0, "no cell was compared, so this test proved nothing")

    def test_the_gap_one_family_agrees_on_absence_and_stays_within_one_value(self):
        """What can be asked of a call no document fixes."""
        reached = 0
        wrong = []
        for row in self.rows:
            if not row["gaps"]:
                continue
            entry = self.entries[(row["name"], row["arity"])]
            for case in vectors.vectors_for(row["file"])["cases"]:
                if not case["gaps"]:
                    continue
                for at, got, want in drive(entry, case):
                    reached += 1
                    where = f"{row['name']}/{row['arity']} case {case['id']} bar {at}"
                    if (got is None) != (want is None):
                        wrong.append(f"{where}: absence differs, {got} against {want}")
                    elif got is not None and got != want:
                        apart = vectors.ulps_between(got, want)
                        if apart > GAP_TOLERANCE:
                            wrong.append(f"{where}: {apart} values apart, {got} against {want}")
        self.assertEqual(wrong, [])
        self.assertGreater(reached, 0, "no gap 1 cell was reached, so this test proved nothing")

    def test_the_gap_one_family_really_does_differ(self):
        """The weaker rule above is weaker for a reason that is still true.

        If every gap 1 call started agreeing to the last bit, the two engines
        would have stopped depending on two maths libraries and the tolerance
        above would be covering nothing. That is worth knowing rather than
        enjoying quietly, so it is asserted: this run expects a difference, and a
        run with none is a change in the world that should be read.
        """
        differing = set()
        for row in self.rows:
            if not row["gaps"]:
                continue
            entry = self.entries[(row["name"], row["arity"])]
            for case in vectors.vectors_for(row["file"])["cases"]:
                for _at, got, want in drive(entry, case):
                    if got != want:
                        differing.add(f"{row['name']}/{row['arity']}")
        self.assertNotEqual(
            differing,
            set(),
            "every transcendental call now matches the other engine to the last bit. "
            "That is either a new maths library or a new algorithm, and either way "
            "stdlib.md 20.11 gap 1 should be read again before this test is deleted",
        )

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
        self.assertEqual(vectors.ulps_between(vectors.cell_of(1.0), vectors.cell_of(1.0)), 0)
        self.assertEqual(
            vectors.ulps_between(vectors.cell_of(1.0), vectors.cell_of(1.0000000000000002)), 1
        )


if __name__ == "__main__":
    unittest.main()
