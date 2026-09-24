"""Real programs, as the compiler beside this engine wrote them.

``spec/corpus/`` holds the canonical encoding of every shipped example, and every
one of them is a program somebody wrote as a script and a compiler turned into
data. They reach instructions and shapes no hand-built case in this suite
reaches: user functions with several call sites, loops, arrays, tables, drawing
objects, order calls, a read of a higher timeframe.

**What this file measures, and what it deliberately does not.** The library is
another stage's and is not imported here, so the manifest below agrees with
whatever the program says and every call answers absence. So these cases say
nothing about any number a study computes. What they do say is that the text
parses and is canonical, that the tables verify, that the loop walks every
instruction the program holds without reaching past the end of anything, and that
absence travels through all of it, which is the one thing a study full of
absences is a good test of.

That is worth having on its own: every load-time check in this package runs
against twelve programs no test author shaped, and a verifier that was wrong
about a field nobody thought to break would be wrong here.
"""

import json
import unittest

from tests import support
from tests.support import SPEC, mirroring

from openscript.contracts import Bar
from openscript.run import load_text
from openscript.verify import capabilities

#: Every tag, because this file is about the machine rather than about what a
#: host serves. A program refused here for a capability would be refused for a
#: reason this file is not asking about.
EVERYTHING = capabilities("orders", "objects", "tables", "req.timeframe", "req.symbol")

#: The record a read is planned against at load: the chart's own interval, which
#: a leg read writes as its timeframe, and a zone for a read the calendar dates.
#: One minute, because the bars below are a minute apart.
CHART = {"symbol": "TEST", "exchange": "TEST", "interval": "1", "timezone": "UTC"}

BARS = 8


def rising(at):
    price = 100.0 + at
    return Bar(
        time=float(at) * 60000.0,
        open=price,
        high=price + 1.0,
        low=price - 1.0,
        close=price,
        volume=1000.0 + at,
    )


class EveryProgramInTheCorpus(unittest.TestCase):
    def setUp(self):
        self.files = sorted(
            one for one in (SPEC / "corpus").glob("*.json") if one.name != "index.json"
        )

    def test_the_corpus_is_there(self):
        self.assertGreater(len(self.files), 5)

    def test_every_one_loads_from_its_canonical_text(self):
        for one in self.files:
            with self.subTest(program=one.name):
                text = one.read_text(encoding="utf-8").rstrip("\n")
                raw = json.loads(text)
                result = load_text(text, {}, mirroring(raw), capabilities=EVERYTHING, instrument=CHART)
                self.assertTrue(result.ok, msg=str(result.diagnostic))

    def test_every_one_walks_its_instructions_for_a_run_of_bars(self):
        ran = 0
        for one in self.files:
            with self.subTest(program=one.name):
                text = one.read_text(encoding="utf-8").rstrip("\n")
                raw = json.loads(text)
                result = load_text(text, {}, mirroring(raw), capabilities=EVERYTHING, instrument=CHART)
                self.assertTrue(result.ok, msg=str(result.diagnostic))
                for at in range(BARS):
                    out = result.run.execute_bar(at, rising(at), support.confirmed(), supplied=BARS)
                    if not out.ok:
                        # A library that answers absence makes a loop bound
                        # absent, which is the refusal the format asks for
                        # rather than a defect in the walk: OS4013 says the
                        # number of iterations is unknown and running zero times
                        # would hide that.
                        self.assertEqual(out.diagnostic.code, "OS4013")
                        break
                else:
                    ran += 1
        self.assertGreater(ran, 8)

    def test_nothing_reaches_a_column_that_the_program_did_not_carry(self):
        # Every call answers absence, so a column is either a gap or a constant
        # the program holds: a level a script wrote as a literal still reaches
        # its channel. A column holding anything else would be a value with no
        # source, which is what an engine that invented a conversion or read past
        # the end of a table would put there.
        from openscript.program import constant_value

        gaps = 0
        for one in self.files:
            with self.subTest(program=one.name):
                text = one.read_text(encoding="utf-8").rstrip("\n")
                raw = json.loads(text)
                result = load_text(text, {}, mirroring(raw), capabilities=EVERYTHING, instrument=CHART)
                out = result.run.execute_bar(0, rising(0), support.confirmed(), supplied=BARS)
                if not out.ok:
                    continue
                pool = [constant_value(entry) for entry in raw["consts"]]
                for at, held in enumerate(out.columns):
                    if held is None:
                        gaps += 1
                        continue
                    self.assertIn(held, pool, msg=f"channel {at} of {one.name}")
        self.assertGreater(gaps, 10)

    def test_a_read_of_another_instrument_is_refused_where_no_provider_serves_one(self):
        # The conformance checklist admits an engine that declares no req.symbol
        # and refuses such a program at load, which is what a run handed no
        # provider does: it holds no other instrument's bars and nobody to ask.
        # A read of the chart's own instrument is folded from its own bars, so a
        # program making only those loads with every other tag served.
        refused, folded = [], []
        for one in self.files:
            text = one.read_text(encoding="utf-8").rstrip("\n")
            raw = json.loads(text)
            if not any(tag.startswith("req.") for tag in raw["requires"]):
                continue
            served = capabilities("orders", "objects", "tables")
            result = load_text(text, {}, mirroring(raw), capabilities=served, instrument=CHART)
            if "req.symbol" in raw["requires"]:
                self.assertFalse(result.ok)
                self.assertEqual(result.diagnostic.code, "OS6006")
                self.assertEqual(result.diagnostic.values["tag"], "req.symbol")
                refused.append(one.name)
            else:
                self.assertTrue(result.ok, msg=str(result.diagnostic))
                folded.append(one.name)
        self.assertGreater(len(refused), 0)
        self.assertGreater(len(folded), 0)


class TheProgramsExerciseTheWholeInstructionSet(unittest.TestCase):
    """Which arms of the loop these twelve programs actually reach."""

    def setUp(self):
        self.reached = set()
        for one in sorted((SPEC / "corpus").glob("*.json")):
            if one.name == "index.json":
                continue
            raw = json.loads(one.read_text(encoding="utf-8"))
            for code in self._lists(raw):
                for instruction in code:
                    self.reached.add(instruction[0])

    def _lists(self, raw):
        found = [raw["code"]] + [one["code"] for one in raw["functions"]]
        for request in raw["requests"]:
            found.append(request["body"]["code"])
            found.extend(one["code"] for one in request["body"]["functions"])
        return found

    def test_the_corpus_reaches_most_of_the_instruction_set(self):
        from openscript.opcodes import TABLE

        # Not all of it, and saying which is better than implying all: the
        # figure is measured here rather than promised, so a corpus that stops
        # reaching something says so.
        self.assertGreaterEqual(len(self.reached), 30)
        self.assertTrue(self.reached.issubset(set(TABLE)))

    def test_the_groups_a_hand_built_case_cannot_reach_are_reached_here(self):
        for opcode in ("CALL_FN", "CALL_LIB", "RET", "TICK", "FOR_INIT", "FOR_NEXT", "ARRAY"):
            with self.subTest(opcode=opcode):
                self.assertIn(opcode, self.reached)


if __name__ == "__main__":
    unittest.main()
