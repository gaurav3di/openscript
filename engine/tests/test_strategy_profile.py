"""The strategy profile, from the order call to the ledger to the report.

The repository's own suite holds two strategy cases, and what runs them end to
end is the conformance runner: a case carries source, and this engine implements
no compiler, so a test here cannot compile one. What a test here can do is build
the compiled program itself, which is what ``strategy_support.py`` does, and
drive the whole of the adapter over a case directory it wrote: the effects step
9 applied, the frames the case delivered, the fold at the boundary, and the three
channels the answer carries.

Each test names the wrong implementation it catches, because a test that no
implementation could fail is a green tick on a sentence. The ones worth reading
twice are those that would pass an engine that did nothing at all: an engine
answering an empty ledger passes any test that asserts only an outcome, so every
one of them asserts a value as well.

The readings a case does not drive, the manifest, the two namespaces and the
session, are next door in ``test_engine_facts.py``.
"""

import json
import unittest
from typing import Any, List, Optional

from tests.strategy_support import (
    CASE,
    DECLARATION,
    FILLED,
    HELD,
    INSTRUMENT,
    NEVER,
    WHOLE_DAY,
    Cases,
    averaging,
    buying,
    envelope,
    opposing,
)

from openscript.adapter.answers import answer_for, result_for
from openscript.adapter.ordering import Desk, options_for
from openscript.adapter.reading import Frame, read_case
from openscript.adapter.spellings import Malformed
from openscript.diagnostics import Position
from openscript.machine import PendingEffect
from openscript.strategy import IntentBar


class AnOrderCall(Cases):
    def test_it_reaches_the_ledger_and_appends_a_row(self):
        # Catches a drive that never applies step 9's effects: the run would
        # succeed, every channel would be empty, and a case asserting an empty
        # ledger would pass. The row's own fields are asserted for the same
        # reason: a ledger holding one row of the wrong order is not a ledger.
        found = self.answer()
        self.assertEqual(found["unsupported"], [])
        rows = found["channels"]["orders"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["side"], "buy")
        self.assertEqual(rows[0]["qty"], 1.0)
        self.assertEqual(rows[0]["intent"], 1)
        self.assertEqual(rows[0]["symbol"], "AAA")
        self.assertEqual(rows[0]["placedAt"], 0.0)

    def test_a_frame_the_case_supplies_is_folded_into_that_row(self):
        # Catches an engine that answers its own frames, or none: the status and
        # the price below are the case's file and nothing this engine could
        # invent, which is section 3's whole reason for supplying them.
        rows = self.answer()["channels"]["orders"]
        self.assertEqual(rows[0]["status"], "filled")
        self.assertEqual(rows[0]["filledQty"], 1.0)
        self.assertEqual(rows[0]["avgFillPrice"], 100.0)
        self.assertEqual(rows[0]["orderRef"], "R1")

    def test_a_case_with_no_frames_leaves_the_order_where_it_was_sent(self):
        # The other half, and the one that catches an engine filling its own
        # orders: "a case with no frames.csv is handed no frames at all".
        rows = self.answer(**{"frames.csv": None})["channels"]["orders"]
        self.assertEqual(rows[0]["status"], "placed")
        self.assertEqual(rows[0]["filledQty"], 0.0)
        self.assertIsNone(rows[0]["avgFillPrice"])


class TheFold(Cases):
    def sizes(self, expected: str, **files: Optional[str]) -> List[Any]:
        """What ``pos.size`` read on each bar, and the case's own verdict on it."""
        declared = {**CASE, "asserts": ["values"]}
        directory = self.case(
            **{"case.json": json.dumps(declared), "expected.csv": expected, **files}
        )
        found = answer_for(directory, envelope(buying()))
        self.assertEqual(found["unsupported"], [])
        self.assertEqual(result_for(directory, envelope(buying()))["outcome"], "pass")
        return [row["size"] for row in found["channels"]["values"]]

    def test_a_frame_is_folded_at_the_boundary_and_not_inside_the_bar(self):
        # host-interface.md 7.4. Catches a drive that folds during an execution,
        # which would let the script read a position on the bar its own order was
        # sent in, and one that folds a bar late, which would be a strategy
        # reacting one bar after everybody else. The frame is delivered after bar
        # 0, so the size is 0 on bar 0 and 1 from bar 1.
        self.assertEqual(self.sizes(HELD), [0.0, 1.0, 1.0, 1.0])

    def test_a_case_with_no_frames_never_moves_the_position(self):
        # Catches a ledger that settles a position from the order it sent rather
        # than from a fill: every figure in the language is folded from fills.
        self.assertEqual(self.sizes(NEVER, **{"frames.csv": None}), [0.0, 0.0, 0.0, 0.0])


class TheReport(Cases):
    def test_the_trades_and_the_summary_are_folded_from_the_fills(self):
        # Catches an engine that answers the two channels empty. One fill opens a
        # trade and nothing closes it, so the run holds one open trade, and the
        # capital is the declaration's rather than a default.
        declared = {**CASE, "asserts": ["trades", "performance"]}
        found = answer_for(self.case(**{"case.json": json.dumps(declared)}), envelope(buying()))
        self.assertEqual(found["unsupported"], [])
        trades = found["channels"]["trades"]
        self.assertEqual(len(trades), 1)
        self.assertEqual(trades[0]["isOpen"], True)
        self.assertEqual(trades[0]["entryPrice"], 100.0)
        self.assertEqual(trades[0]["side"], "long")
        # The bar the fold happened at, which is the bar the position exists
        # from: the frame is delivered after bar 0 and folded before bar 1.
        # Catches a drive that folds at the end of the bar the frame arrived
        # after, which no position reading can tell apart and which moves every
        # trade's own clock by one bar.
        self.assertEqual(trades[0]["openedOnBar"], 1)
        self.assertEqual(trades[0]["openedAt"], 3600000.0)
        summary = found["channels"]["performance"]
        self.assertEqual(len(summary), 1)
        self.assertEqual(summary[0]["capital"], 100000.0)
        self.assertEqual(summary[0]["openTradeCount"], 1)
        self.assertEqual(summary[0]["currency"], "CUR")

    def test_the_money_is_rounded_to_the_digit_count_the_case_states(self):
        # A charge of an eighth is the smallest figure that tells two digit
        # counts apart: rounded half to even at two places it is 0.12, and at
        # four it is the eighth itself. Catches an engine reading the count from
        # anywhere but backtest.json, which the two harvested cases cannot: every
        # figure in them is exact at two places and at four.
        declared = {**CASE, "asserts": ["trades"]}
        found = answer_for(
            self.case(**{"case.json": json.dumps(declared)}), envelope(buying(commission=0.125))
        )
        self.assertEqual(found["unsupported"], [])
        self.assertEqual(found["channels"]["trades"][0]["charges"], 0.12)

    def test_a_strategy_case_with_no_backtest_file_is_refused_by_name(self):
        # Section 3: the file is required of a strategy case and a runner reports
        # a case without it as an error. Catches an engine that ran the case
        # under a digit count nobody stated, which is the way two engines agree
        # by coincidence and then stop agreeing.
        found = result_for(self.case(**{"backtest.json": None}), envelope(buying()))
        self.assertEqual(found["outcome"], "error")
        self.assertIn("backtest.json", found["reason"])

    def test_the_window_decides_which_bars_the_report_is_about(self):
        # Section 3: a bar outside the window executes and is not reported. The
        # entry is on bar 0 and the window starts at the third bar, so the trade
        # is carried in and the report holds two bars. Catches a window compared
        # against a calendar, or ignored.
        window = json.dumps({"digits": 2, "costs": None, "range": {"from": 7200000, "to": None}})
        declared = {**CASE, "asserts": ["performance"]}
        found = answer_for(
            self.case(**{"case.json": json.dumps(declared), "backtest.json": window}),
            envelope(buying()),
        )
        self.assertEqual(found["channels"]["performance"][0]["barCount"], 2)


class TheDeclaration(Cases):
    def test_the_entries_one_direction_may_hold_are_the_declaration_s(self):
        # stdlib.md 17.2: an entry past the declared pyramiding is refused, and
        # the refusal stops the bar. The buy is sent on every bar here, so the
        # second one meets a position the declaration allows one entry in.
        # Catches a ledger built with a pyramiding of this engine's own, which
        # the two harvested cases cannot: both guard their own entries with
        # pos.size and never send a second one.
        declared = {**CASE, "asserts": ["diagnostics", "orders"]}
        found = answer_for(
            self.case(**{"case.json": json.dumps(declared)}), envelope(buying(always=True))
        )
        self.assertEqual(found["unsupported"], [])
        self.assertEqual(len(found["channels"]["orders"]), 1)
        self.assertEqual([one["code"] for one in found["channels"]["diagnostics"]], ["OS7008"])
        self.assertEqual(found["channels"]["diagnostics"][0]["barIndex"], 1)

    def test_a_refused_call_takes_back_every_row_its_bar_had_appended(self):
        # A bar sends both orders or neither. Catches a drive that hands the
        # earlier call's row over and then stops: the ledger would report an
        # order at placed with an empty reference that no destination was ever
        # handed, and a host reconciling after a stopped run would see an order
        # it never received.
        declared = {**CASE, "asserts": ["diagnostics", "orders"]}
        found = answer_for(
            self.case(**{"case.json": json.dumps(declared)}), envelope(opposing())
        )
        self.assertEqual(found["unsupported"], [])
        self.assertEqual(found["channels"]["orders"], [])
        self.assertEqual([one["code"] for one in found["channels"]["diagnostics"]], ["OS7013"])
        self.assertEqual(found["channels"]["diagnostics"][0]["barIndex"], 0)

    def test_a_study_that_places_an_order_is_refused_rather_than_run(self):
        # A study carries no declaration, so an order sent from one would be an
        # order sized by this adapter's defaults. Catches an engine that ran it:
        # the ledger would answer with a quantity, a product and a pyramiding
        # limit nobody wrote, and the case would compare them.
        made = buying()
        made["meta"] = {**made["meta"], "kind": "study"}
        found = result_for(self.case(), envelope(made))
        self.assertEqual(found["outcome"], "error")
        self.assertIn("study", found["reason"])

    def test_a_program_that_declares_no_strategy_settings_is_refused(self):
        # Catches an engine sizing an order from a field that was not there,
        # which is an order nobody wrote.
        made = buying()
        made["meta"] = {**made["meta"], "strategy": {"qty": 1}}
        found = result_for(self.case(), envelope(made))
        self.assertEqual(found["outcome"], "error")
        self.assertIn("qtyType", found["reason"])


class FramesPastTheLastBar(Cases):
    def test_a_frame_no_boundary_folds_is_named_rather_than_dropped(self):
        # The page fixes a fold before the next execution and the last bar has
        # none. Catches an engine that drops the frame silently, which is a
        # ledger missing whatever the frame said and a case that fails somewhere
        # else entirely.
        late = FILLED.replace("\n0,1,filled", "\n3,1,filled")
        found = result_for(self.case(**{"frames.csv": late}), envelope(buying()))
        self.assertEqual(found["outcome"], "unsupported")
        self.assertIn("frames.csv", found["feature"])


class TheDesk(unittest.TestCase):
    """The ledger, its intents and its fills, driven without a program."""

    def desk(self) -> Desk:
        held = Desk(
            [
                Frame(
                    after_bar=0,
                    intent=1,
                    status="filled",
                    filled_qty=1.0,
                    avg_fill_price=100.0,
                    order_ref="R1",
                    text="",
                )
            ]
        )
        held.begin(options_for(DECLARATION, json.loads(INSTRUMENT)))
        return held

    def test_a_fill_carries_the_reference_the_frame_that_made_it_carried(self):
        # The fill is what the money is folded from and the reference is the
        # destination's own record of the order it came off. Catches a drive that
        # folds the frames and keeps none of what they said, which no channel
        # this engine answers today would show and a host reconciling a run
        # would.
        desk = self.desk()
        sent = PendingEffect(0, "buy", "order", [1.0, None, None, "", None, "qty"], Position(1, 1))
        self.assertIsNone(desk.apply([sent], IntentBar(index=0, time=0.0)))
        desk.deliver_after(0)
        desk.fold(1, 3600000.0)
        settled = desk.fills.settled()
        self.assertEqual(len(settled), 1)
        self.assertEqual(settled[0].order_ref, "R1")
        self.assertEqual(settled[0].bar_index, 1)
        self.assertEqual(settled[0].price, 100.0)

    def test_a_frame_naming_an_intent_the_run_never_placed_settles_nothing(self):
        # Section 3: an ordinal greater than the number of intents the run placed
        # is how a case hands an engine a frame about an order its ledger does
        # not hold. Catches a drive that matched it to whatever it had.
        desk = self.desk()
        desk.deliver_after(0)
        desk.fold(1, 3600000.0)
        self.assertEqual(desk.fills.settled(), ())
        self.assertEqual(list(desk.rows()), [])


class TheBarFactsOverACase(Cases):
    """The same three facts, stated by the drive rather than by a test."""

    def test_a_study_that_weights_by_volume_reads_the_bar_the_case_supplied(self):
        # Every figure below is arithmetic a reader can check: ten units at 100,
        # then at 101, and so on, all in one session. Catches a drive that states
        # only the facts trueRange needs, under which every volume study answers
        # absence on every bar, the case fails on a column of nothing, and the
        # engine looks wrong about arithmetic it never reached.
        session = {**json.loads(INSTRUMENT), "session": WHOLE_DAY}
        declared = {**CASE, "asserts": ["values"], "profile": "core", "category": "numerics"}
        directory = self.case(
            **{
                "case.json": json.dumps(declared),
                "instrument.json": json.dumps(session),
                "expected.csv": "bar,size\n0,100\n1,100.5\n2,101\n3,101.5\n",
                "backtest.json": None,
                "frames.csv": None,
            }
        )
        found = answer_for(directory, envelope(averaging()))
        self.assertEqual(found["unsupported"], [])
        self.assertEqual(
            [row["size"] for row in found["channels"]["values"]], [100.0, 100.5, 101.0, 101.5]
        )
        self.assertEqual(result_for(directory, envelope(averaging()))["outcome"], "pass")

    def test_a_record_with_no_session_leaves_the_average_with_nothing_to_restart_on(self):
        # The other half of the same fact, and the reason a session study is only
        # as good as the session: absence propagates rather than defaulting to a
        # restart the host never stated.
        declared = {**CASE, "asserts": ["values"], "profile": "core", "category": "numerics"}
        directory = self.case(
            **{
                "case.json": json.dumps(declared),
                "expected.csv": "bar,size\n0,none\n1,none\n2,none\n3,none\n",
                "backtest.json": None,
                "frames.csv": None,
            }
        )
        self.assertEqual(result_for(directory, envelope(averaging()))["outcome"], "pass")


class TheFramesFile(Cases):
    def test_the_rows_are_read_in_file_order_and_never_sorted(self):
        # Section 3: "several rows may name one bar and are delivered in file
        # order, which is how a case orders two frames that cross". Catches a
        # reader that sorted or bucketed them by anything of its own.
        rows = (
            "afterBar,intent,status,filledQty,avgFillPrice,orderRef,text\n"
            "1,1,working,0,none,R1,\n"
            "0,1,filled,1,100,R1,\n"
        )
        read = read_case(self.case(**{"frames.csv": rows}))
        self.assertEqual([one.after_bar for one in read.frames], [1, 0])
        self.assertEqual(read.frames[0].avg_fill_price, None)

    def test_an_optional_column_left_out_is_absent_on_every_row(self):
        rows = "afterBar,intent,status,filledQty,avgFillPrice\n0,1,filled,1,100\n"
        read = read_case(self.case(**{"frames.csv": rows}))
        self.assertEqual(read.frames[0].order_ref, "")

    def test_a_column_the_page_does_not_name_is_an_error(self):
        rows = "afterBar,intent,status,filledQty,avgFillPrice,orderRef,text,seq\n0,1,filled,1,100,R,,1\n"
        with self.assertRaises(Malformed):
            read_case(self.case(**{"frames.csv": rows}))

