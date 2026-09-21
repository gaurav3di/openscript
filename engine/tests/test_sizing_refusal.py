"""A quantity in a unit this destination cannot fill is refused before the first bar.

The first engine asks four questions of a run's settings before it executes a
bar, and this engine asked two. So a strategy sizing in lots against an
instrument that states no lot size was refused OS6021 by one engine and run to a
full ledger by the other: a difference on the diagnostics channel, which
`conformance.md` section 10 calls a release blocker rather than a nuisance.

What makes it worth refusing rather than guessing is that the guess is a
position size. A lot with no lot size has nothing to convert into, and a
quantity in any other unit would have to be sized against a running equity a
backtest works out none of. An engine that picked one would produce a ledger
nobody could explain afterwards, and it would look like a result.

The fourth question, about the comparison tolerance, is asked in
``matching.tolerance_from`` where the tolerance is read, and more strictly than
the first engine asks it. Asking it here as well would be the same rule in two
places, and the two would drift.
"""

import unittest

from openscript.accounting import Contract
from openscript.adapter.reporting import settings_problem


def sizing(**declared):
    """A declaration with no cost model, so only the sizing question can answer."""
    return {"commission": 0, "commissionType": "perTrade", **declared}


class SizingRefusal(unittest.TestCase):
    def test_lots_against_an_instrument_with_no_lot_size_is_refused(self) -> None:
        # The difference the build's verifier reproduced: one engine refused,
        # the other ran to a full ledger.
        refused = settings_problem(None, sizing(qtyType="lots"), Contract(lot_size=None))

        self.assertIsNotNone(refused)
        self.assertEqual(refused.code, "OS6021")
        self.assertIn("lot size", refused.values["problem"])

    def test_a_lot_size_of_zero_is_no_lot_size(self) -> None:
        # Catches a check written as "is it stated" rather than "can it convert":
        # dividing by zero lots is not a smaller order, it is not an order.
        refused = settings_problem(None, sizing(qtyType="lots"), Contract(lot_size=0))

        self.assertIsNotNone(refused)
        self.assertEqual(refused.code, "OS6021")

    def test_lots_against_an_instrument_that_states_one_is_allowed(self) -> None:
        self.assertIsNone(settings_problem(None, sizing(qtyType="lots"), Contract(lot_size=65)))

    def test_units_is_always_allowed_because_a_backtest_fills_in_units(self) -> None:
        self.assertIsNone(settings_problem(None, sizing(qtyType="units"), Contract(lot_size=None)))
        self.assertIsNone(settings_problem(None, sizing(qtyType=""), Contract(lot_size=None)))

    def test_any_other_unit_is_refused_and_says_which_two_work(self) -> None:
        # A quantity in cash or in a fraction of equity needs a running equity to
        # size against, and a backtest works out none. The refusal names the two
        # units that do work, because a refusal a reader cannot act on is a
        # badly designed error.
        for stated in ("cash", "percentOfEquity", "risk"):
            with self.subTest(stated):
                refused = settings_problem(None, sizing(qtyType=stated), Contract(lot_size=65))

                self.assertIsNotNone(refused)
                self.assertEqual(refused.code, "OS6021")
                self.assertIn(stated, refused.values["setting"])
                self.assertIn("units or in lots", refused.values["problem"])

    def test_the_cost_model_question_is_still_asked_first(self) -> None:
        # Order matters: a run stating two cost models AND an unfillable unit
        # should hear about the cost models, because that is the one the reader
        # states themselves. Catches a sizing check bolted on above the others.
        from openscript.accounting import ChargeLine, ChargeSchedule

        supplied = ChargeSchedule(
            currency="CUR",
            digits=2,
            lines=(ChargeLine(name="fee", base="order", rate=50),),
            source="supplied",
        )
        declared = {"commission": 20, "commissionType": "perTrade", "qtyType": "cash"}

        refused = settings_problem(supplied, declared, Contract(lot_size=None))

        self.assertEqual(refused.code, "OS6023")


if __name__ == "__main__":
    unittest.main()
