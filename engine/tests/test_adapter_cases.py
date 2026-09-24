"""A case directory, read and run: the adapter end to end, on cases built here.

Every case below is written in a temporary directory by this file, so what is
asserted is what the file says rather than what some run once produced. The two
cases in the repository's own suite are strategy cases over four hundred bars,
and what they hold this engine to is a ledger and a report;
``test_strategy_profile.py`` runs those. What is here is the adapter itself: the
files it reads, the channels it answers, and every shortfall it names rather than
passes over.

The arithmetic asserted here is arithmetic anybody can check by hand. ``close``
doubled is exact in binary64 for every value used, so a difference in the last
bit is a defect in the engine and not in the expectation, which is the standard
section 4 sets for an expected file: "Whatever came out" is not an expectation.
"""

import json
import tempfile
import unittest
from pathlib import Path
from typing import Any, Dict, Optional

from openscript.adapter.answers import answer_for, describe, invoke, result_for
from openscript.adapter.reading import read_case
from openscript.adapter.spellings import Malformed
from openscript.canonical import canonicalise
from tests.support import POOL, channel, program, register, tags_for

#: A study that emits one number per bar, through one plot with one title.
PLOT = {
    "key": "p0",
    "title": "doubled",
    "type": "line",
    "channel": 0,
    "color": None,
    "colorChannel": None,
    "width": 1,
    "lineStyle": "solid",
    "offset": 0,
    "overlay": None,
    "scale": "right",
    "precision": None,
    "priceFormat": None,
    "ohlc": None,
}

#: Two bars whose closes double exactly, so the expectation is arithmetic and not
#: a recording.
BARS = "time,open,high,low,close,volume\n1,1,1,1,100.5,10\n2,1,1,1,0.1,none\n"

DOUBLED = "bar,doubled\n0,201\n1,0.2\n"

CASE = {
    "id": "adapter/doubled",
    "category": "semantics",
    "profile": "core",
    "languageVersion": 1,
    "description": "A close doubled is the close doubled.",
    "asserts": ["values"],
}


def built(code, **changed) -> Dict[str, Any]:
    """A program that emits ``code``'s answer through the plot above."""
    changed.setdefault("consts", list(POOL))
    changed.setdefault("channels", [channel(0)])
    changed.setdefault("series", [register(0, "close")])
    changed.setdefault("requires", tags_for(code))
    made = program([list(one) for one in code], **changed)
    made["outputs"]["plots"] = [dict(PLOT)]
    return made


def doubling() -> Dict[str, Any]:
    """``close * 2``, emitted. POOL entry 5 is the number two."""
    return built([["SLOAD", 0], ["CONST", 5], ["MUL"], ["EMIT", 0], ["HALT"]])


def envelope(made: Optional[Dict[str, Any]] = None, text: Optional[str] = None) -> Dict[str, Any]:
    """What the invocation carries: the compiled program as canonical text."""
    return {"program": canonicalise(made) if text is None else text}


def write_case(directory: Path, **files: Optional[str]) -> Path:
    """One case directory, holding the files named and nothing else."""
    here = directory / "adapter" / "doubled"
    here.mkdir(parents=True)
    held = {"case.json": json.dumps(CASE), "script.os": "plot(close * 2)\n", **files}
    for name, text in held.items():
        if text is None:
            continue
        (here / name).write_text(text, encoding="utf-8")
    return here


class Directories(unittest.TestCase):
    """Section 2's table is the whole of a case directory.

    Catches an adapter that read a file the table does not name, which is a case
    run on input the engine next door never saw, and one that did not hold the
    files it does name to their own shapes, which is a case run under values
    nobody stated."""

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.addCleanup(self.temporary.cleanup)

    def test_a_file_the_table_does_not_name_is_not_input(self):
        here = write_case(self.root, **{"bars.csv": BARS})
        (here / "fixture.json").write_text("{}", encoding="utf-8")
        with self.assertRaises(Malformed) as refused:
            read_case(str(here))
        self.assertIn("fixture.json", str(refused.exception))

    def test_a_secondary_series_is_a_file_the_table_names(self):
        here = write_case(self.root, **{"bars.csv": BARS, "bars.1D.csv": BARS})
        self.assertEqual(read_case(str(here)).secondary, ("bars.1D.csv",))

    def test_an_extra_column_in_the_bars_is_an_error_rather_than_ignored(self):
        here = write_case(self.root, **{"bars.csv": BARS.replace("volume", "volume,oi")})
        with self.assertRaises(Malformed):
            read_case(str(here))

    def test_bars_out_of_order_are_refused_rather_than_sorted(self):
        rows = "time,open,high,low,close,volume\n2,1,1,1,1,1\n1,1,1,1,1,1\n"
        here = write_case(self.root, **{"bars.csv": rows})
        with self.assertRaises(Malformed) as refused:
            read_case(str(here))
        self.assertIn("strictly increasing", str(refused.exception))

    def test_an_absent_field_is_absence_and_not_a_zero(self):
        here = write_case(self.root, **{"bars.csv": BARS})
        bars = read_case(str(here)).bars
        self.assertEqual(bars[0].volume, 10.0)
        self.assertIsNone(bars[1].volume)

    def test_a_dropped_row_is_caught_at_the_row_it_was_dropped_at(self):
        here = write_case(
            self.root, **{"bars.csv": BARS, "expected.csv": "bar,doubled\n0,201\n2,0.2\n"}
        )
        with self.assertRaises(Malformed) as refused:
            read_case(str(here))
        self.assertIn("line 3", str(refused.exception))

    def test_an_instrument_that_states_no_volume_flag_is_refused(self):
        here = write_case(self.root, **{"bars.csv": BARS, "instrument.json": '{"symbol":"AAA"}'})
        with self.assertRaises(Malformed) as refused:
            read_case(str(here))
        self.assertIn("hasVolume", str(refused.exception))

    def test_a_case_that_states_no_instrument_runs_under_the_page_default(self):
        here = write_case(self.root, **{"bars.csv": BARS})
        read = read_case(str(here))
        self.assertFalse(read.stated_instrument)
        self.assertEqual(read.instrument["tickSize"], 0.01)

    def test_a_backtest_file_missing_a_field_is_malformed(self):
        here = write_case(self.root, **{"bars.csv": BARS, "backtest.json": '{"digits":2}'})
        with self.assertRaises(Malformed) as refused:
            read_case(str(here))
        self.assertIn("costs", str(refused.exception))

    def test_a_moved_directory_is_caught_by_the_id_it_carries(self):
        here = write_case(self.root, **{"bars.csv": BARS})
        moved = here.parent / "elsewhere"
        here.rename(moved)
        with self.assertRaises(Malformed) as refused:
            read_case(str(moved))
        self.assertIn("moved directory", str(refused.exception))


class Running(unittest.TestCase):
    """The engine, over a case, against the case's own expectation.

    Catches the failure that matters most here: an adapter that reports a pass
    for a case it did not run. Every test below would still pass on an engine
    that answered nothing, unless the outcome and the values are both asserted,
    so both are."""

    def case(self, **files):
        """One case directory, in a root of its own so two can stand at once."""
        holder = tempfile.TemporaryDirectory()
        self.addCleanup(holder.cleanup)
        return str(write_case(Path(holder.name), **{"bars.csv": BARS, "expected.csv": DOUBLED, **files}))

    def test_the_engine_runs_the_case_and_the_values_match(self):
        directory = self.case()
        answered = answer_for(directory, envelope(doubling()))
        self.assertEqual(answered["unsupported"], [])
        self.assertEqual(answered["channels"]["values"], [{"doubled": 201.0}, {"doubled": 0.2}])
        self.assertEqual(result_for(directory, envelope(doubling()))["outcome"], "pass")

    def test_a_wrong_expectation_fails_at_the_bar_it_differs_on(self):
        directory = self.case(**{"expected.csv": "bar,doubled\n0,201\n1,0.3\n"})
        found = result_for(directory, envelope(doubling()))
        self.assertEqual(found["outcome"], "fail")
        self.assertEqual(found["index"], 1)
        self.assertEqual(found["column"], "doubled")
        self.assertEqual(found["expected"], "0.3")
        self.assertEqual(found["actual"], "0.2")

    def test_absence_is_asserted_as_absence_and_not_as_a_zero(self):
        # The register holds the bar's close, and a bar with an absent close
        # emits absence. A comparison that read `none` as zero would pass this
        # against a column of zeros, which is the defect warmup length hides in.
        bars = "time,open,high,low,close,volume\n1,1,1,1,none,1\n"
        directory = self.case(**{"bars.csv": bars, "expected.csv": "bar,doubled\n0,none\n"})
        self.assertEqual(result_for(directory, envelope(doubling()))["outcome"], "pass")
        wrong = self.case(**{"bars.csv": bars, "expected.csv": "bar,doubled\n0,0\n"})
        found = result_for(wrong, envelope(doubling()))
        self.assertEqual(found["outcome"], "fail")
        self.assertEqual(found["bound"], "absence")

    def test_a_capability_this_engine_does_not_serve_is_named_on_the_case(self):
        # Every tag section 2.2 lists is served now: req.symbol was the last,
        # until issue 0021 served a read of another instrument from the case's
        # own file. So the tag is one a later minor could add (section 9.2),
        # which is the case this mechanism exists for, and the tag is the whole
        # of what this asserts.
        made = doubling()
        made["requires"] = sorted(set(made["requires"]) | {"later.feature"})
        found = result_for(self.case(), envelope(made))
        self.assertEqual(found["outcome"], "unsupported")
        self.assertIn("later.feature", found["feature"])

    def test_a_library_function_this_engine_has_no_manifest_row_for_is_named(self):
        made = doubling()
        made["lib"] = {
            "manifest": 1,
            "functions": [{"name": "draw.line", "arity": 5, "state": False, "effect": "draw"}],
        }
        found = result_for(self.case(), envelope(made))
        self.assertEqual(found["outcome"], "unsupported")
        self.assertIn("draw.line", found["feature"])

    def test_a_channel_this_engine_does_not_answer_is_named_rather_than_left_empty(self):
        # An empty channel compares equal to an empty expectation, so an adapter
        # that answered one would report a pass for a channel it cannot produce.
        declared = {**CASE, "asserts": ["markers"]}
        directory = self.case(**{"case.json": json.dumps(declared)})
        found = result_for(directory, envelope(doubling()))
        self.assertEqual(found["outcome"], "unsupported")
        self.assertIn("markers", found["feature"])

    def test_a_script_that_did_not_compile_is_the_compiler_and_not_this_engine(self):
        found = result_for(self.case(), {"diagnostics": [{"code": "OS1002"}]})
        self.assertEqual(found["outcome"], "unsupported")
        self.assertIn("compiler", found["feature"])

    def test_a_program_that_is_not_the_canonical_encoding_is_refused_at_the_text(self):
        # The hash a host records a run against is taken over canonical bytes, so
        # text that parses to a program and is spelled another way is text that
        # hash does not name. Catches an adapter that parsed the program itself
        # and handed the engine an object, which skips the check entirely.
        loose = canonicalise(doubling()).replace('{"', '{ "', 1)
        directory = self.case(**{"case.json": json.dumps({**CASE, "asserts": ["diagnostics"]})})
        answered = answer_for(directory, envelope(text=loose))
        self.assertEqual([one["code"] for one in answered["channels"]["diagnostics"]], ["OS6018"])

    def test_a_bar_that_fails_stops_the_run_and_names_the_bar(self):
        # An empty array, indexed. Catches an adapter that carried on past a
        # failed bar, which would report values the engine never published.
        failing = built([["ARRAY", 0], ["CONST", 3], ["ELEM"], ["EMIT", 0], ["HALT"]])
        directory = self.case(**{"case.json": json.dumps({**CASE, "asserts": ["diagnostics"]})})
        answered = answer_for(directory, envelope(failing))
        self.assertEqual(answered["channels"]["diagnostics"], [
            {"code": "OS4004", "line": 1, "column": 1, "severity": "error", "barIndex": 0}
        ])

    def test_a_case_directory_that_cannot_be_read_is_an_error_and_not_a_failure(self):
        found = result_for(str(Path(tempfile.gettempdir()) / "no-such-case-directory"), envelope(doubling()))
        self.assertEqual(found["outcome"], "error")

    def test_a_tolerance_past_the_cap_is_an_error_rather_than_a_run(self):
        declared = {**CASE, "tolerance": {"abs": 0, "rel": 0.1, "reason": "stated"}}
        directory = self.case(**{"case.json": json.dumps(declared)})
        found = result_for(directory, envelope(doubling()))
        self.assertEqual(found["outcome"], "error")
        self.assertIn("cap", found["reason"])


class Invocations(unittest.TestCase):
    """The three the page gives an adapter, and the refusal of everything else."""

    def test_the_identity_holds_every_field_section_9_names(self):
        identity = describe()
        for field in ("name", "version", "profile", "languageVersions", "schemaVersion"):
            with self.subTest(field=field):
                self.assertIsNotNone(identity.get(field))
        self.assertEqual(identity["languageVersions"], [1])

    def test_an_invocation_that_is_not_one_of_the_three_is_refused(self):
        for arguments in ([], ["--describe", "extra"], ["--nonsense"], ["a", "b"], ["--actual"]):
            with self.subTest(arguments=arguments):
                self.assertIsNone(invoke(arguments))

    def test_the_describe_invocation_is_the_identity(self):
        self.assertEqual(invoke(["--describe"]), describe())


if __name__ == "__main__":
    unittest.main()
