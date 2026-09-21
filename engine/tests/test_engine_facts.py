"""What this engine holds and what it reads, without a case to drive it.

The manifest a load is held to, the two namespaces that are not in the library,
the bar facts the seam states and the session boundary an engine derives. Each
is reachable on its own, so each is tested on its own here, and
``test_strategy_profile.py`` next door drives the same readings through a whole
case.
"""

import unittest
from typing import Optional

from openscript.adapter.answers import describe
from openscript.adapter.facts import chart_value, position_value
from openscript.adapter.page import PROFILES
from openscript.adapter.sessions import Session, first_bars, session_from
from openscript.adapter.serving import Serving
from openscript.adapter.spellings import Malformed
from openscript.contracts import CallContext


class TheManifest(unittest.TestCase):
    """What this engine says it holds, which is what a load is held to."""

    def test_an_order_call_is_held_to_the_argument_count_the_compiler_emits(self):
        # compiled-program.md 4.10 adds one argument to every order call, so the
        # arity is one more than the signature. Catches a manifest written from
        # the signature alone: every strategy would be refused at load with
        # OS6004 naming a function this engine does have.
        serving = Serving(book=None)
        self.assertIsNotNone(serving.entry("buy", 6))
        self.assertIsNone(serving.entry("buy", 5))
        self.assertEqual(serving.entry("buy", 6).effect, "order")
        self.assertEqual(serving.entry("buy", 6).state, False)

    def test_both_halves_of_the_library_are_in_the_manifest(self):
        # Catches a seam that serves the stateless half only: every windowed
        # study would be refused at load, and a strategy that took an average
        # would never reach its first order.
        serving = Serving(book=None)
        self.assertIsNotNone(serving.entry("max", 2))
        self.assertIsNotNone(serving.entry("ema", 2))
        self.assertIsNone(serving.entry("ema", 3))

    def test_a_position_fact_is_served_only_where_there_is_a_ledger(self):
        # Catches an engine answering pos.size zero for a run with no position
        # book, which is a study quietly reading a position that does not exist.
        self.assertIsNone(Serving(book=None).entry("pos.size", 0))
        self.assertIsNotNone(Serving(book=_Flat()).entry("pos.size", 0))

    def test_a_name_no_table_holds_is_described_rather_than_served(self):
        serving = Serving(book=None)
        self.assertIsNone(serving.entry("draw.line", 5))
        self.assertIn("no function called draw.line", serving.describe("draw.line"))
        self.assertIn("6", serving.describe("buy"))


class _Flat:
    """A position book holding nothing, for a test about the manifest."""

    def size(self) -> float:
        return 0.0

    def avg_price(self) -> Optional[float]:
        return None


class TheBarFacts(unittest.TestCase):
    """The facts the library reads off the bar, which no context carries."""

    def test_a_stateful_call_reads_the_close_and_the_volume_of_this_bar(self):
        # vwap is the volume weighted average since the session opened, so it
        # reads three facts the caller states: the close, the volume and whether
        # the session opened here. Catches a seam that states only the three
        # trueRange needs, under which every volume study answers absence on
        # every bar and a chart shows a silently empty line.
        serving = Serving(book=None)
        serving.at_bar(
            {
                "high": 101.0,
                "low": 99.0,
                "close": 100.0,
                "previousClose": None,
                "volume": 10.0,
                "isSessionFirst": True,
            },
            True,
        )
        context = CallContext(bar_index=0, instrument={}, now=None)
        self.assertEqual(serving.call("vwap", [100.0], {}, context), 100.0)


class TheFacts(unittest.TestCase):
    """``stdlib.md`` 3.4 and 17.4, each read from where the page says it comes from."""

    def test_a_fact_the_host_did_not_state_is_absent_and_the_symbol_is_empty(self):
        # host-interface.md 4.1's own column. Catches an engine defaulting a tick
        # size, under which a script sizing a stop in ticks cannot tell "the
        # smallest increment is five paise" from "nobody said".
        self.assertIsNone(chart_value("chart.tickSize", {}, None))
        self.assertEqual(chart_value("chart.symbol", {}, None), "")
        self.assertEqual(chart_value("chart.tickSize", {"tickSize": 0.05}, None), 0.05)

    def test_the_clock_is_the_case_fixed_value_and_never_a_reading(self):
        self.assertEqual(chart_value("chart.now", {}, 1735689600000), 1735689600000)

    def test_a_flat_position_is_a_size_of_zero_and_an_absent_price(self):
        # Section 17.4 states both and says why they differ: zero is the true
        # size, and zero is a price a script would take a branch on. Catches an
        # engine answering one of them the other way.
        book = _Flat()
        self.assertEqual(position_value("pos.size", book), 0.0)
        self.assertIsNone(position_value("pos.avgPrice", book))
        self.assertEqual(position_value("pos.isFlat", book), True)
        self.assertEqual(position_value("pos.isLong", book), False)


class TheSession(unittest.TestCase):
    """``host-interface.md`` 4.3, derived rather than asked for."""

    def test_a_record_with_no_session_leaves_every_bar_absent(self):
        # 4.1: a host that holds no schedule gets the facts absent, which is what
        # an instrument with no schedule looks like. Catches an engine answering
        # false, under which a session study runs and draws nothing and the
        # author has nothing on the chart to say why.
        self.assertEqual(first_bars([0, 3600000], None), (None, None))

    def test_the_first_bar_of_each_day_opens_a_session_that_runs_all_day(self):
        # The suite's own default window. Catches an engine that reads the first
        # bar of the dataset as the only session start.
        whole = Session(0, 24 * 60, tuple(range(1, 8)))
        hourly = [at * 3600000 for at in range(0, 30)]
        opens = first_bars(hourly, whole)
        self.assertEqual([at for at, held in enumerate(opens) if held], [0, 24])

    def test_a_window_inside_a_day_leaves_the_bars_outside_it_closed(self):
        # Catches a window read as a whole day, which would open the session at
        # midnight and put every intraday boundary on the wrong bar.
        morning = Session(9 * 60, 12 * 60, tuple(range(1, 8)))
        hourly = [at * 3600000 for at in range(0, 24)]
        self.assertEqual([at for at, held in enumerate(first_bars(hourly, morning)) if held], [9])
        self.assertEqual(first_bars([8 * 3600000], morning), (False,))

    def test_a_window_whose_end_is_before_its_start_crosses_midnight(self):
        # 4.3: what an overnight session needs. Catches an engine reading the
        # window as an empty one, under which no bar is ever in session, and one
        # that opens a new session at midnight in the middle of a night.
        night = Session(22 * 60, 2 * 60, tuple(range(1, 8)))
        hourly = [at * 3600000 for at in range(20, 28)]
        self.assertEqual(
            [at + 20 for at, held in enumerate(first_bars(hourly, night)) if held], [22]
        )

    def test_a_day_the_session_does_not_run_on_is_not_a_session(self):
        # The epoch was a Thursday, which is day 4. Catches an off-by-one in the
        # numbering, which would move every weekly rule by a day.
        thursdays = Session(0, 24 * 60, (4,))
        self.assertEqual(first_bars([0], thursdays), (True,))
        self.assertEqual(first_bars([86400000], thursdays), (False,))

    def test_a_session_stated_without_a_zone_is_refused_rather_than_read(self):
        # 4.3's own table: three records are a host that believes it stated a
        # session and did not, and each is refused rather than answered with the
        # absence an honest record gives.
        window = {"start": "09:00", "end": "17:30", "days": [1, 2, 3, 4, 5]}
        with self.assertRaises(Malformed) as refused:
            session_from({"session": window})
        self.assertIn("timezone", str(refused.exception))
        for broken in ({"start": "9:00"}, {"days": []}, {"days": [0]}, {"end": "25:00"}):
            with self.assertRaises(Malformed):
                session_from({"timezone": "UTC", "session": {**window, **broken}})

    def test_a_record_that_states_a_session_is_read_as_minutes(self):
        held = session_from({"timezone": "UTC", "session": {"start": "09:15", "end": "24:00", "days": [1]}})
        self.assertEqual((held.start, held.end, held.days), (555, 1440, (1,)))


class TheProfile(unittest.TestCase):
    def test_the_engine_claims_the_profile_that_covers_the_cases_it_runs(self):
        # Catches an engine that runs the money and goes on claiming the narrowest
        # profile: the runner would skip every strategy case, the run would report
        # a pass with nothing in it, and section 9 says a skipped case is never a
        # pass. This is the assertion that stops the suite going green by absence.
        self.assertEqual(describe()["profile"], PROFILES[2])

