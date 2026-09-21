"""The round trips a run's fills make up, and the summary counted over them.

**A trade is one position reference, from the fill that first takes it away from
zero to the fill that returns it to zero.** Everything awkward falls out of that,
and each of these tests is one of the awkward things and the invention it makes
unnecessary: a pyramided entry is more entry fills on one trade, a partial close
is an exit fill that does not close it, a flip is two references and therefore two
trades, and a destination that overfills takes a reference through zero and opens
a second trade on it at that fill's price.

**And the summary's defects are all one defect**: a figure counted over the wrong
half of a list that holds closed trades and open ones together. Net profit is over
the closed ones, or a run holding a winner reports as having lost money. Charges
are over every trade, because the money left the account whether or not the
position came back. The drawdown figures are over the curve and not over the
trades at all.
"""

import unittest

from openscript.accounting import (
    BarMark,
    Contract,
    RecordedFill,
    equity_over,
    open_on_bar,
    report_of,
    summary_of,
    trades_of,
)

CONTRACT = Contract(currency="CUR", point_value=1.0, digits=2)


def fills(*described):
    """Fills as the engine settles them: a reference, a side and the sizes either way."""
    made = []
    sizes = {}
    for at, one in enumerate(described):
        ref, side, units, price, bar = one
        before = sizes.get(ref, 0.0)
        after = before + (units if side == "buy" else -units)
        sizes[ref] = after
        made.append(
            RecordedFill(
                seq=at + 1,
                intent_id=at + 1,
                order_ref="",
                tag="",
                position_ref=ref,
                side=side,
                units=units,
                price=price,
                bar_index=bar,
                bar_time=float(bar),
                ref_size_before=before,
                ref_size_after=after,
            )
        )
    return tuple(made)


def marks(closes, first_reported=0):
    return tuple(
        BarMark(bar_index=at, time=float(at), close=close, in_report=at >= first_reported)
        for at, close in enumerate(closes)
    )


class WhatATradeIs(unittest.TestCase):
    def test_one_reference_from_zero_to_zero(self):
        settled = fills((1, "buy", 10, 100.0, 0), (1, "sell", 10, 110.0, 2))
        trades = trades_of(settled, [0.0, 0.0], marks([100.0, 105.0, 110.0]), CONTRACT)
        self.assertEqual(len(trades), 1)
        self.assertEqual((trades[0].side, trades[0].units), ("long", 10))
        self.assertEqual(trades[0].gross_profit, 100.0)
        self.assertEqual(trades[0].bars_held, 2)
        self.assertFalse(trades[0].is_open)

    def test_a_short_trade_makes_money_when_the_price_falls(self):
        settled = fills((1, "sell", 10, 110.0, 0), (1, "buy", 10, 100.0, 2))
        trades = trades_of(settled, [0.0, 0.0], marks([110.0, 105.0, 100.0]), CONTRACT)
        self.assertEqual(trades[0].side, "short")
        self.assertEqual(trades[0].gross_profit, 100.0)

    def test_a_pyramided_entry_is_more_entry_fills_on_one_trade(self):
        settled = fills(
            (1, "buy", 10, 100.0, 0), (1, "buy", 10, 120.0, 1), (1, "sell", 20, 130.0, 2)
        )
        trades = trades_of(settled, [0.0, 0.0, 0.0], marks([100.0, 120.0, 130.0]), CONTRACT)
        self.assertEqual(len(trades), 1)
        self.assertEqual(trades[0].entries, 2)
        self.assertEqual(trades[0].entry_price, 110.0)
        self.assertEqual(trades[0].units, 20)

    def test_a_partial_close_does_not_close_the_trade(self):
        settled = fills((1, "buy", 10, 100.0, 0), (1, "sell", 4, 110.0, 1))
        trades = trades_of(settled, [0.0, 0.0], marks([100.0, 110.0]), CONTRACT)
        self.assertTrue(trades[0].is_open)
        self.assertEqual(trades[0].exits, 1)
        # Over the units that have left, which is true rather than a zero standing
        # in for money the run has already made.
        self.assertEqual(trades[0].gross_profit, 40.0)

    def test_reducing_does_not_move_the_entry_price(self):
        settled = fills(
            (1, "buy", 10, 100.0, 0), (1, "sell", 4, 200.0, 1), (1, "sell", 6, 120.0, 2)
        )
        trades = trades_of(settled, [0.0, 0.0, 0.0], marks([100.0, 200.0, 120.0]), CONTRACT)
        self.assertEqual(trades[0].entry_price, 100.0)
        self.assertEqual(trades[0].exit_price, (4 * 200.0 + 6 * 120.0) / 10)

    def test_a_flip_is_two_references_and_therefore_two_trades(self):
        settled = fills(
            (1, "buy", 10, 100.0, 0), (1, "sell", 10, 110.0, 2), (2, "sell", 5, 110.0, 2)
        )
        trades = trades_of(settled, [0.0, 0.0, 0.0], marks([100.0, 105.0, 110.0]), CONTRACT)
        self.assertEqual(len(trades), 2)
        self.assertEqual((trades[0].side, trades[1].side), ("long", "short"))

    def test_a_destination_that_overfills_opens_the_other_side_on_the_same_reference(self):
        # A reference taken through zero rather than to it. A trade that ran from a
        # size to the other side of zero would report a quantity nothing was ever
        # entered at.
        settled = fills((1, "buy", 10, 100.0, 0), (1, "sell", 14, 110.0, 1))
        trades = trades_of(settled, [0.0, 0.0], marks([100.0, 110.0]), CONTRACT)
        self.assertEqual(len(trades), 2)
        self.assertFalse(trades[0].is_open)
        self.assertEqual(trades[1].side, "short")
        self.assertEqual(trades[1].entry_price, 110.0)
        self.assertEqual(trades[1].units, 4)
        # The whole of what was held left, not the part a subtraction that ignored
        # the crossing would have counted.
        self.assertEqual(trades[0].exits, 1)
        self.assertEqual(trades[0].gross_profit, 100.0)

    def test_a_trade_still_held_at_the_last_bar_is_open(self):
        settled = fills((1, "buy", 10, 100.0, 0))
        trades = trades_of(settled, [0.0], marks([100.0, 110.0]), CONTRACT)
        self.assertTrue(trades[0].is_open)
        self.assertIsNone(trades[0].closed_on_bar)
        self.assertIsNone(trades[0].bars_held)
        self.assertIsNone(trades[0].exit_price)


class WhereAChargeLands(unittest.TestCase):
    def test_a_charge_lands_whole_on_one_trade(self):
        settled = fills((1, "buy", 10, 100.0, 0), (1, "sell", 10, 110.0, 2))
        trades = trades_of(settled, [20.0, 20.0], marks([100.0, 105.0, 110.0]), CONTRACT)
        self.assertEqual(trades[0].charges, 40.0)
        self.assertEqual(trades[0].net_profit, 60.0)

    def test_the_trades_charges_add_up_to_the_fills(self):
        settled = fills(
            (1, "buy", 10, 100.0, 0), (1, "sell", 14, 110.0, 1), (2, "buy", 4, 120.0, 2)
        )
        charges = [20.0, 20.0, 20.0]
        trades = trades_of(settled, charges, marks([100.0, 110.0, 120.0]), CONTRACT)
        self.assertEqual(sum(trade.charges for trade in trades), sum(charges))

    def test_a_crossing_fill_pays_the_trade_it_closed(self):
        settled = fills((1, "buy", 10, 100.0, 0), (1, "sell", 14, 110.0, 1))
        trades = trades_of(settled, [20.0, 30.0], marks([100.0, 110.0]), CONTRACT)
        self.assertEqual(trades[0].charges, 50.0)
        self.assertEqual(trades[1].charges, 0.0)


class TheExcursions(unittest.TestCase):
    def test_they_are_taken_at_bar_closes_while_the_trade_is_open(self):
        settled = fills((1, "buy", 10, 100.0, 0), (1, "sell", 10, 100.0, 3))
        trades = trades_of(
            settled, [0.0, 0.0], marks([100.0, 130.0, 80.0, 100.0]), CONTRACT
        )
        self.assertEqual(trades[0].max_favourable, 300.0)
        self.assertEqual(trades[0].max_adverse, -200.0)

    def test_a_trade_opened_and_closed_inside_one_bar_is_marked_at_no_close(self):
        settled = fills((1, "buy", 10, 100.0, 1), (1, "sell", 10, 130.0, 1))
        trades = trades_of(settled, [0.0, 0.0], marks([100.0, 130.0]), CONTRACT)
        self.assertEqual((trades[0].max_favourable, trades[0].max_adverse), (0.0, 0.0))

    def test_a_bar_with_no_close_marks_nothing(self):
        # Marked at zero it would read as a total loss on every open position.
        settled = fills((1, "buy", 10, 100.0, 0))
        trades = trades_of(settled, [0.0], marks([100.0, None]), CONTRACT)
        self.assertEqual((trades[0].max_favourable, trades[0].max_adverse), (0.0, 0.0))


class TheCurve(unittest.TestCase):
    def test_a_trade_is_held_from_the_close_it_opened_on_to_the_one_before_its_close(self):
        settled = fills((1, "buy", 10, 100.0, 1), (1, "sell", 10, 110.0, 3))
        trades = trades_of(settled, [0.0, 0.0], marks([100.0] * 4), CONTRACT)
        self.assertFalse(open_on_bar(trades[0], 0))
        self.assertTrue(open_on_bar(trades[0], 1))
        self.assertTrue(open_on_bar(trades[0], 2))
        self.assertFalse(open_on_bar(trades[0], 3))

    def test_the_peak_starts_at_the_capital_so_a_run_down_from_its_first_bar_is_in_drawdown(self):
        settled = fills((1, "buy", 10, 100.0, 0))
        trades = trades_of(settled, [0.0], marks([90.0, 90.0]), CONTRACT)
        curve = equity_over(trades, marks([90.0, 90.0]), CONTRACT, 1000.0)
        self.assertLess(curve[0].drawdown, 0)

    def test_a_warmup_bar_is_swept_and_not_reported(self):
        # A trade opened before the window is already in the fold at the first
        # point, with its charges paid and its position marked.
        settled = fills((1, "buy", 10, 100.0, 0))
        held = marks([100.0, 110.0, 120.0], first_reported=2)
        trades = trades_of(settled, [20.0], held, CONTRACT)
        curve = equity_over(trades, held, CONTRACT, 1000.0)
        self.assertEqual(len(curve), 1)
        self.assertEqual(curve[0].charges, 20.0)
        self.assertEqual(curve[0].open_profit, 200.0)

    def test_the_last_point_carries_every_charge_and_every_realised_gross(self):
        settled = fills((1, "buy", 10, 100.0, 0), (1, "sell", 10, 110.0, 2))
        held = marks([100.0, 105.0, 110.0])
        trades = trades_of(settled, [20.0, 20.0], held, CONTRACT)
        curve = equity_over(trades, held, CONTRACT, 1000.0)
        self.assertEqual(curve[-1].charges, 40.0)
        self.assertEqual(curve[-1].realised, 100.0)
        self.assertEqual(curve[-1].equity, 1000.0 + 100.0 - 40.0)


class TheSummary(unittest.TestCase):
    def summary_for(self, settled, charges, closes, capital=1000.0):
        held = marks(closes)
        trades = trades_of(settled, charges, held, CONTRACT)
        curve = equity_over(trades, held, CONTRACT, capital)
        return summary_of(trades, curve, CONTRACT, capital), trades

    def test_a_win_and_a_loss_are_decided_on_net_after_charges(self):
        settled = fills(
            (1, "buy", 10, 100.0, 0),
            (1, "sell", 10, 101.0, 1),
            (2, "buy", 10, 100.0, 2),
            (2, "sell", 10, 90.0, 3),
        )
        summary, _ = self.summary_for(settled, [20.0, 20.0, 20.0, 20.0], [100.0] * 4)
        # The first trade made ten gross and paid forty, so it is a loss carrying a
        # positive gross, which is what lowers the gross loss figure.
        self.assertEqual((summary.wins, summary.losses), (0, 2))
        self.assertEqual(summary.gross_loss, -(10.0) + 100.0)

    def test_a_trade_whose_net_is_exactly_zero_is_a_scratch_in_neither_half(self):
        settled = fills((1, "buy", 10, 100.0, 0), (1, "sell", 10, 100.0, 1))
        summary, _ = self.summary_for(settled, [0.0, 0.0], [100.0, 100.0])
        self.assertEqual((summary.wins, summary.losses, summary.scratches), (0, 0, 1))
        self.assertIsNone(summary.win_rate)
        self.assertEqual(summary.trade_count, 1)

    def test_nothing_closed_leaves_the_win_rate_absent_and_the_money_at_zero(self):
        settled = fills((1, "buy", 10, 100.0, 0))
        summary, _ = self.summary_for(settled, [20.0], [100.0, 100.0])
        self.assertIsNone(summary.win_rate)
        self.assertEqual(summary.expectancy, 0.0)
        self.assertEqual(summary.expectancy_standard_error, 0.0)
        self.assertEqual(summary.trade_count, 0)
        self.assertEqual(summary.open_trade_count, 1)
        # The charge left the account whether or not the position came back.
        self.assertEqual(summary.charges, 20.0)
        # And the open trade's own net, which is that charge with no gross against
        # it, is in none of the closed figures: counted there, a run holding a
        # winner reports as having lost money.
        self.assertEqual(summary.net_profit, 0.0)
        self.assertEqual(summary.return_percent, 0.0)

    def test_the_two_spellings_of_expectancy_agree_where_nothing_scratched(self):
        settled = fills(
            (1, "buy", 10, 100.0, 0),
            (1, "sell", 10, 110.0, 1),
            (2, "buy", 10, 100.0, 2),
            (2, "sell", 10, 95.0, 3),
        )
        summary, _ = self.summary_for(settled, [0.0] * 4, [100.0] * 4)
        self.assertEqual(summary.scratches, 0)
        spelt = (
            summary.win_rate * summary.average_win
            - (1 - summary.win_rate) * summary.average_loss
        )
        self.assertAlmostEqual(summary.expectancy, spelt, places=12)

    def test_expectancy_is_money_per_closed_trade_and_a_scratch_is_one_of_them(self):
        # The win rate spelling divides by the decided trades, and the two are the
        # same number exactly when nothing scratched. Divided by the decided count
        # here, a run of one winner and one scratch reports twice what it made.
        settled = fills(
            (1, "buy", 10, 100.0, 0),
            (1, "sell", 10, 110.0, 1),
            (2, "buy", 10, 100.0, 2),
            (2, "sell", 10, 100.0, 3),
        )
        summary, _ = self.summary_for(settled, [0.0] * 4, [100.0] * 4)
        self.assertEqual((summary.wins, summary.losses, summary.scratches), (1, 0, 1))
        self.assertEqual(summary.trade_count, 2)
        self.assertEqual(summary.expectancy, 50.0)

    def test_one_closed_trade_has_no_spread_to_measure(self):
        settled = fills((1, "buy", 10, 100.0, 0), (1, "sell", 10, 110.0, 1))
        summary, _ = self.summary_for(settled, [0.0, 0.0], [100.0, 110.0])
        self.assertEqual(summary.expectancy_standard_error, 0.0)

    def test_nothing_lost_leaves_the_profit_factor_absent(self):
        # Absent rather than an infinity: a value that does not survive being
        # written down is not a value a report may hold.
        settled = fills((1, "buy", 10, 100.0, 0), (1, "sell", 10, 110.0, 1))
        summary, _ = self.summary_for(settled, [0.0, 0.0], [100.0, 110.0])
        self.assertIsNone(summary.profit_factor)

    def test_the_deepest_point_names_the_money_the_fraction_and_the_time(self):
        settled = fills((1, "buy", 10, 100.0, 0))
        summary, _ = self.summary_for(settled, [0.0], [100.0, 80.0, 70.0, 90.0])
        self.assertEqual(summary.max_drawdown, -300.0)
        self.assertEqual(summary.max_drawdown_at, 2.0)
        self.assertEqual(summary.max_drawdown_percent, -300.0 / 1000.0)

    def test_the_longest_run_under_water_is_consecutive_bars_and_not_the_total(self):
        settled = fills((1, "buy", 10, 100.0, 0))
        summary, _ = self.summary_for(settled, [0.0], [100.0, 90.0, 110.0, 90.0, 90.0, 90.0])
        self.assertEqual(summary.longest_drawdown_bars, 3)

    def test_bars_in_market_agrees_with_the_curve_about_which_bars_were_held(self):
        settled = fills((1, "buy", 10, 100.0, 1), (1, "sell", 10, 110.0, 3))
        held = marks([100.0] * 5)
        trades = trades_of(settled, [0.0, 0.0], held, CONTRACT)
        curve = equity_over(trades, held, CONTRACT, 1000.0)
        summary = summary_of(trades, curve, CONTRACT, 1000.0)
        counted = sum(
            1 for point in curve if any(open_on_bar(one, point.bar_index) for one in trades)
        )
        self.assertEqual(summary.bars_in_market, counted)
        self.assertEqual(summary.bar_count, len(curve))


class TheWholeReport(unittest.TestCase):
    def test_the_summary_s_charges_are_the_curve_s_last_point(self):
        settled = fills((1, "buy", 10, 100.0, 0), (1, "sell", 10, 110.0, 2))
        report = report_of(settled, marks([100.0, 105.0, 110.0]), None, CONTRACT, 1000.0)
        self.assertEqual(report.summary.charges, report.equity[-1].charges)

    def test_a_run_under_no_schedule_is_charged_nothing(self):
        settled = fills((1, "buy", 10, 100.0, 0), (1, "sell", 10, 110.0, 2))
        report = report_of(settled, marks([100.0, 105.0, 110.0]), None, CONTRACT, 1000.0)
        self.assertEqual(report.summary.charges, 0.0)
        self.assertEqual(report.summary.net_profit, 100.0)

    def test_the_fills_are_read_in_their_own_order_and_not_the_caller_s(self):
        settled = fills((1, "buy", 10, 100.0, 0), (1, "sell", 10, 110.0, 2))
        held = marks([100.0, 105.0, 110.0])
        forwards = report_of(settled, held, None, CONTRACT, 1000.0)
        backwards = report_of(tuple(reversed(settled)), held, None, CONTRACT, 1000.0)
        self.assertEqual(forwards.trades, backwards.trades)


if __name__ == "__main__":
    unittest.main()
