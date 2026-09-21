"""What the order layer refuses, and the wrong belief each refusal is there to stop.

Assert the code, never the message text: wording is allowed to improve and a code
is a promise. The catalogue owns the sentences and this engine retypes none of
them.

**An order is the one place where doing nothing quietly is worse than stopping
loudly**, and every refusal here is a call that would otherwise leave a script
believing something false about its own position:

- **An argument written as absent** is a sizing calculation that has not warmed up
  or a divisor that was zero. Read as a default it would place an order at the
  declaration's size on a bar the script meant to place none, or a market order
  wearing the name of the stop order it asked for.
- **A negative quantity** is a calculation that went the wrong way, and direction
  is chosen by the function rather than by the sign.
- **A stated close quantity larger than what is left** would cross zero and leave
  a call named close holding a position on the other side.
- **A cancellation naming no working order** names something that has to be there.
- **A price off the tick** cannot exist at the exchange, and rounding it here
  would move the order off the level the script computed.
- **A second entry past the declared pyramiding** would build a position the
  declaration forbade.
- **Two opposite orders on one bar** have no defensible winner, so neither goes.
- **A protective level on the wrong side of the entry** is a stop that would fire
  at once.

And a refused call sends nothing at all, so there is nothing for a host to send
and nothing to take back afterwards.
"""

import unittest

from tests.orders_support import answer, ledger_with, place


class WhatTheCallItselfIsWrongAbout(unittest.TestCase):
    def test_an_argument_the_script_wrote_that_came_out_absent(self):
        led = ledger_with()
        placed = place(led, "buy", qty=None)
        self.assertEqual(placed.refusal.code, "OS7002")
        self.assertEqual(placed.refusal.values["argument"], "qty")
        self.assertEqual(placed.intents, ())
        self.assertEqual(led.rows(), [])

    def test_a_call_that_wrote_nothing_takes_the_declaration_s_size(self):
        # The other half of the same rule, and the one a test has to hold beside
        # it: an engine that refused both would refuse every script that ever
        # wrote a bare entry.
        led = ledger_with(declared_qty=3.0)
        self.assertIsNone(place(led, "buy").refusal)

    def test_the_first_absent_argument_is_the_one_reported(self):
        led = ledger_with()
        placed = place(led, "buy", qty=None, stop=None)
        self.assertEqual(placed.refusal.values["argument"], "qty")

    def test_a_negative_quantity(self):
        placed = place(ledger_with(), "buy", qty=-2)
        self.assertEqual(placed.refusal.code, "OS7004")

    def test_a_quantity_of_zero(self):
        placed = place(ledger_with(), "buy", qty=0)
        self.assertEqual(placed.refusal.code, "OS7004")

    def test_a_declaration_that_states_no_size_for_a_call_that_takes_it(self):
        placed = place(ledger_with(declared_qty=0.0), "buy")
        self.assertEqual(placed.refusal.code, "OS7004")

    def test_a_named_type_whose_price_was_not_given(self):
        placed = place(ledger_with(), "order.place", side="buy", qty=1, type="limit")
        self.assertEqual(placed.refusal.code, "OS7007")
        self.assertEqual(placed.refusal.values["argument"], "price")

    def test_a_stop_limit_that_was_given_only_its_limit(self):
        placed = place(
            ledger_with(), "order.place", side="buy", qty=1, type="stopLimit", price=100.0
        )
        self.assertEqual(placed.refusal.code, "OS7007")
        self.assertEqual(placed.refusal.values["argument"], "trigger")


class AStatedCloseQuantity(unittest.TestCase):
    def test_larger_than_what_is_left_to_close(self):
        led = ledger_with()
        entry = place(led, "buy", qty=1).intents[0]
        answer(led, entry.intent_id, "filled", 1, 100.0)
        placed = place(led, "close", bar=1, qty=5)
        self.assertEqual(placed.refusal.code, "OS7017")
        self.assertEqual(placed.refusal.values["held"], 1.0)
        self.assertEqual(led.size(), 1)

    def test_twice_within_the_ceiling_is_still_outside_it(self):
        # Held against the leg alone each order is inside the ceiling and the pair
        # is outside it, and the leg ends one short.
        led = ledger_with()
        entry = place(led, "buy", qty=3).intents[0]
        answer(led, entry.intent_id, "filled", 3, 100.0)
        self.assertIsNone(place(led, "close", bar=1, qty=2).refusal)
        self.assertEqual(place(led, "close", bar=1, qty=2).refusal.code, "OS7017")

    def test_against_a_tag_that_has_already_flattened(self):
        led = ledger_with()
        entry = place(led, "buy", qty=2, tag="entry").intents[0]
        answer(led, entry.intent_id, "filled", 2, 100.0)
        closing = place(led, "close", bar=1, tag="entry").intents[0]
        answer(led, closing.intent_id, "filled", 2, 101.0)
        placed = place(led, "close", bar=2, tag="entry", qty=1)
        self.assertEqual(placed.refusal.code, "OS7017")

    def test_while_a_call_that_states_none_is_silent_on_the_same_tag(self):
        # The two look inconsistent and are not. A quantity is a claim about the
        # strategy's own position and the claim can be false; a call that writes
        # none asks the engine for the right number, and there is nothing there to
        # be wrong about.
        led = ledger_with()
        entry = place(led, "buy", qty=2, tag="entry").intents[0]
        answer(led, entry.intent_id, "filled", 2, 100.0)
        closing = place(led, "close", bar=1, tag="entry").intents[0]
        answer(led, closing.intent_id, "filled", 2, 101.0)
        quiet = place(led, "close", bar=2, tag="entry")
        self.assertIsNone(quiet.refusal)
        self.assertEqual(quiet.intents, ())

    def test_nothing_left_to_close_is_zero_in_every_unit(self):
        # The half of the comparison that needs no lot size, which is why it is
        # answered whatever the declaration counts in.
        led = ledger_with(qty_type="lots")
        placed = place(led, "close", qty=1)
        self.assertEqual(placed.refusal.code, "OS7017")

    def test_a_position_that_is_still_there_is_not_held_outside_units(self):
        # The one shape this engine does not enforce, waiting on the lot size
        # OS7005 is deferred on. Recorded as a test so that the day it is enforced
        # is a day this test changes rather than a day nobody notices.
        led = ledger_with(qty_type="lots")
        entry = place(led, "buy", qty=1).intents[0]
        answer(led, entry.intent_id, "filled", 75, 100.0)
        self.assertIsNone(place(led, "close", bar=1, qty=9).refusal)


class WhatOneOrderIsWrongAbout(unittest.TestCase):
    def test_a_cancellation_naming_no_working_order(self):
        placed = place(ledger_with(), "cancel", tag="nothing")
        self.assertEqual(placed.refusal.code, "OS7009")

    def test_a_cancellation_naming_an_order_that_has_ended(self):
        led = ledger_with()
        entry = place(led, "buy", qty=1, tag="entry").intents[0]
        answer(led, entry.intent_id, "filled", 1, 100.0)
        self.assertEqual(place(led, "cancel", bar=1, tag="entry").refusal.code, "OS7009")

    def test_a_price_that_does_not_fall_on_a_tick(self):
        led = ledger_with(tick_size=0.05)
        placed = place(led, "buy", qty=1, limit=100.02)
        self.assertEqual(placed.refusal.code, "OS7006")
        self.assertIsNone(place(led, "buy", qty=1, limit=100.05).refusal)

    def test_a_price_computed_from_the_tick_is_on_it(self):
        # A level two ticks above a close rarely divides by the tick exactly in
        # binary, and a comparison without a tolerance would refuse the price the
        # script correctly computed.
        led = ledger_with(tick_size=0.05)
        self.assertIsNone(place(led, "buy", qty=1, limit=100.0 + 3 * 0.05).refusal)

    def test_an_entry_past_the_declared_pyramiding(self):
        led = ledger_with(pyramiding=1)
        entry = place(led, "buy", qty=1).intents[0]
        answer(led, entry.intent_id, "filled", 1, 100.0)
        placed = place(led, "buy", bar=1, qty=1)
        self.assertEqual(placed.refusal.code, "OS7008")
        self.assertEqual(placed.refusal.values["found"], 1)

    def test_an_order_that_has_not_filled_is_not_an_open_entry(self):
        # OS7008's own fix tells a reader to test the position, which is folded
        # from settled fills, so a count including a working order would refuse a
        # script that had done exactly what the fix asked.
        led = ledger_with(pyramiding=1)
        place(led, "buy", qty=1)
        self.assertIsNone(place(led, "buy", bar=1, qty=1).refusal)

    def test_two_opposite_orders_on_one_bar(self):
        led = ledger_with(pyramiding=2)
        place(led, "buy", qty=1)
        placed = place(led, "sell", qty=1)
        self.assertEqual(placed.refusal.code, "OS7013")
        self.assertEqual(placed.refusal.values["bar"], 0)

    def test_the_same_two_on_two_bars_are_ordinary(self):
        led = ledger_with(pyramiding=2)
        place(led, "buy", qty=1)
        self.assertIsNone(place(led, "sell", bar=1, qty=1).refusal)

    def test_a_stop_above_the_entry_of_a_long_position(self):
        led = ledger_with()
        entry = place(led, "buy", qty=1).intents[0]
        answer(led, entry.intent_id, "filled", 1, 100.0)
        placed = place(led, "exit", bar=1, tag="entry", stop=101.0)
        self.assertEqual(placed.refusal.code, "OS7010")

    def test_a_target_below_the_entry_of_a_long_position(self):
        led = ledger_with()
        entry = place(led, "buy", qty=1).intents[0]
        answer(led, entry.intent_id, "filled", 1, 100.0)
        placed = place(led, "exit", bar=1, tag="entry", limit=99.0)
        self.assertEqual(placed.refusal.code, "OS7010")

    def test_a_level_at_the_entry_is_not_refused(self):
        # Moving every stop to its own entry is a rule the language names, so the
        # price that rule produces cannot be one the language will not take.
        led = ledger_with()
        entry = place(led, "buy", qty=1).intents[0]
        answer(led, entry.intent_id, "filled", 1, 100.0)
        self.assertIsNone(place(led, "exit", bar=1, tag="entry", stop=100.0).refusal)

    def test_a_bracket_beside_the_entry_it_protects_is_not_refused(self):
        # The common shape: the entry has not filled, so there is nothing yet for
        # the level to be on the wrong side of.
        led = ledger_with()
        place(led, "buy", qty=1, tag="entry")
        self.assertIsNone(place(led, "exit", tag="entry", stop=120.0, limit=80.0).refusal)


class ARefusedCallSendsNothing(unittest.TestCase):
    def test_a_call_that_would_have_sent_two_orders_sends_neither(self):
        led = ledger_with(pyramiding=2, tick_size=0.05)
        entry = place(led, "buy", qty=6).intents[0]
        answer(led, entry.intent_id, "filled", 6, 100.0)
        before = len(led.rows())
        placed = place(led, "sell", bar=1, qty=9, limit=100.02)
        self.assertEqual(placed.refusal.code, "OS7006")
        self.assertEqual(placed.intents, ())
        self.assertEqual(len(led.rows()), before)


if __name__ == "__main__":
    unittest.main()
