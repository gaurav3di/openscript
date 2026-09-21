"""One instruction at a time, and the rule each one has for absence.

Every case here is a program of a few instructions, run for one bar, with its
answer emitted to a channel. That is more machinery than a unit test of a
function would need and it is the point: these are the rules as the machine
applies them, through the dispatch, the stack and the verifier, rather than as
the helpers next door state them.

The wrong implementations these catch are the ones the specification names.
Division by zero returning an infinity rather than absence. A modulo whose sign
follows the divisor, which is what this interpreter's own operator does. An
overflow checked at the end of an expression rather than after each operation.
And a short circuit that is an engine's choice rather than an instruction, which
two engines would make differently and disagree about every stateful call inside
a condition.

The instructions that address a table of their own, the registers, the arrays,
the loops and the calls, are next door in ``test_calls.py``: they need a program
with that table in it, and the two halves of this file were one file over the
length a file here may be.
"""

import unittest

from tests.support import POOL, Library, answer, channel, confirmed, flat, program

from openscript.contracts import LibraryEntry
from openscript.run import load
from openscript.values import ABSENT
from openscript.verify import capabilities


class Arithmetic(unittest.TestCase):
    def test_a_sum_is_a_sum(self):
        self.assertEqual(answer([["CONST", 5], ["CONST", 6]] + [["ADD"]]), 5.0)

    def test_every_operator_propagates_absence(self):
        for opcode in ("ADD", "SUB", "MUL", "DIV", "MOD"):
            with self.subTest(opcode=opcode):
                self.assertIs(answer([["CONST", 0], ["CONST", 5], [opcode]]), ABSENT)
                self.assertIs(answer([["CONST", 5], ["CONST", 0], [opcode]]), ABSENT)
        self.assertIs(answer([["CONST", 0], ["NEG"]]), ABSENT)

    def test_a_division_by_zero_is_absent_and_not_an_infinity(self):
        self.assertIs(answer([["CONST", 4], ["CONST", 3], ["DIV"]]), ABSENT)
        self.assertIs(answer([["CONST", 3], ["CONST", 3], ["DIV"]]), ABSENT)

    def test_a_modulo_by_zero_is_absent(self):
        self.assertIs(answer([["CONST", 4], ["CONST", 3], ["MOD"]]), ABSENT)

    def test_a_remainder_takes_its_sign_from_the_left_operand(self):
        # The one this interpreter gets wrong by default: its own operator
        # follows the divisor, so -1 % 3 is 2 rather than the -1 the format
        # requires of truncated division.
        self.assertEqual(answer([["CONST", 11], ["CONST", 6], ["MOD"]]), -1.0)

    def test_an_overflow_is_checked_after_each_operation(self):
        # (1e308 * 10) / 10 is absent and not 1e307: an engine that checked at
        # the end of the expression would answer the finite number.
        self.assertIs(
            answer([["CONST", 10], ["CONST", 7], ["MUL"], ["CONST", 7], ["DIV"]]), ABSENT
        )

    def test_two_strings_concatenate_and_a_mixed_pair_does_not(self):
        self.assertEqual(answer([["CONST", 8], ["CONST", 9], ["ADD"]]), "ab")
        self.assertIs(answer([["CONST", 8], ["CONST", 4], ["ADD"]]), ABSENT)


class Comparison(unittest.TestCase):
    def test_ordering_propagates_absence(self):
        for opcode in ("LT", "LE", "GT", "GE"):
            with self.subTest(opcode=opcode):
                self.assertIs(answer([["CONST", 0], ["CONST", 4], [opcode]]), ABSENT)

    def test_equality_is_total(self):
        self.assertIs(answer([["CONST", 0], ["CONST", 0], ["EQ"]]), True)
        self.assertIs(answer([["CONST", 0], ["CONST", 3], ["EQ"]]), False)
        self.assertIs(answer([["CONST", 0], ["CONST", 0], ["NE"]]), False)

    def test_the_four_orderings_answer_what_they_say(self):
        self.assertIs(answer([["CONST", 4], ["CONST", 5], ["LT"]]), True)
        self.assertIs(answer([["CONST", 5], ["CONST", 5], ["LE"]]), True)
        self.assertIs(answer([["CONST", 5], ["CONST", 4], ["GT"]]), True)
        self.assertIs(answer([["CONST", 4], ["CONST", 5], ["GE"]]), False)


class TheShortCircuitIsAnInstruction(unittest.TestCase):
    """Whether the right operand runs is observable, so it is not an engine's choice."""

    def setUp(self):
        self.library = Library(
            {"seen": LibraryEntry("seen", 1, False, "none")},
            {"seen": lambda arguments, state, context: arguments[0]},
        )

    def _both(self, left, right):
        """``a and b`` and ``a or b`` as section 4.7 compiles them, with b counted."""
        outcomes = {}
        for opcode, short in (("AND", "AND_SHORT"), ("OR", "OR_SHORT")):
            self.library.calls.clear()
            # The short circuit jumps past the combining instruction, to the
            # EMIT the helper appends, leaving the deciding value in place.
            code = [
                left,
                [short, 5],
                right,
                ["CALL_LIB", 0, 1, -1],
                [opcode],
            ]
            held = answer(
                code,
                library=self.library,
                lib={"manifest": 1, "functions": [
                    {"name": "seen", "arity": 1, "state": False, "effect": "none"}
                ]},
            )
            outcomes[opcode] = (held, len(self.library.calls))
        return outcomes

    def test_a_false_left_operand_skips_the_right_of_an_and(self):
        held, calls = self._both(["CONST", 1], ["CONST", 2])["AND"]
        self.assertIs(held, False)
        self.assertEqual(calls, 0)

    def test_a_true_left_operand_skips_the_right_of_an_or(self):
        held, calls = self._both(["CONST", 2], ["CONST", 1])["OR"]
        self.assertIs(held, True)
        self.assertEqual(calls, 0)

    def test_an_absent_left_operand_short_circuits_neither(self):
        # The other side can still decide: a false on the right of an and and a
        # true on the right of an or fix the answer whatever the absent operand
        # would have held. So the right operand runs, which the count proves.
        outcomes = self._both(["CONST", 0], ["CONST", 1])
        self.assertIs(outcomes["AND"][0], False)
        self.assertEqual(outcomes["AND"][1], 1)
        outcomes = self._both(["CONST", 0], ["CONST", 2])
        self.assertIs(outcomes["OR"][0], True)
        self.assertEqual(outcomes["OR"][1], 1)

    def test_the_operators_are_commutative_as_the_page_requires(self):
        entries = {"absent": 0, "false": 1, "true": 2}
        for left in entries.values():
            for right in entries.values():
                with self.subTest(left=left, right=right):
                    one = self._both(["CONST", left], ["CONST", right])
                    other = self._both(["CONST", right], ["CONST", left])
                    self.assertIs(one["AND"][0], other["AND"][0])
                    self.assertIs(one["OR"][0], other["OR"][0])


class Branching(unittest.TestCase):
    def test_a_branch_treats_absence_as_false(self):
        # 0: the condition, 1: the branch, 2: the true arm, 3: jump past,
        # 4: the false arm, 5: the EMIT the helper appends.
        code = [
            ["CONST", 0],
            ["JUMP_FALSE", 4],
            ["CONST", 4],
            ["JUMP", 5],
            ["CONST", 5],
        ]
        self.assertEqual(answer(code), 2.0)

    def test_a_true_condition_falls_through(self):
        code = [
            ["CONST", 2],
            ["JUMP_FALSE", 4],
            ["CONST", 4],
            ["JUMP", 5],
            ["CONST", 5],
        ]
        self.assertEqual(answer(code), 1.0)


class Channels(unittest.TestCase):
    def test_the_last_write_on_a_bar_wins(self):
        built = program(
            [["CONST", 4], ["EMIT", 0], ["CONST", 5], ["EMIT", 0], ["HALT"]],
            consts=list(POOL),
            channels=[channel(0)],
        )
        result = load(built, {}, None, capabilities=capabilities())
        out = result.run.execute_bar(0, flat(1.0), confirmed())
        self.assertEqual(out.columns[0], 2.0)

    def test_a_channel_nothing_wrote_is_absent(self):
        built = program(
            [["HALT"]], consts=list(POOL), channels=[channel(0), channel(1)]
        )
        result = load(built, {}, None, capabilities=capabilities())
        out = result.run.execute_bar(0, flat(1.0), confirmed())
        self.assertEqual(out.columns, [ABSENT, ABSENT])


if __name__ == "__main__":
    unittest.main()
