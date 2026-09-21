"""A supplied charge schedule is carried whole, lines and all.

`conformance.md` section 3 says a case's ``costs`` is "the charge schedule the
host supplied, **whole and as the host stated it**", and whole is the word this
file exists for. The lines are the schedule: a currency and a digit count with
no lines charge nothing, which is not a cheaper run, it is a different one.

The failure this catches was real and it was silent. The adapter built the
schedule with ``lines=()``, so the second engine charged zero where the first
charged the full amount, and it did so in the strategy's favour, which is the
direction nobody reads a report to check. Both cases in the suite state
``costs: null``, so every comparison between the two engines agreed, and the
agreement was a coincidence rather than a result.

The test-side reader had the same line, so a test written against it would have
agreed with the defect. There is one reader now, and it is the adapter's.
"""

import unittest

from openscript.adapter.reporting import line_of, schedule_lines


ONE_LINE = {
    "currency": "CUR",
    "digits": 2,
    "slippageTicks": 0.0,
    "lines": [{"name": "fee", "base": "order", "side": "both", "rate": 50}],
}


class SuppliedSchedule(unittest.TestCase):
    def test_a_line_the_host_stated_reaches_the_schedule(self) -> None:
        # Catches lines=(), which is what this was.
        lines = schedule_lines(ONE_LINE)
        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0].name, "fee")
        self.assertEqual(lines[0].base, "order")
        self.assertEqual(lines[0].rate, 50)

    def test_every_line_reaches_it_in_the_order_the_host_stated(self) -> None:
        # Order is part of the result: a line whose base is ``charges`` is a
        # fraction of the lines named before it, so a reordering is a different
        # amount of money. Catches a reader that collects lines into a set or a
        # mapping keyed by name.
        stated = {
            **ONE_LINE,
            "lines": [
                {"name": "brokerage", "base": "turnover", "rate": 0.0003},
                {"name": "tax", "base": "charges", "of": ["brokerage"], "rate": 0.18},
            ],
        }

        lines = schedule_lines(stated)

        self.assertEqual([one.name for one in lines], ["brokerage", "tax"])
        self.assertEqual(lines[1].of, ("brokerage",))

    def test_a_schedule_stating_no_lines_is_empty_rather_than_a_failure(self) -> None:
        # A host may supply a schedule that only sets slippage.
        self.assertEqual(schedule_lines({**ONE_LINE, "lines": []}), ())
        self.assertEqual(schedule_lines({"currency": "CUR", "digits": 2}), ())

    def test_a_bound_the_host_did_not_state_stays_absent(self) -> None:
        # A floor of zero and no floor are different rules: a line with a floor
        # of zero charges every fill at least nothing, which reads the same and
        # is not, because the engine that applies a bound rounds against it.
        line = line_of({"name": "fee", "base": "order", "rate": 50})

        self.assertIsNone(line.min)
        self.assertIsNone(line.max)
        self.assertEqual(line.side, "both", "a side the host left out is both")

    def test_a_bound_the_host_did_state_is_carried(self) -> None:
        line = line_of(
            {"name": "fee", "base": "turnover", "side": "sell", "rate": 0.001, "min": 2, "max": 20}
        )

        self.assertEqual(line.side, "sell")
        self.assertEqual(line.min, 2)
        self.assertEqual(line.max, 20)


if __name__ == "__main__":
    unittest.main()
