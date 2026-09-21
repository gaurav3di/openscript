"""Every strategy case in the suite, folded by this engine and compared exactly.

This is the one test of this stage that is not written by whoever wrote the code.
``cases/`` holds runs the first engine produced, reviewed and committed: the bars,
the destination's own frames, the ledger those frames folded into, the trades and
the summary. The fold, the cost model and the statistics here are written from
``stdlib.md`` 17 and ``host-interface.md`` 7 rather than from that engine's
source, so reproducing a case bit for bit is two engines agreeing about the same
pages, which is what Phase 6's gate asks for.

**Exactly, and not nearly.** ``conformance.md`` section 6 says the default is
exact and that a cross-engine comparison is always exact, and every case in the
suite declares a tolerance of zero. So the comparison below is equality on the
values as they are read back, and a figure that differs in the last bit fails.
Nothing here reaches a gap of ``stdlib.md`` 20.11: the harvest refuses a script
that asserts a value which does, by name, and the money is addition,
multiplication and one division per figure.

**What this does not prove**, said here rather than discovered. The calls are
reconstructed from the case rather than executed, because the interpreter and the
library are other stages: what is under test is everything from the call onwards,
which is this stage. When the two halves meet, the same expected files are what
the whole engine is held to, and this test is what will have already settled the
half it covers.
"""

import unittest

from tests.recorded import read_case, strategy_cases
from tests.replaying import (
    capital_of,
    contract_for,
    marks_for,
    recorded_orders,
    recorded_summary,
    recorded_trade,
    replay,
    schedule_for,
)

from openscript.accounting import report_of

#: The cases this stage answers for, read from the suite rather than listed.
FOLDED = strategy_cases()


class TheSuiteHoldsCasesToRunAgainst(unittest.TestCase):
    def test_the_suite_holds_at_least_one_case_that_asserts_a_ledger(self):
        # A discovery that found nothing passes every assertion below without
        # running one, which is the evidence of agreement with no agreement behind
        # it. The engine's own runner refuses a run of no tests for the same reason.
        self.assertNotEqual(FOLDED, ())


class EveryStrategyCase(unittest.TestCase):
    def report_for(self, identifier):
        case = read_case(identifier)
        replayed = replay(case)
        return case, replayed, report_of(
            replayed.fills.settled(),
            marks_for(case),
            schedule_for(case),
            contract_for(case),
            capital_of(case),
        )

    def test_no_call_of_a_replayed_case_is_refused(self):
        # A refusal would mean the reconstruction placed an order the run did not,
        # and every comparison after it would be about a different run.
        for identifier in FOLDED:
            with self.subTest(identifier):
                _case, replayed, _report = self.report_for(identifier)
                self.assertEqual(replayed.refusals, ())

    def test_the_ledger_is_the_recorded_ledger(self):
        # Every field of every row: the ordinal the intent took, the position it
        # was sent against, the status the frames folded it to, the cumulative
        # quantity, the destination's average and its own reference.
        for identifier in FOLDED:
            with self.subTest(identifier):
                case, replayed, _report = self.report_for(identifier)
                self.assertEqual(list(recorded_orders(replayed)), case.expected["orders"])

    def test_the_trades_are_the_recorded_trades(self):
        for identifier in FOLDED:
            with self.subTest(identifier):
                case, _replayed, report = self.report_for(identifier)
                folded = [recorded_trade(trade) for trade in report.trades]
                self.assertEqual(folded, case.expected["trades"])

    def test_the_summary_is_the_recorded_summary(self):
        for identifier in FOLDED:
            with self.subTest(identifier):
                case, _replayed, report = self.report_for(identifier)
                self.assertEqual(
                    [recorded_summary(report.summary)], case.expected["performance"]
                )

    def test_the_charges_of_the_trades_are_the_charges_of_the_summary(self):
        # An identity rather than a coincidence: a charge is rounded once for the
        # fill that incurred it and is attributed whole to one trade, so the two
        # add up exactly rather than nearly.
        for identifier in FOLDED:
            with self.subTest(identifier):
                _case, _replayed, report = self.report_for(identifier)
                self.assertEqual(
                    sum(trade.charges for trade in report.trades), report.summary.charges
                )

    def test_every_position_a_leg_held_came_back_to_zero_or_is_an_open_trade(self):
        # 17.7: every position a leg holds can be brought back to zero. A reference
        # nothing could ever close would be a leak in this record, and it would
        # show up here as a trade that never closed on a run that ended flat.
        for identifier in FOLDED:
            with self.subTest(identifier):
                _case, replayed, report = self.report_for(identifier)
                open_refs = {
                    trade.position_ref for trade in report.trades if trade.is_open
                }
                for row in replayed.rows:
                    if row.position_ref in open_refs:
                        continue
                    self.assertEqual(replayed.ledger.size_of(row.position_ref), 0, row.intent_id)


if __name__ == "__main__":
    unittest.main()
