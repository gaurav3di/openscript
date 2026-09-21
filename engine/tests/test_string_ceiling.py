"""The string ceiling, OS5008: what a bar may grow and what it may not.

``errors.md`` OS5008 catches the one shape that grows without bound by accident:
text appended to a persistent string on every bar, which is a log that nothing
ever trims. The ceiling is the engine's own, the language fixes no number, and
what the language does fix is that reaching it is a diagnostic rather than a
truncation, that the count is in code points (`stdlib.md` section 10), and that a
conversion which would pass it is refused "before the string is built rather than
after" (`stdlib.md`, on ``text(x, decimals)``).

**This engine raised none of it.** The first engine refused a repeat and a fixed
decimal conversion past the ceiling and this one built the string, so a case
asserting diagnostics was answered with a code by one engine and with nothing by
the other, on the channel both of them answer, which ``conformance.md`` section
10 calls a release blocker.

Two halves, and the tests below are divided the same way. A string that exists is
measured; a string that does not exist yet is measured from its arguments, which
is what makes ``str.repeat("x", 1e12)`` a diagnostic rather than a machine
running out of memory. Which of the two answered is visible in the length the
refusal names, and one test turns on exactly that.
"""

import re
import unittest

from tests import support
from tests.support import channel, program

from openscript.adapter.serving import Serving
from openscript.budget import EngineLimits
from openscript.diagnostics import Position
from openscript.library.number_text import fixed, fixed_length
from openscript.run import load
from openscript.verify import capabilities

#: Small enough that a test reaches it in a line a reader can count by hand. The
#: number the engine ships with is its own and is in ``budget.py``; what is under
#: test is the rule, which is the same at any ceiling.
CEILING = 25

#: The pool these programs reach into, after the three section 2.9 reserves.
CONSTS = support.RESERVED + [
    ["s", ""],            # 3
    ["s", "abcdefghij"],  # 4
    ["s", "ab"],          # 5
    ["n", 100],           # 6
    ["n", 30],            # 7
    ["n", -1.5],          # 8
    ["n", 1e12],          # 9
]
EMPTY, TEN, PAIR, HUNDRED, THIRTY, NEGATIVE, ENORMOUS = 3, 4, 5, 6, 7, 8, 9

#: ``str.repeat`` and ``text(x, decimals)``: the two calls whose string is
#: measured before a character of it exists.
REPEAT = {"name": "str.repeat", "arity": 2, "state": False, "effect": "none"}
TEXT = {"name": "text", "arity": 2, "state": False, "effect": "none"}
UPPER = {"name": "str.upper", "arity": 1, "state": False, "effect": "none"}
PAD = {"name": "str.padLeft", "arity": 3, "state": False, "effect": "none"}


def running(code, functions, positions=None, **changed):
    """One program on the real library, with a ceiling a bar can reach."""
    listing = [list(one) for one in code]
    changed.setdefault("consts", list(CONSTS))
    changed.setdefault("channels", [channel(0)])
    changed.setdefault("requires", support.tags_for(listing))
    built = program(listing, lib={"manifest": 1, "functions": list(functions)}, **changed)
    if positions is not None:
        built["debug"] = {**built["debug"], "pos": [list(one) for one in positions]}
    found = load(
        built,
        {},
        Serving(),
        limits=EngineLimits(string_length=CEILING),
        capabilities=capabilities(),
    )
    if not found.ok:
        raise AssertionError(f"the program was refused: {found.diagnostic}")
    return found.run


def bar(run, index=0):
    return run.execute_bar(index, support.flat(100.0, index), support.confirmed(), supplied=8)


class AStringBuiltPastTheCeiling(unittest.TestCase):
    """The half that is measured after the fact: a string that now exists."""

    def test_a_repeat_past_the_ceiling_is_refused(self):
        # Catches the engine this was: the string was built, pushed and emitted,
        # and the run answered a value where the other engine answered a code.
        found = bar(
            running(
                [["CONST", PAIR], ["CONST", HUNDRED], ["CALL_LIB", 0, 2, -1], ["EMIT", 0], ["HALT"]],
                [REPEAT],
            )
        )

        self.assertFalse(found.ok)
        self.assertEqual(found.diagnostic.code, "OS5008")
        self.assertEqual(found.diagnostic.values["max"], CEILING)
        self.assertEqual(found.diagnostic.values["found"], 200)

    def test_a_call_that_stays_inside_the_ceiling_answers_its_string(self):
        # The other side, and the one that would catch a ceiling applied to
        # every call: an engine refusing the strings a script is meant to build
        # passes every test that asserts only a refusal.
        found = bar(
            running(
                [["CONST", PAIR], ["CALL_LIB", 0, 1, -1], ["EMIT", 0], ["HALT"]],
                [UPPER],
                channels=[channel(0, kind="string")],
            )
        )

        self.assertTrue(found.ok, msg=str(found.diagnostic))
        self.assertEqual(found.columns[0], "AB")

    def test_a_call_the_library_cannot_measure_is_refused_on_what_it_built(self):
        # Padding to a width is the other half of the rule: how long the result
        # will be is not worth working out in advance, so it is built and then
        # measured. Catches an engine that applies the ceiling only to the two
        # calls it can measure first, which would leave every other string call
        # able to pass it.
        found = bar(
            running(
                [
                    ["CONST", PAIR],
                    ["CONST", HUNDRED],
                    ["CONST", PAIR],
                    ["CALL_LIB", 0, 3, -1],
                    ["EMIT", 0],
                    ["HALT"],
                ],
                [PAD],
                channels=[channel(0, kind="string")],
            )
        )

        self.assertEqual(found.diagnostic.code, "OS5008")
        self.assertEqual(found.diagnostic.values["found"], 100)

    def test_the_refusal_points_at_the_call_that_grew_the_string(self):
        # Section 2.15 gives every instruction a position and a diagnostic is
        # only actionable at one. Catches a ceiling applied where the value is
        # stored rather than where it is built: the caret would sit on the line
        # the label was assigned on, which is not the line to change.
        found = bar(
            running(
                [["CONST", PAIR], ["CONST", HUNDRED], ["CALL_LIB", 0, 2, -1], ["EMIT", 0], ["HALT"]],
                [REPEAT],
                positions=[[0, 5, 1], [2, 5, 9], [3, 6, 1]],
            )
        )

        self.assertEqual(found.diagnostic.position, Position(5, 9))

    def test_a_string_grown_over_bars_is_refused_on_the_bar_it_passes_on(self):
        # The shape the code is filed under: a log appended to on every bar and
        # never trimmed. Ten characters a bar against a ceiling of twenty five,
        # so bars 0 and 1 stand and bar 2 is the one that passes it. Catches a
        # ceiling checked only inside library calls, which is where the first
        # engine checks it too and is not where a log grows.
        run = running(
            [
                ["CELL_INIT", 0, 3],
                ["CONST", EMPTY],
                ["STOREC", 0],
                ["LOADC", 0],
                ["CONST", TEN],
                ["ADD"],
                ["STOREC", 0],
                ["LOADC", 0],
                ["EMIT", 0],
                ["HALT"],
            ],
            [],
            cells=[{"id": 0, "kind": "var", "name": "kept"}],
        )

        self.assertEqual(bar(run, 0).columns[0], "abcdefghij")
        self.assertEqual(bar(run, 1).columns[0], "abcdefghijabcdefghij")
        third = bar(run, 2)
        self.assertEqual(third.diagnostic.code, "OS5008")
        self.assertEqual(third.diagnostic.values["found"], 30)


class AStringNotBuiltYet(unittest.TestCase):
    """The half that is measured first: a length the arguments already decide."""

    def test_a_fixed_decimal_conversion_is_refused_on_its_measured_length(self):
        # The discriminator between the two halves, and the reason it is here:
        # the measured length is a floor that leaves out the sign, so a negative
        # value's built string is one character longer than the measurement. The
        # number the refusal names says which of the two answered. Catches an
        # engine that builds the string and measures that, which is the whole of
        # what the page refuses: "measured before the string is built".
        found = bar(
            running(
                [
                    ["CONST", NEGATIVE],
                    ["CONST", THIRTY],
                    ["CALL_LIB", 0, 2, -1],
                    ["EMIT", 0],
                    ["HALT"],
                ],
                [TEXT],
            )
        )

        self.assertEqual(found.diagnostic.code, "OS5008")
        self.assertEqual(found.diagnostic.values["found"], fixed_length(-1.5, 30))
        self.assertEqual(len(fixed(-1.5, 30)), fixed_length(-1.5, 30) + 1)

    def test_a_repeat_no_engine_could_hold_is_reported_and_not_allocated(self):
        # A million million characters. An engine that built the string first
        # would not answer this test at all: it would take the process down or
        # leave it swapping, which is the failure the measurement exists to turn
        # into a diagnostic. It answers in microseconds because the length is
        # arithmetic on two arguments.
        found = bar(
            running(
                [
                    ["CONST", PAIR],
                    ["CONST", ENORMOUS],
                    ["CALL_LIB", 0, 2, -1],
                    ["EMIT", 0],
                    ["HALT"],
                ],
                [REPEAT],
            )
        )

        self.assertEqual(found.diagnostic.code, "OS5008")
        self.assertEqual(found.diagnostic.values["found"], 2_000_000_000_000)


class WhatTheSeamAnswers(unittest.TestCase):
    """The library's own half of it, asked directly.

    The ceiling is the engine's to spend and nothing in the library raises, so
    the two meet at one question: how long will this call's string be. A name the
    library cannot answer for is absence, and absence is not zero: an engine
    reading it as a length would refuse every call in the manifest.
    """

    def test_the_two_measured_calls_answer_their_length(self):
        serving = Serving()

        self.assertEqual(serving.length_of("str.repeat", ["ab", 100.0]), 200)
        self.assertEqual(serving.length_of("text", [-1.5, 30.0]), fixed_length(-1.5, 30))

    def test_every_other_call_answers_absence_rather_than_a_length(self):
        serving = Serving()

        self.assertIsNone(serving.length_of("str.upper", ["ab"]))
        self.assertIsNone(serving.length_of("str.repeat", ["ab"]))
        self.assertIsNone(serving.length_of("chart.symbol", []))

    def test_a_measured_call_whose_arguments_build_nothing_answers_absence(self):
        # A call answering absence builds no string, so there is no length to
        # compare and no refusal to raise. Catches a measurement that reads an
        # absent argument as a zero and refuses, or crashes, on a warmup bar.
        serving = Serving()

        self.assertIsNone(serving.length_of("str.repeat", [None, 100.0]))
        self.assertIsNone(serving.length_of("text", [None, 30.0]))


class TheTwoEnginesChooseOneNumber(unittest.TestCase):
    """The ceiling is nobody's to choose alone, though no document fixes it.

    ``errors.md`` OS5008 states that there is a ceiling and carries it in the
    message, and leaves the number to the engine: a host that sets one accepts
    that a script refused there runs elsewhere. That freedom stops where two
    engines are compared, because a case reaching the ceiling is refused by one
    of them and run by the other, and ``conformance.md`` section 10 calls a
    difference on a channel both answer a release blocker. So the two numbers are
    one number, and this is what says so rather than a sentence hoping so.

    The table in ``scripts/check-limits.mjs`` is where this belongs: it already
    lists the first engine's host ceilings with the reason each is the host's and
    does not know this engine exists. It is here because that table is not this
    stage's to edit, and the change it wants is reported rather than made.
    """

    #: Where the first engine's defaults are written, and the line to read.
    OTHER = ("src", "core", "engine", "budget.ts")
    STATED = r"stringLength: ([\d_]+)"

    def test_the_ceiling_is_the_one_the_first_engine_refuses_at(self):
        source = support.REPOSITORY.joinpath(*self.OTHER).read_text(encoding="utf-8")
        found = re.search(self.STATED, source)

        self.assertIsNotNone(
            found,
            f"{'/'.join(self.OTHER)} no longer states a string ceiling where this reads one. "
            "The number still has to be the same in both engines; find where it moved to.",
        )
        self.assertEqual(
            int(found.group(1).replace("_", "")),
            EngineLimits().string_length,
            "the two engines refuse a long string at different lengths, so a case that reaches "
            "either is answered with OS5008 by one of them and with a value by the other",
        )


class WhatIsNotAStringThisBarGrew(unittest.TestCase):
    """A fact the host stated is not measured, which is the other engine's rule.

    The first engine applies the ceiling inside the library calls that build a
    string, and the ``chart`` namespace is not one of them: a symbol the host
    stated comes back whole however long it is. This engine applies it at the
    seam instead, so the same boundary has to be drawn here, and it is drawn
    where the two coincide: a call of no arguments answers a fact rather than a
    string a bar grew. Hand a long symbol to a call that does build a string,
    ``text`` or ``str.upper``, and both engines refuse it.
    """

    def test_a_host_fact_past_the_ceiling_is_answered_rather_than_refused(self):
        run = running(
            [["CALL_LIB", 0, 0, -1], ["EMIT", 0], ["HALT"]],
            [{"name": "chart.symbol", "arity": 0, "state": False, "effect": "none"}],
            channels=[channel(0, kind="string")],
        )

        found = run.execute_bar(
            0,
            support.flat(100.0),
            support.confirmed(),
            supplied=1,
            instrument={"symbol": "A" * (CEILING * 4)},
        )

        self.assertTrue(found.ok, msg=str(found.diagnostic))
        self.assertEqual(len(found.columns[0]), CEILING * 4)


if __name__ == "__main__":
    unittest.main()
