"""Folding an order frame, ``stdlib.md`` 17.8, step by step against the wrong fold.

**The fold is where double counting happens.** Frames repeat, cross in flight and
arrive after the order they are about has ended, and each of those is ordinary
traffic a destination produces without being broken. So every test here is a
frame a real destination sends and a wrong implementation that would pass without
it:

- **A frame naming no row** is a fact about the host. An engine that opened a row
  for it would hold an order this strategy never placed.
- **A frame whose quantity has not moved** is a repeat or one a later frame
  overtook. An engine adding each frame's quantity to a running total doubles the
  fill and reports a position the strategy never held.
- **A frame reporting less than the row holds** is a pair that crossed in flight.
  Taken as the new total it would hand units back that had already traded.
- **A fill with no price** cannot be marked against anything, so nothing folds.
- **A status behind the row's** is the same crossing read on the other field.
  Taken as the new status it would move an order back to working after it ended
  and free the strategy to place another.
- **A frame at a terminal row** is a cancel that raced a fill. An engine that
  refused it has lost a real fill, and the loss is invisible from inside the
  script: the account holds a position the strategy cannot see.
- **A fill settles the row's own position**, never whichever position the leg
  holds now, or a late fill lands on the position that replaced the one it
  belonged to.
"""

import unittest

from tests.orders_support import answer, ledger_with, place

from openscript.strategy import LedgerRow, fold_frame, working_units
from openscript.strategy.intents import Identity, OrderFrame
from openscript.strategy.rows import FILL_WITH_NO_PRICE, UNKNOWN_INTENT, Reduction


def row_of(**changed):
    """A row as the ledger appends one: sent, and nothing come back."""
    stated = dict(
        intent_id=1,
        tag="",
        leg="",
        position_ref=1,
        instrument=Identity("AAA", "XX"),
        product="intraday",
        side="buy",
        qty=10.0,
        order_type="market",
        price=None,
        trigger=None,
        placed_at=0.0,
        updated_at=0.0,
        units=10.0,
    )
    stated.update(changed)
    return LedgerRow(**stated)


def frame(**changed):
    stated = dict(intent_id=1, status="working", filled_qty=0.0)
    stated.update(changed)
    return OrderFrame(**stated)


class Locating(unittest.TestCase):
    def test_a_frame_naming_no_row_folds_nothing_and_is_recorded(self):
        led = ledger_with()
        outcomes = answer(led, 99, "filled", 5, 100.0)
        self.assertEqual(len(outcomes), 1)
        self.assertEqual(outcomes[0].refused, UNKNOWN_INTENT)
        self.assertEqual(outcomes[0].delta, 0)
        self.assertEqual(led.size(), 0)

    def test_the_destination_s_own_reference_never_finds_a_row(self):
        # A row has none while it is ``placed``, so a fold keyed on it would match
        # nothing on the one frame that first carries one.
        led = ledger_with()
        placed = place(led, "buy", qty=4)
        intent = placed.intents[0].intent_id
        answer(led, intent, "working", 0, order_ref="R1")
        self.assertEqual(led.rows()[0].order_ref, "R1")
        self.assertEqual(answer(led, "R1", "filled", 4, 100.0)[0].refused, UNKNOWN_INTENT)


class TheCumulativeQuantity(unittest.TestCase):
    def test_a_repeated_fill_adds_nothing(self):
        row = row_of()
        first = fold_frame(row, frame(status="filled", filled_qty=10, avg_fill_price=101.5))
        again = fold_frame(row, frame(status="filled", filled_qty=10, avg_fill_price=101.5))
        self.assertEqual(first.delta, 10)
        self.assertEqual(again.delta, 0)
        self.assertFalse(again.changed)
        self.assertEqual(row.filled_qty, 10)

    def test_a_frame_behind_the_row_leaves_the_quantity_alone(self):
        row = row_of()
        fold_frame(row, frame(filled_qty=6, avg_fill_price=100.0))
        crossed = fold_frame(row, frame(filled_qty=2, avg_fill_price=99.0))
        self.assertEqual(crossed.delta, 0)
        self.assertEqual(row.filled_qty, 6)
        self.assertEqual(row.avg_fill_price, 100.0)

    def test_a_terminal_frame_overtaking_a_partial_one_carries_the_remainder(self):
        # The property that makes the fold safe under out of order delivery.
        row = row_of()
        fold_frame(row, frame(filled_qty=4, avg_fill_price=100.0))
        whole = fold_frame(row, frame(status="filled", filled_qty=10, avg_fill_price=100.6))
        self.assertEqual(whole.delta, 6)
        self.assertEqual(row.filled_qty, 10)
        self.assertEqual(row.avg_fill_price, 100.6)


class TheAveragePrice(unittest.TestCase):
    def test_the_row_takes_the_destination_s_average_whole(self):
        # The engine never averages two averages of its own: the destination
        # computed its average over the cumulative quantity, so it is the answer.
        row = row_of()
        fold_frame(row, frame(filled_qty=5, avg_fill_price=100.0))
        fold_frame(row, frame(filled_qty=10, avg_fill_price=110.0))
        self.assertEqual(row.avg_fill_price, 110.0)

    def test_a_greater_quantity_with_no_price_folds_nothing(self):
        row = row_of()
        refusal = fold_frame(row, frame(status="filled", filled_qty=10))
        self.assertEqual(refusal.refused, FILL_WITH_NO_PRICE)
        self.assertEqual(row.filled_qty, 0)
        self.assertEqual(row.status, "placed")

    def test_a_frame_that_adds_nothing_keeps_the_price_it_had(self):
        row = row_of()
        fold_frame(row, frame(filled_qty=5, avg_fill_price=100.0))
        fold_frame(row, frame(status="cancelled", filled_qty=5))
        self.assertEqual(row.avg_fill_price, 100.0)
        self.assertEqual(row.status, "cancelled")


class TheStatus(unittest.TestCase):
    def test_a_status_behind_the_row_s_is_left_alone(self):
        row = row_of()
        fold_frame(row, frame(status="filled", filled_qty=10, avg_fill_price=100.0))
        fold_frame(row, frame(status="working", filled_qty=10, avg_fill_price=100.0))
        self.assertEqual(row.status, "filled")

    def test_the_two_live_words_may_follow_one_another(self):
        row = row_of()
        fold_frame(row, frame(status="triggerPending"))
        self.assertEqual(row.status, "triggerPending")
        fold_frame(row, frame(status="working"))
        self.assertEqual(row.status, "working")

    def test_a_host_cannot_send_the_engine_s_own_word(self):
        row = row_of()
        fold_frame(row, frame(status="working"))
        fold_frame(row, frame(status="placed"))
        self.assertEqual(row.status, "working")

    def test_a_word_outside_the_vocabulary_folds_the_rest_of_the_frame(self):
        # Refusing the whole frame would throw away the cumulative quantity it
        # carries, which is real whatever the word beside it says.
        row = row_of()
        outcome = fold_frame(row, frame(status="partiallyFilled", filled_qty=3, avg_fill_price=99.0))
        self.assertTrue(outcome.changed)
        self.assertEqual(row.filled_qty, 3)
        self.assertEqual(row.status, "placed")


class AFillAfterTerminal(unittest.TestCase):
    def test_the_quantity_rises_and_the_terminal_word_stays(self):
        row = row_of()
        fold_frame(row, frame(status="cancelled", filled_qty=0))
        late = fold_frame(row, frame(status="cancelled", filled_qty=10, avg_fill_price=100.0))
        self.assertEqual(row.status, "cancelled")
        self.assertEqual(row.filled_qty, 10)
        self.assertEqual(row.avg_fill_price, 100.0)
        self.assertTrue(late.after_terminal)

    def test_it_settles_against_the_position_like_any_other_fill(self):
        led = ledger_with()
        placed = place(led, "buy", qty=10)
        intent = placed.intents[0].intent_id
        answer(led, intent, "cancelled", 0)
        answer(led, intent, "cancelled", 10, 100.0)
        self.assertEqual(led.size(), 10)

    def test_a_forward_status_does_not_move_a_row_that_has_ended(self):
        # A terminal status is never left: the word records how the order ended and
        # the quantity records what traded, and a cancelled row whose cumulative
        # quantity reaches the order's full quantity stays cancelled.
        row = row_of()
        fold_frame(row, frame(status="cancelled", filled_qty=0))
        fold_frame(row, frame(status="filled", filled_qty=10, avg_fill_price=100.0))
        self.assertEqual(row.status, "cancelled")
        self.assertEqual(row.filled_qty, 10)

    def test_the_event_names_the_tag_the_quantity_and_the_word_it_arrived_after(self):
        # "The position closed" is not an answer: a trader reading a log after a
        # bad day needs to know which fill arrived and against what.
        row = row_of(tag="entry")
        fold_frame(row, frame(status="cancelled", filled_qty=0))
        late = fold_frame(row, frame(status="cancelled", filled_qty=4, avg_fill_price=100.0))
        self.assertEqual(late.event, {"tag": "entry", "added": 4, "after": "cancelled"})

    def test_an_ordinary_fill_does_not_carry_the_event(self):
        row = row_of()
        first = fold_frame(row, frame(status="working", filled_qty=4, avg_fill_price=100.0))
        self.assertFalse(first.after_terminal)
        self.assertEqual(first.event, {})


class WhatChangedNothing(unittest.TestCase):
    def test_a_repeat_does_not_touch_the_reference_or_the_time(self):
        row = row_of()
        fold_frame(row, frame(status="working", order_ref="R1", time=5.0))
        fold_frame(row, frame(status="working", order_ref="R2", time=9.0))
        self.assertEqual(row.order_ref, "R1")
        self.assertEqual(row.updated_at, 5.0)

    def test_new_rejection_text_is_a_change(self):
        row = row_of()
        outcome = fold_frame(row, frame(status="rejected", text="no margin"))
        self.assertTrue(outcome.changed)
        self.assertEqual(row.rejection, "no margin")


class WhereAFillSettles(unittest.TestCase):
    def test_it_settles_the_row_s_own_position_and_not_the_leg_s_current_one(self):
        led = ledger_with()
        opening = place(led, "buy", qty=6).intents[0]
        answer(led, opening.intent_id, "filled", 6, 100.0)
        # A sell of nine: six off the position it opposes and three opening a new
        # one, which is the split of 17.1.
        flipping = place(led, "sell", bar=1, qty=9).intents
        self.assertEqual(len(flipping), 2)
        answer(led, flipping[1].intent_id, "filled", 3, 90.0)
        self.assertEqual(led.size_of(opening.position_ref), 6)
        self.assertEqual(led.size_of(flipping[1].position_ref), -3)
        # The late fill on the outgoing order still finds its own position.
        answer(led, flipping[0].intent_id, "filled", 6, 95.0)
        self.assertEqual(led.size_of(opening.position_ref), 0)
        self.assertEqual(led.size(), -3)


class WhatAWorkingOrderStillClaims(unittest.TestCase):
    def test_a_partial_fill_releases_what_settled(self):
        row = row_of(reduces=Reduction(part=None, claimed=3.0, counted=True))
        self.assertEqual(working_units(row), 3.0)
        fold_frame(row, frame(filled_qty=1, avg_fill_price=100.0))
        self.assertEqual(working_units(row), 2.0)

    def test_an_order_that_has_ended_releases_the_rest(self):
        row = row_of(reduces=Reduction(part=None, claimed=3.0, counted=True))
        fold_frame(row, frame(status="rejected", text="no"))
        self.assertEqual(working_units(row), 0.0)

    def test_a_claim_the_engine_could_not_count_stands_whole_until_it_ends(self):
        # The claim is in units and the answer is in whatever unit the order was
        # written in, and subtracting one from the other is the drift this avoids.
        row = row_of(units=None, reduces=Reduction(part=None, claimed=5.0, counted=False))
        fold_frame(row, frame(filled_qty=2, avg_fill_price=100.0))
        self.assertEqual(working_units(row), 5.0)

    def test_an_order_that_adds_claims_nothing(self):
        self.assertEqual(working_units(row_of()), 0.0)


if __name__ == "__main__":
    unittest.main()
