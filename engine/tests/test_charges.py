"""What a fill costs, and the four places a cost model loses money quietly.

- **Rounding.** One rounding per fill total, half to even. Rounded per line, two
  engines rounding in two places disagree in the last bit, which is a failed
  conformance comparison months later on somebody else's engine. Away from zero,
  every exact half goes up and the bias grows with the length of the backtest.
- **Order.** The lines are applied in the order they are declared and a line
  levied on charges may only name lines declared before it, so a schedule has
  exactly one evaluation order. Two engines that disagree about it disagree about
  the money and both are defensible.
- **Sides.** A line that does not apply to this side is not in the breakdown at
  all, so a later line levied on its name is levied on nothing, which is exactly
  what a tax on one side of the trade does. A name beside a zero would read as a
  charge that was levied and came to nothing.
- **What is refused before the first bar.** A schedule in another currency, one
  rounding to other digits, and a slippage in ticks with no tick to measure it in
  all produce a number nobody can explain, and a backtest that silently charges
  nothing lies in the strategy's favour.
"""

import unittest

from openscript.accounting import (
    ChargeLine,
    ChargeSchedule,
    Contract,
    RecordedFill,
    charge_for,
    round_money,
    schedule_from_declaration,
    schedule_problem,
)


def fill(units=10.0, price=100.0, side="buy"):
    return RecordedFill(
        seq=1,
        intent_id=1,
        order_ref="",
        tag="",
        position_ref=1,
        side=side,
        units=units,
        price=price,
        bar_index=0,
        bar_time=0.0,
        ref_size_before=0.0,
        ref_size_after=units,
    )


CONTRACT = Contract(currency="CUR", tick_size=0.05, point_value=1.0, digits=2)


def schedule(*lines, **changed):
    stated = dict(currency="CUR", digits=2, slippage_ticks=0.0, source="supplied")
    stated.update(changed)
    return ChargeSchedule(lines=tuple(lines), **stated)


class Rounding(unittest.TestCase):
    def test_a_half_goes_to_the_even_neighbour(self):
        self.assertEqual(round_money(2.5, 0), 2.0)
        self.assertEqual(round_money(3.5, 0), 4.0)
        self.assertEqual(round_money(0.125, 2), 0.12)
        self.assertEqual(round_money(0.375, 2), 0.38)

    def test_a_negative_half_goes_the_same_way(self):
        self.assertEqual(round_money(-2.5, 0), -2.0)
        self.assertEqual(round_money(-3.5, 0), -4.0)

    def test_a_result_of_zero_carries_no_sign(self):
        # A negative zero is the same money as a zero and a different set of bytes,
        # and the difference survives being written down.
        self.assertEqual(str(round_money(-0.001, 2)), "0.0")

    def test_a_digit_count_it_cannot_round_by_leaves_the_amount_alone(self):
        self.assertEqual(round_money(1.234, -1), 1.234)
        self.assertEqual(round_money(1.234, 99), 1.234)

    def test_the_total_is_rounded_once_and_not_the_lines(self):
        # Two lines at a third of a unit each: rounded per line the total is two
        # hundredths under, and a reader adding the printed lines up lands there.
        lines = (
            ChargeLine(name="one", base="order", rate=0.005),
            ChargeLine(name="two", base="order", rate=0.005),
        )
        charged = charge_for(schedule(*lines), fill(), CONTRACT)
        self.assertEqual(charged.total, 0.01)
        self.assertEqual(tuple(amount for _name, amount in charged.lines), (0.005, 0.005))


class TheBases(unittest.TestCase):
    def test_turnover_is_units_times_price_times_the_point_value(self):
        line = ChargeLine(name="tax", base="turnover", rate=0.001)
        self.assertEqual(charge_for(schedule(line), fill(10, 100.0), CONTRACT).total, 1.0)

    def test_a_point_value_multiplies_the_turnover(self):
        line = ChargeLine(name="tax", base="turnover", rate=0.001)
        contract = Contract(currency="CUR", point_value=50.0, digits=2)
        self.assertEqual(charge_for(schedule(line), fill(10, 100.0), contract).total, 50.0)

    def test_units_is_money_per_unit_and_order_is_money_per_fill(self):
        per_unit = ChargeLine(name="c", base="units", rate=0.25)
        per_fill = ChargeLine(name="c", base="order", rate=20.0)
        self.assertEqual(charge_for(schedule(per_unit), fill(10), CONTRACT).total, 2.5)
        self.assertEqual(charge_for(schedule(per_fill), fill(10), CONTRACT).total, 20.0)

    def test_charges_is_a_fraction_of_the_lines_named_before_it(self):
        lines = (
            ChargeLine(name="brokerage", base="order", rate=20.0),
            ChargeLine(name="levy", base="charges", rate=0.18, of=("brokerage",)),
        )
        self.assertEqual(charge_for(schedule(*lines), fill(), CONTRACT).total, 23.6)


class TheSides(unittest.TestCase):
    def test_a_line_on_the_other_side_is_absent_from_the_breakdown(self):
        line = ChargeLine(name="tax", base="order", rate=5.0, side="sell")
        charged = charge_for(schedule(line), fill(side="buy"), CONTRACT)
        self.assertEqual(charged.lines, ())
        self.assertEqual(charged.total, 0.0)

    def test_a_levy_on_a_line_that_did_not_apply_is_levied_on_nothing(self):
        lines = (
            ChargeLine(name="tax", base="order", rate=5.0, side="sell"),
            ChargeLine(name="levy", base="charges", rate=0.5, of=("tax",)),
        )
        self.assertEqual(charge_for(schedule(*lines), fill(side="buy"), CONTRACT).total, 0.0)


class TheBounds(unittest.TestCase):
    def test_a_floor_is_applied_per_application(self):
        line = ChargeLine(name="c", base="turnover", rate=0.0001, min=20.0)
        self.assertEqual(charge_for(schedule(line), fill(1, 100.0), CONTRACT).total, 20.0)

    def test_a_cap_is_applied_per_application(self):
        line = ChargeLine(name="c", base="turnover", rate=0.01, max=20.0)
        self.assertEqual(charge_for(schedule(line), fill(100, 100.0), CONTRACT).total, 20.0)


class TheDeclarationsOwnSchedule(unittest.TestCase):
    def test_each_spelling_is_the_line_it_means(self):
        flat = schedule_from_declaration(20.0, "perTrade", 0.0, "CUR", 2)
        unit = schedule_from_declaration(0.25, "perUnit", 0.0, "CUR", 2)
        share = schedule_from_declaration(0.03, "percent", 0.0, "CUR", 2)
        self.assertEqual(flat.lines[0].base, "order")
        self.assertEqual(unit.lines[0].base, "units")
        self.assertEqual(share.lines[0].base, "turnover")
        self.assertEqual(share.lines[0].rate, 0.0003)

    def test_a_flat_fee_is_charged_per_fill_so_a_round_trip_is_charged_twice(self):
        flat = schedule_from_declaration(20.0, "perTrade", 0.0, "CUR", 2)
        entry = charge_for(flat, fill(side="buy"), CONTRACT).total
        exiting = charge_for(flat, fill(side="sell"), CONTRACT).total
        self.assertEqual(entry + exiting, 40.0)

    def test_a_commission_of_zero_is_no_line_at_all(self):
        # A zero line would put a name in every breakdown and would make a
        # declaration that states no commission indistinguishable from one that
        # states a commission.
        self.assertEqual(schedule_from_declaration(0.0, "perTrade", 0.0, "CUR", 2).lines, ())


class WhatIsRefusedBeforeTheFirstBar(unittest.TestCase):
    def test_a_schedule_in_another_currency(self):
        self.assertIsNotNone(schedule_problem(schedule(currency="OTH"), CONTRACT))

    def test_a_schedule_rounding_to_other_digits(self):
        self.assertIsNotNone(schedule_problem(schedule(digits=4), CONTRACT))

    def test_a_schedule_naming_no_currency(self):
        self.assertIsNotNone(schedule_problem(schedule(currency="  ")))

    def test_a_slippage_with_no_tick_to_measure_it_in(self):
        contract = Contract(currency="CUR", tick_size=None, digits=2)
        self.assertIsNotNone(schedule_problem(schedule(slippage_ticks=1.0), contract))
        self.assertIsNone(schedule_problem(schedule(slippage_ticks=1.0), CONTRACT))

    def test_a_negative_slippage(self):
        self.assertIsNotNone(schedule_problem(schedule(slippage_ticks=-1.0), CONTRACT))

    def test_a_rate_that_gives_money_back(self):
        line = ChargeLine(name="c", base="order", rate=-1.0)
        self.assertIsNotNone(schedule_problem(schedule(line), CONTRACT))

    def test_a_floor_above_its_cap(self):
        line = ChargeLine(name="c", base="order", rate=1.0, min=10.0, max=5.0)
        self.assertIsNotNone(schedule_problem(schedule(line), CONTRACT))

    def test_two_lines_sharing_a_name(self):
        lines = (ChargeLine(name="c", base="order"), ChargeLine(name="c", base="order"))
        self.assertIsNotNone(schedule_problem(schedule(*lines), CONTRACT))

    def test_a_levy_naming_a_line_declared_after_it(self):
        lines = (
            ChargeLine(name="levy", base="charges", rate=0.1, of=("brokerage",)),
            ChargeLine(name="brokerage", base="order", rate=20.0),
        )
        self.assertIsNotNone(schedule_problem(schedule(*lines), CONTRACT))

    def test_a_levy_naming_itself(self):
        line = ChargeLine(name="levy", base="charges", rate=0.1, of=("levy",))
        self.assertIsNotNone(schedule_problem(schedule(line), CONTRACT))

    def test_a_levy_naming_one_line_twice(self):
        lines = (
            ChargeLine(name="brokerage", base="order", rate=20.0),
            ChargeLine(name="levy", base="charges", rate=0.1, of=("brokerage", "brokerage")),
        )
        self.assertIsNotNone(schedule_problem(schedule(*lines), CONTRACT))

    def test_a_levy_naming_nothing(self):
        line = ChargeLine(name="levy", base="charges", rate=0.1)
        self.assertIsNotNone(schedule_problem(schedule(line), CONTRACT))

    def test_names_on_a_line_that_is_not_levied_on_charges(self):
        lines = (
            ChargeLine(name="brokerage", base="order", rate=20.0),
            ChargeLine(name="other", base="order", rate=1.0, of=("brokerage",)),
        )
        self.assertIsNotNone(schedule_problem(schedule(*lines), CONTRACT))

    def test_a_schedule_with_nothing_wrong_with_it(self):
        lines = (
            ChargeLine(name="brokerage", base="order", rate=20.0, max=20.0),
            ChargeLine(name="levy", base="charges", rate=0.18, of=("brokerage",)),
        )
        self.assertIsNone(schedule_problem(schedule(*lines), CONTRACT))


if __name__ == "__main__":
    unittest.main()
