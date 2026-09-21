"""The trades taken apart, and the curve read the other way up.

Two additions to the report, and the same two in the first engine. They are
tested here against fills rather than against written-out trades, so a failure
is a failure of this engine's whole money layer and not of a fixture somebody
typed: the curve, the round trips and the fold all run.

**The analysis answers three questions the summary cannot.** Which side made the
money, because every figure in the summary is folded over both at once and a run
whose long trades paid for its short ones reports a healthy net. Whether one
trade is the whole result, which the extremes say and the headline hides.  And
what the run of losses was, which is the number that actually stops somebody and
which depends on an ordering the summary folds away entirely.

**Run-up is not a drawdown with the comparison flipped.** The running peak
starts at the capital and only rises, so it is above zero for the whole of any
run that was given money. The running trough starts there and only falls, so it
reaches zero on a run that lost everything and can go past it, and from that bar
the fraction has no basis left to take. The money figure is unaffected and is
what a reader of such a run is left with.

Every test below names the wrong implementation it catches, and each asserts a
value rather than an outcome.
"""

import unittest

from tests.test_trades_and_summary import CONTRACT, fills, marks

from openscript.accounting import analysis_of, equity_over, summary_of, trades_of

CAPITAL = 1000.0


def folded(settled, charges, closes, capital=CAPITAL):
    """One run's trades, curve and summary, from the fills a destination settled."""
    held = marks(closes)
    trades = trades_of(settled, charges, held, CONTRACT)
    curve = equity_over(trades, held, CONTRACT, capital)
    return trades, curve, summary_of(trades, curve, CONTRACT, capital)


class TheSideSplit(unittest.TestCase):
    def test_the_sides_partition_the_closed_trades_in_count_and_in_money(self):
        # Catches a split folded over the whole list rather than the closed half,
        # and one that counts a trade on both sides. Either way two panels of one
        # report disagree and the reader cannot tell which is wrong. The third
        # position below is still held, so it is in neither side and the
        # summary's open count is where it is accounted for.
        settled = fills(
            (1, "buy", 10, 100.0, 0),
            (1, "sell", 10, 110.0, 1),
            (2, "sell", 10, 110.0, 2),
            (2, "buy", 10, 115.0, 3),
            (3, "buy", 5, 115.0, 4),
        )
        trades, _, summary = folded(settled, [0.0] * 5, [100.0, 110.0, 110.0, 115.0, 115.0])

        found = analysis_of(trades)

        self.assertEqual(found.long.count + found.short.count, summary.trade_count)
        self.assertEqual(found.long.net_profit + found.short.net_profit, summary.net_profit)
        self.assertEqual(found.long.count, 1)
        self.assertEqual(found.short.count, 1)
        self.assertEqual(found.long.net_profit, 100.0)
        self.assertEqual(found.short.net_profit, -50.0)
        self.assertEqual(summary.open_trade_count, 1)

    def test_a_side_that_decided_nothing_has_no_rate_and_that_is_not_a_zero(self):
        # Catches a rate defaulted to zero on a side with no closed trade. Zero
        # is a number a reader compares the sides on, and it would say the short
        # side lost every trade it took where it took none at all.
        settled = fills((1, "buy", 10, 100.0, 0), (1, "sell", 10, 110.0, 1))
        trades, _, _ = folded(settled, [0.0, 0.0], [100.0, 110.0])

        found = analysis_of(trades)

        self.assertEqual(found.long.win_rate, 1.0)
        self.assertIsNone(found.short.win_rate)
        self.assertEqual(found.short.count, 0)


class TheExtremes(unittest.TestCase):
    def test_they_are_nets_after_charges_and_the_loss_is_a_magnitude(self):
        # Catches extremes read from the gross, which is the classification
        # mistake the summary already guards against: the second trade below
        # made forty before charges and ten after, so a largest win read from
        # the gross names a trade the account never had. Catches a largest loss
        # carried as a negative, which reads as zero under a maximum and is
        # then silently never reported.
        settled = fills(
            (1, "buy", 10, 100.0, 0),
            (1, "sell", 10, 103.0, 1),
            (2, "buy", 10, 103.0, 2),
            (2, "sell", 10, 107.0, 3),
            (3, "buy", 10, 107.0, 4),
            (3, "sell", 10, 102.0, 5),
        )
        charges = [0.0, 0.0, 15.0, 15.0, 0.0, 0.0]
        trades, _, _ = folded(settled, charges, [100.0, 103.0, 103.0, 107.0, 107.0, 102.0])

        found = analysis_of(trades)

        self.assertEqual(found.largest_win, 30.0)
        self.assertEqual(found.largest_loss, 50.0)

    def test_a_run_with_nothing_closed_has_no_extreme_and_no_streak(self):
        # Catches an extreme seeded from the first element rather than from
        # zero, which on an empty list has nothing to read and on an all-losing
        # one reports the shallowest loss as the largest win.
        settled = fills((1, "buy", 10, 100.0, 0))
        trades, _, _ = folded(settled, [0.0], [100.0, 101.0])

        found = analysis_of(trades)

        self.assertEqual(found.largest_win, 0.0)
        self.assertEqual(found.largest_loss, 0.0)
        self.assertEqual(found.max_consecutive_wins, 0)
        self.assertEqual(found.max_consecutive_losses, 0)


class TheStreaks(unittest.TestCase):
    def test_a_streak_is_counted_in_closing_order_and_not_in_opening_order(self):
        # The defect this file exists for. Position 1 is opened first and closed
        # last, which is every scaling strategy and every long hold with trades
        # taken around it. In opening order the nets read win, loss, win: no
        # streak above one. In the order the account experienced them they read
        # loss, win, win, which is a streak of two. The summary folds this
        # ordering away entirely, so nothing else in the report can catch an
        # engine that sorts the wrong way or does not sort at all.
        settled = fills(
            (1, "buy", 10, 100.0, 0),
            (2, "buy", 10, 100.0, 1),
            (2, "sell", 10, 97.0, 2),
            (3, "buy", 10, 97.0, 3),
            (3, "sell", 10, 104.0, 4),
            (1, "sell", 10, 105.0, 5),
        )
        closes = [100.0, 100.0, 97.0, 97.0, 104.0, 105.0]
        trades, _, _ = folded(settled, [0.0] * 6, closes)

        found = analysis_of(trades)

        self.assertEqual(found.max_consecutive_wins, 2)
        self.assertEqual(found.max_consecutive_losses, 1)

    def test_the_result_does_not_depend_on_the_order_the_list_arrived_in(self):
        # Catches a comparison that is not total. Two of the trades below close
        # on one bar, one a loss and one a win, so a sort keyed on the closing
        # bar alone leaves their order to whatever the list held. Both engines
        # sort stably, so that is not undefined behaviour, it is worse: the
        # streak silently becomes a fact about the input order. Folded twice,
        # once each way, because a single fold in the given order passes either
        # way.
        settled = fills(
            (1, "buy", 10, 100.0, 0),
            (1, "sell", 10, 99.0, 3),
            (2, "buy", 10, 99.0, 3),
            (2, "sell", 10, 98.0, 4),
            (3, "buy", 10, 98.0, 3),
            (3, "sell", 10, 106.0, 4),
        )
        closes = [100.0, 100.0, 100.0, 99.0, 106.0]
        trades, _, _ = folded(settled, [0.0] * 6, closes)

        forwards = analysis_of(trades)
        backwards = analysis_of(tuple(reversed(trades)))

        self.assertEqual(forwards.max_consecutive_losses, 2)
        self.assertEqual(backwards.max_consecutive_losses, forwards.max_consecutive_losses)
        self.assertEqual(backwards.max_consecutive_wins, forwards.max_consecutive_wins)

    def test_a_scratch_breaks_a_streak_and_extends_neither_half(self):
        # Catches a scratch folded into the wins, which is the classification
        # mistake the summary guards against, and a scratch skipped entirely,
        # which is subtler and worse: skipping it joins the two wins either side
        # into a streak of two, so the reported best run depends on a rounding
        # at the last digit of a trade that made nothing.
        settled = fills(
            (1, "buy", 10, 100.0, 0),
            (1, "sell", 10, 104.0, 1),
            (2, "buy", 10, 104.0, 2),
            (2, "sell", 10, 104.0, 3),
            (3, "buy", 10, 104.0, 4),
            (3, "sell", 10, 110.0, 5),
        )
        closes = [100.0, 104.0, 104.0, 104.0, 104.0, 110.0]
        trades, _, _ = folded(settled, [0.0] * 6, closes)

        found = analysis_of(trades)

        self.assertEqual(found.max_consecutive_wins, 1)
        self.assertEqual(found.max_consecutive_losses, 0)
        self.assertEqual(found.long.scratches, 1)
        self.assertEqual(found.long.wins, 2)

    def test_the_longest_streak_is_kept_and_not_the_last_one(self):
        # Catches a counter reported at the end of the loop rather than carried
        # as a maximum, which reports whatever the run happened to finish on:
        # here one trailing loss, where the run's worst stretch was two.
        settled = fills(
            (1, "buy", 10, 100.0, 0),
            (1, "sell", 10, 99.0, 1),
            (2, "buy", 10, 99.0, 2),
            (2, "sell", 10, 98.0, 3),
            (3, "buy", 10, 98.0, 4),
            (3, "sell", 10, 108.0, 5),
            (4, "buy", 10, 108.0, 6),
            (4, "sell", 10, 107.0, 7),
        )
        closes = [100.0, 99.0, 99.0, 98.0, 98.0, 108.0, 108.0, 107.0]
        trades, _, _ = folded(settled, [0.0] * 8, closes)

        found = analysis_of(trades)

        self.assertEqual(found.max_consecutive_losses, 2)

    def test_the_fold_does_not_reorder_the_list_it_is_given(self):
        # Catches a sort applied in place. The list arrives in opening order
        # because the equity fold needs it that way, and an analysis that sorted
        # it under the caller would change the curve, the drawdown and every
        # figure folded from them, on a call that is supposed to read.
        settled = fills(
            (1, "buy", 10, 100.0, 0),
            (2, "buy", 10, 100.0, 1),
            (2, "sell", 10, 97.0, 2),
            (1, "sell", 10, 105.0, 5),
        )
        closes = [100.0, 100.0, 97.0, 97.0, 100.0, 105.0]
        trades, _, _ = folded(settled, [0.0] * 4, closes)
        before = [trade.index for trade in trades]

        analysis_of(trades)

        self.assertEqual([trade.index for trade in trades], before)


class TheRunUp(unittest.TestCase):
    def test_the_trough_starts_at_the_capital_and_not_at_the_first_point(self):
        # The mirror of the peak rule beside it. The position below is entered
        # at 100 and marked up every bar, so the account is ahead from its first
        # report bar. A trough anchored at the first point would call that bar
        # the bottom and report the gain it already had as having come from
        # nowhere.
        settled = fills((1, "buy", 10, 100.0, 0))
        _, curve, _ = folded(settled, [0.0], [110.0, 120.0, 130.0])

        self.assertEqual([point.run_up for point in curve], [100.0, 200.0, 300.0])
        self.assertEqual([point.drawdown for point in curve], [0.0, 0.0, 0.0])

    def test_a_height_is_measured_from_the_trough_and_not_from_the_start(self):
        # Catches a height measured against the capital, which looks right until
        # a run goes down first. The curve below falls and then climbs past
        # where it began: measured from the capital the recovery is hidden.
        settled = fills((1, "buy", 10, 100.0, 0))
        _, curve, summary = folded(settled, [0.0], [90.0, 105.0])

        self.assertEqual(curve[0].equity, 900.0)
        self.assertEqual(summary.max_run_up, 150.0)
        self.assertAlmostEqual(summary.max_run_up_percent, 150.0 / 900.0)

    def test_the_height_and_the_depth_name_different_bars(self):
        # Catches a summary that reads the run-up out of the bar it already
        # chose for the drawdown, which is the cheapest wrong implementation
        # here and gives a run-up of zero on most runs.
        settled = fills((1, "buy", 10, 100.0, 0))
        _, _, summary = folded(settled, [0.0], [80.0, 90.0, 130.0])

        self.assertEqual(summary.max_drawdown, -200.0)
        self.assertEqual(summary.max_drawdown_at, 0.0)
        self.assertEqual(summary.max_run_up, 500.0)
        self.assertEqual(summary.max_run_up_at, 2.0)

    def test_the_earliest_bar_reaching_a_height_keeps_it(self):
        # Catches a comparison written with "greater or equal", which hands the
        # figure to the last bar that matched. The depth is picked by the first,
        # and two figures in one report picked by opposite tie rules is a report
        # whose halves cannot be checked against each other.
        settled = fills((1, "buy", 10, 100.0, 0))
        _, _, summary = folded(settled, [0.0], [108.0, 108.0])

        self.assertEqual(summary.max_run_up, 80.0)
        self.assertEqual(summary.max_run_up_at, 0.0)

    def test_a_run_that_only_fell_has_no_height_and_that_is_a_zero(self):
        # Catches a height seeded from the first point rather than from zero.
        # The curve below never rose, so there is nothing to report.
        settled = fills((1, "buy", 10, 100.0, 0))
        _, _, summary = folded(settled, [0.0], [97.0, 92.5])

        self.assertEqual(summary.max_run_up, 0.0)
        self.assertEqual(summary.max_run_up_percent, 0.0)
        self.assertIsNone(summary.max_run_up_at)
        self.assertEqual(summary.max_drawdown, -75.0)

    def test_a_trough_at_or_below_zero_reports_no_fraction_and_still_reports_money(self):
        # The one place the symmetry with drawdown breaks, and it is written
        # down in the shape. A guard written against zero alone passes the first
        # curve and fails the second, so both are here: the first position marks
        # down to exactly nothing and the second marks down past it, which is
        # reachable because an open position can lose more than the account
        # holds. A fraction against a trough of zero is a division by zero and
        # against a negative one it turns a positive climb into a negative
        # fraction. The money figure is unaffected.
        wiped = folded(fills((1, "buy", 10, 100.0, 0)), [0.0], [0.0, 40.0])[1]

        self.assertEqual(wiped[0].equity, 0.0)
        self.assertEqual(wiped[0].run_up_percent, 0.0)
        self.assertEqual(wiped[1].run_up, 400.0)
        self.assertEqual(wiped[1].run_up_percent, 0.0)

        past = folded(fills((1, "buy", 30, 100.0, 0)), [0.0], [0.0, 40.0])[1]

        self.assertEqual(past[0].equity, -2000.0)
        self.assertEqual(past[1].equity, -800.0)
        self.assertEqual(past[1].run_up, 1200.0)
        self.assertEqual(past[1].run_up_percent, 0.0)


if __name__ == "__main__":
    unittest.main()
