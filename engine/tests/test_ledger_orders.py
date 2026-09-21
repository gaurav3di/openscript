"""What a call sends, how much of it, and which position it is sent against.

Every test here is a script somebody would write and an engine that was wrong
about it. The two the section is unconditional about are first:

- **No order crosses zero.** An instruction that would take a leg from long to
  short is two orders, each carrying its own position reference, so a fill
  arriving late can still say which of the two it settled.
- **What is available to reduce is the settled position less everything already
  working against it.** A position is folded from settled fills, so an order the
  destination has not answered has moved no position figure. Measured against the
  position alone every reducing order sends the whole of it again, and the same
  defect wears two faces: two bare closes on one bar take a leg holding three long
  to three short, and against a destination slower than the chart a close on every
  bar while the position reads positive sends one close per bar for the length of
  the run.

The scope is therefore the run and the position, not the bar, and a test that
answered a frame between the two closes would not notice the difference.
"""

import unittest

from tests.orders_support import answer, ledger_with, place, sides

from openscript.strategy import (
    LedgerRow,
    Positions,
    Reduction,
    closable,
    closing_for,
    holdings,
)
from openscript.strategy.sizing import flattening
from openscript.strategy.intents import Identity, NO_POSITION_REF


def rows_of(*described):
    """Ledger rows as a part of a leg holds them: a side, a tag and what filled."""
    made = []
    for at, (side, tag, filled) in enumerate(described):
        made.append(
            LedgerRow(
                intent_id=at + 1,
                tag=tag,
                leg="",
                position_ref=1,
                instrument=Identity("AAA", "XX"),
                product="intraday",
                side=side,
                qty=filled,
                order_type="market",
                price=None,
                trigger=None,
                placed_at=0.0,
                updated_at=0.0,
                units=filled,
                status="filled",
                filled_qty=filled,
            )
        )
    return made


def working_rows(*described):
    """Rows the destination still has: an order sent and nothing come back."""
    made = []
    for at, (side, units, part) in enumerate(described):
        row = rows_of((side, "", units))[0]
        row.intent_id = 100 + at
        row.status = "placed"
        row.filled_qty = 0.0
        row.reduces = None if part is None else Reduction(part=part, claimed=units, counted=True)
        made.append(row)
    return made


class ABook:
    """A leg as ``holdings`` reads one: its rows, and what settled per reference."""

    def __init__(self, rows, settled):
        self._rows = list(rows)
        self._settled = dict(settled)

    def rows(self):
        return self._rows

    def size_of(self, ref):
        return self._settled.get(ref, 0.0)

    def size(self):
        return sum(self._settled.values())

    @property
    def qty_type(self):
        return "units"


class AHeldPart:
    """The narrowest thing ``closable`` reads: a leg's net and its own rows."""

    def __init__(self, net, rows):
        self._net = net
        self._rows = rows

    def size(self):
        return self._net

    def rows(self):
        return self._rows


class WhatAnEntrySends(unittest.TestCase):
    def test_a_first_entry_opens_a_position_of_its_own(self):
        led = ledger_with()
        placed = place(led, "buy", qty=6)
        self.assertEqual(sides(placed.intents), (("buy", 6.0, 1),))
        self.assertEqual(led.rows()[0].status, "placed")
        self.assertEqual(led.rows()[0].units, 6.0)

    def test_a_call_that_names_no_quantity_takes_the_declaration_s(self):
        led = ledger_with(declared_qty=7.0)
        self.assertEqual(sides(place(led, "buy").intents), (("buy", 7.0, 1),))

    def test_an_order_that_opposes_an_unanswered_entry_is_two_orders(self):
        # The leg's settled net is zero here, so an engine reading the net would
        # put both on one reference: that reference would open six long and settle
        # three short, and a late fill could no longer say which position it was.
        led = ledger_with(pyramiding=2)
        place(led, "buy", qty=6)
        flipping = place(led, "sell", bar=1, qty=9).intents
        self.assertEqual(sides(flipping), (("sell", 6.0, 1), ("sell", 3.0, 2)))

    def test_a_second_entry_on_one_side_joins_the_position_it_is_on(self):
        led = ledger_with(pyramiding=3)
        place(led, "buy", qty=4)
        again = place(led, "buy", bar=1, qty=5).intents
        self.assertEqual(sides(again), (("buy", 5.0, 1),))


class WhatACloseSends(unittest.TestCase):
    def test_it_works_its_own_quantity_out_from_what_settled(self):
        led = ledger_with()
        entry = place(led, "buy", qty=10).intents[0]
        answer(led, entry.intent_id, "filled", 10, 100.0)
        closing = place(led, "close", bar=1).intents
        self.assertEqual(sides(closing), (("sell", 10.0, 1),))

    def test_twice_on_one_bar_sends_one_order_and_then_nothing(self):
        led = ledger_with()
        entry = place(led, "buy", qty=3).intents[0]
        answer(led, entry.intent_id, "filled", 3, 100.0)
        first = place(led, "close", bar=1).intents
        again = place(led, "close", bar=1).intents
        self.assertEqual(sides(first), (("sell", 3.0, 1),))
        self.assertEqual(again, ())

    def test_on_the_bar_after_one_whose_close_is_still_working_it_sends_nothing(self):
        # A bar-scoped count is emptied when the bar index changes, so this is the
        # close that grew a flat exit into a short position without limit.
        led = ledger_with()
        entry = place(led, "buy", qty=3).intents[0]
        answer(led, entry.intent_id, "filled", 3, 100.0)
        place(led, "close", bar=1)
        self.assertEqual(place(led, "close", bar=2).intents, ())
        self.assertEqual(place(led, "close", bar=3).intents, ())

    def test_a_rejection_releases_the_claim_and_the_strategy_closes_again(self):
        led = ledger_with()
        entry = place(led, "buy", qty=3).intents[0]
        answer(led, entry.intent_id, "filled", 3, 100.0)
        refused = place(led, "close", bar=1).intents[0]
        answer(led, refused.intent_id, "rejected", 0, text="no")
        self.assertEqual(sides(place(led, "close", bar=2).intents), (("sell", 3.0, 1),))

    def test_a_partial_fill_of_the_close_leaves_the_rest_still_going(self):
        led = ledger_with()
        entry = place(led, "buy", qty=10).intents[0]
        answer(led, entry.intent_id, "filled", 10, 100.0)
        closing = place(led, "close", bar=1).intents[0]
        answer(led, closing.intent_id, "working", 4, 101.0)
        self.assertEqual(led.size(), 6)
        self.assertEqual(place(led, "close", bar=2).intents, ())

    def test_a_flat_leg_sends_nothing(self):
        self.assertEqual(place(ledger_with(), "close").intents, ())

    def test_an_entry_that_has_not_settled_adds_nothing_to_close(self):
        led = ledger_with()
        place(led, "buy", qty=5)
        self.assertEqual(place(led, "close", bar=1).intents, ())


class WhichSideACloseTakes(unittest.TestCase):
    def test_it_comes_from_the_part_the_call_names_and_not_from_the_leg(self):
        # A leg ten long under one tag and four short under another nets six long,
        # so a side taken from the net answers a sell on the short part: that part
        # goes to eight short and a call named close has opened a position.
        part = AHeldPart(6.0, rows_of(("buy", "a", 10.0), ("sell", "b", 4.0)))
        self.assertEqual(closing_for(part, "b"), "buy")
        self.assertEqual(closing_for(part, "a"), "sell")
        self.assertEqual(closing_for(part, None), "sell")

    def test_a_part_that_has_netted_to_nothing_has_no_side(self):
        part = AHeldPart(0.0, rows_of(("buy", "a", 4.0), ("sell", "a", 4.0)))
        self.assertIsNone(closing_for(part, "a"))

    def test_a_part_on_the_side_its_leg_is_not_on_is_not_bounded_by_the_leg(self):
        # Closing it moves the leg away from zero rather than towards it, so there
        # is nothing for the leg's own number to bound: measured against the leg it
        # was offered two, and under a flat leg it was offered nothing at all.
        part = AHeldPart(2.0, rows_of(("buy", "a", 12.0), ("sell", "b", 10.0)))
        self.assertEqual(closable(part, "b").units, 10.0)

    def test_a_part_on_the_leg_s_own_side_is_bounded_by_the_leg(self):
        part = AHeldPart(4.0, rows_of(("buy", "a", 10.0), ("sell", "", 6.0)))
        self.assertEqual(closable(part, "a").units, 4.0)


class WhatABracketDoes(unittest.TestCase):
    def test_it_appends_no_row_and_mints_no_reference(self):
        led = ledger_with()
        placed = place(led, "exit", tag="entry", stop=99.0, limit=101.0)
        self.assertEqual(len(placed.intents), 1)
        self.assertEqual(placed.intents[0].kind, "bracket")
        self.assertEqual(led.rows(), [])
        # The next entry opens on the first reference, not the second: minting one
        # here would have burned a reference on an instruction that ordered nothing.
        self.assertEqual(sides(place(led, "buy", bar=1, qty=2).intents), (("buy", 2.0, 1),))

    def test_it_carries_no_position_where_the_leg_holds_none(self):
        led = ledger_with()
        placed = place(led, "exit", tag="entry", stop=99.0, limit=101.0)
        self.assertEqual(placed.intents[0].position_ref, NO_POSITION_REF)

    def test_it_carries_the_position_the_leg_is_holding(self):
        led = ledger_with()
        entry = place(led, "buy", qty=5).intents[0]
        answer(led, entry.intent_id, "filled", 5, 100.0)
        placed = place(led, "exit", bar=1, tag="entry", stop=99.0, limit=101.0)
        self.assertEqual(placed.intents[0].position_ref, entry.position_ref)

    def test_a_call_that_names_no_level_sends_nothing(self):
        self.assertEqual(place(ledger_with(), "exit", tag="entry").intents, ())


class WhatACancellationDoes(unittest.TestCase):
    def test_it_appends_no_row_and_names_no_position(self):
        led = ledger_with()
        place(led, "buy", qty=2, tag="entry")
        placed = place(led, "cancel", tag="entry")
        self.assertEqual(len(led.rows()), 1)
        self.assertEqual(placed.intents[0].kind, "cancel")
        self.assertEqual(placed.intents[0].position_ref, NO_POSITION_REF)

    def test_cancel_all_sends_one_per_working_tag(self):
        led = ledger_with(pyramiding=3)
        place(led, "buy", qty=1, tag="a")
        place(led, "buy", bar=1, qty=1, tag="b")
        again = place(led, "buy", bar=2, qty=1, tag="a")
        answer(led, again.intents[0].intent_id, "cancelled", 0)
        placed = place(led, "cancelAll", bar=3)
        self.assertEqual(tuple(one.tag for one in placed.intents), ("a", "b"))


class ABarThatSendsNothingAfterAll(unittest.TestCase):
    def test_a_discard_takes_back_the_rows_the_bar_appended(self):
        # Otherwise the ledger reports an order at ``placed`` with an empty
        # reference that no destination was ever handed.
        led = ledger_with()
        place(led, "buy", qty=2)
        mark = len(led.rows())
        place(led, "buy", bar=1, qty=2)
        led.discard(mark)
        self.assertEqual(len(led.rows()), mark)

    def test_the_ids_it_minted_are_not_reissued(self):
        led = ledger_with()
        mark = len(led.rows())
        first = place(led, "buy", qty=2).intents[0].intent_id
        led.discard(mark)
        second = place(led, "buy", bar=1, qty=2).intents[0].intent_id
        self.assertGreater(second, first)


class WhatAReferenceHolds(unittest.TestCase):
    """``holdings`` answers two numbers, and they are not the same number."""

    def book_of(self, *rows):
        settled = {}
        for row in rows:
            if row.status == "filled":
                settled[row.position_ref] = settled.get(row.position_ref, 0.0) + (
                    row.filled_qty if row.side == "buy" else -row.filled_qty
                )
        return ABook(rows, settled)

    def test_an_opposing_order_may_take_what_is_settled_and_what_is_working(self):
        # A reference with six units still to come is a position holding six, and
        # an opposing order has to take those six off it before it opens anything.
        held = self.book_of(*rows_of(("buy", "", 10.0)), *working_rows(("buy", 6.0, None)))
        one = holdings(held)[0]
        self.assertEqual(one.side, "buy")
        self.assertEqual(one.units, 16.0)

    def test_a_close_may_send_only_what_settled_and_is_not_already_coming_off(self):
        # Counted against what settled alone, a reference ten long with six of sell
        # working offers a close the whole ten and the second one takes it short.
        held = self.book_of(*rows_of(("buy", "", 10.0)), *working_rows(("sell", 6.0, "")))
        one = holdings(held)[0]
        self.assertEqual(one.settled, 4.0)
        self.assertEqual(one.units, 4.0)

    def test_an_entry_joins_the_newest_reference_on_its_side(self):
        # Two entries sent before either fills belong to one position. The oldest
        # instead would put the second entry into a position on its way out.
        led = ledger_with(pyramiding=4)
        first = place(led, "buy", qty=10).intents[0]
        answer(led, first.intent_id, "filled", 10, 100.0)
        closing = place(led, "close", bar=1).intents[0]
        # The whole of what the leg holds is going, so the next entry cannot join
        # it: it would settle into a position that reaches zero and ends.
        second = place(led, "buy", bar=2, qty=5).intents[0]
        self.assertNotEqual(second.position_ref, first.position_ref)
        answer(led, second.intent_id, "filled", 5, 100.0)
        # The close was refused, so the older position is held again beside it.
        answer(led, closing.intent_id, "rejected", 0, text="no")
        third = place(led, "buy", bar=3, qty=3).intents[0]
        self.assertEqual(third.position_ref, second.position_ref)


class HowAFlatteningCallIsDivided(unittest.TestCase):
    """One order per position it reduces, bounded by what settled on each."""

    def test_it_is_bounded_by_what_settled_and_not_by_what_is_working_in(self):
        # A close chooses its own quantity, so a close counting an entry that has
        # not settled would send units that may never exist: measured by what an
        # opposing order may take, the whole nine lands on the first reference and
        # five of them are units nothing has yet bought.
        rows = list(rows_of(("buy", "", 4.0))) + list(working_rows(("buy", 6.0, None)))
        second = rows_of(("buy", "", 5.0))[0]
        second.position_ref = 2
        second.intent_id = 9
        rows.append(second)
        held = ABook(rows, {1: 4.0, 2: 5.0})
        divided = flattening(held, 9.0, "sell", None, "", None)
        self.assertEqual(
            tuple((one.placement.qty, one.placement.position_ref) for one in divided),
            ((4.0, 1), (5.0, 2)),
        )


class ThePositionBook(unittest.TestCase):
    def test_reducing_a_position_does_not_move_its_average(self):
        # An engine that took the closing fill's price into the average would
        # report an entry at a price nothing was entered at, and every level a
        # script measures from the entry would be measured from that.
        book = Positions()
        ref = book.mint()
        book.settle(ref, 10, 100.0)
        book.settle(ref, -4, 130.0)
        self.assertEqual(book.avg_price(), 100.0)
        self.assertEqual(book.size(), 6)

    def test_a_fill_past_zero_opens_the_other_side_at_its_own_price(self):
        book = Positions()
        ref = book.mint()
        book.settle(ref, 10, 100.0)
        book.settle(ref, -14, 90.0)
        self.assertEqual(book.size(), -4)
        self.assertEqual(book.avg_price(), 90.0)

    def test_the_average_is_taken_over_the_side_of_the_net(self):
        # Summed across both sides the cost of a position on the way out is
        # subtracted from the cost of the one on the way in, and the quotient is a
        # price nothing was entered at: three hundred bought at one hundred beside
        # fifty sold at one hundred and ten reported an entry at seventy six.
        book = Positions()
        held = book.mint()
        against = book.mint()
        book.settle(held, 300, 100.0)
        book.settle(against, -50, 110.0)
        self.assertEqual(book.size(), 250)
        self.assertEqual(book.avg_price(), 100.0)

    def test_a_reference_with_no_fill_holds_nothing(self):
        book = Positions()
        self.assertEqual(book.size_of(book.mint()), 0)
        self.assertIsNone(book.avg_price())


if __name__ == "__main__":
    unittest.main()
