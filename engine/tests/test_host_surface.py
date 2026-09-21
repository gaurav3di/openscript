"""The engine driven the way a live host drives it, one bar at a time.

Every other test of this engine reaches it through the conformance adapter,
which is a batch run over a case directory: it reads the bars out of a file,
executes all of them and compares channels at the end. A host serving a chart
does none of that. It holds one loaded program for as long as the session lasts,
pushes the newest bar in as it moves, sends whatever the decided bar handed over,
folds the destination's answers back in at the boundary between two bars, and
stops when a bar carries a diagnostic. If ``run.py`` were missing one of those,
nobody would find out here: they would find out while writing the runner.

So this file is that loop, written against nothing but what a host can import,
and the class below is the whole of it. What it proves is narrow and worth
saying exactly: that the surface is sufficient to drive a strategy and get
orders out, not that a host built on it would be correct.

**Two things this file had to reach into ``adapter/`` for**, and they are named
here rather than quietly imported: ``Serving``, which is the only implementation
of the library the machine calls into, and ``options_for``, which turns a
declaration and an instrument record into the ledger's settings. Neither is a
conformance concern and both are on the road of every host, so a live runner
imports two names out of a package whose own docstring is about the batch
adapter. That is said rather than fixed, because this file owns no module.

Each test below names the wrong implementation it catches, and each was run
against that mistake before it was kept. A test that cannot fail is
documentation with a green tick on it.
"""

import json
import unittest
from typing import Any, Dict, List, Optional

from tests import support
from tests.strategy_support import DECLARATION, INSTRUMENT, buying
from tests.test_bar_cycle import library as mean_library

from openscript.adapter.ordering import options_for
from openscript.adapter.serving import Serving
from openscript.adapter.sessions import SESSION_FIRST
from openscript.canonical import canonicalise
from openscript.contracts import Bar, BarState
from openscript.inputs import utc_time
from openscript.run import load, load_text
from openscript.strategy import IntentBar, Ledger, OrderFrame, OrderIntent
from openscript.values import ABSENT
from openscript.verify import capabilities

#: ``compiled-program.md`` 2.2's tag for a program that places orders.
ORDERS = "orders"

#: The instrument record the host states, read from the case fixture rather than
#: written a second time here.
RECORD: Dict[str, Any] = json.loads(INSTRUMENT)


def closing(updates: float) -> BarState:
    """The last execution of a live bar: decided, and still in front of you.

    ``support.confirmed()`` is the backtest's spelling of a decided bar and says
    the run is not live, which is the one thing a host driving a session cannot
    say. The difference is not cosmetic: section 5.4 raises an alert only on a
    bar the host called realtime.
    """
    return BarState(is_new=False, is_confirmed=True, is_realtime=True, updates=updates)


class Host:
    """A session: one loaded program, a ledger beside it, and the bar loop.

    The order of the four things that happen around one execution is
    ``host-interface.md`` 7.4's and not this class's choice. The fold is before
    the execution, so a script cannot react inside the bar its own order was sent
    on; the orders are taken after it, because step 9 is what decides whether the
    bar's calls happened at all.

    Nothing here supplies a bar count. A host serving a session does not know one:
    the newest bar is the last bar it has, which is what ``execute_bar`` assumes
    when it is not told otherwise, and a runner that had to invent a total would
    be inventing ``bar.isLast``.
    """

    def __init__(self, text: str, settings: Optional[Dict[str, Any]] = None) -> None:
        self.ledger = Ledger()
        self.serving = Serving(self.ledger)
        self.loaded = load_text(
            text,
            {} if settings is None else settings,
            self.serving,
            capabilities=capabilities(ORDERS),
            read_time=utc_time,
        )
        self.run = self.loaded.run
        #: Every intent the run handed over, in the order it made them, which is
        #: what a host sends and what it matches a frame back to.
        self.intents: List[OrderIntent] = []
        self.columns: List[List[Any]] = []
        self.diagnostic: Any = None
        self.refusal: Any = None
        if self.run is not None and self.run.program.raw["meta"]["kind"] == "strategy":
            declared = {
                name: self.run.declaration(("meta", "strategy", name)) for name in DECLARATION
            }
            self.ledger.options = options_for(declared, RECORD)

    def execute(self, index: int, close: float, state: BarState, previous: Any = ABSENT) -> Any:
        """One execution of one bar, with the boundary work either side of it."""
        if state.is_new:
            # The boundary: what the destination answered since the last bar.
            self.ledger.settle()
        self.serving.at_bar(
            {
                "high": close,
                "low": close,
                "close": close,
                "previousClose": previous,
                "volume": 10.0,
                SESSION_FIRST: index == 0,
            },
            index == 0,
        )
        bar = Bar(time=float(index) * 60000.0, open=close, high=close, low=close, close=close)
        result = self.run.execute_bar(index, bar, state, instrument=RECORD)
        if not result.ok:
            self.diagnostic = result.diagnostic
            return result
        self.columns.append(list(result.columns))
        for effect in result.applied:
            placed = self.ledger.place(
                effect.name, effect.arguments, IntentBar(index=index, time=bar.time), effect.position
            )
            if placed.refusal is not None:
                self.refusal = placed.refusal
                return result
            self.intents.extend(placed.intents)
        return result

    def answer(self, frame: OrderFrame) -> None:
        """The destination spoke. It is held until the next bar boundary."""
        self.ledger.deliver(frame)


def strategy_text() -> str:
    """The compiled program a host is handed, as the canonical text it travels as.

    Built by the fixture that builds one for the adapter's own tests, because this
    engine holds no compiler and a program written out by hand here would be a
    format this file invented.
    """
    return canonicalise(buying())


class LoadingACompiledProgram(unittest.TestCase):
    """Section 9.4 through the one door a host has: text in, a run or a code out."""

    def test_a_host_loads_the_program_as_text_and_gets_a_run_it_can_drive(self):
        # Catches: a LoadResult whose ok does not follow its diagnostic. Run
        # against `ok` answering `self.diagnostic is not None`, this fails on its
        # first assertion, and so does every other test in this file, because
        # `ok` is the whole of what a host branches on before it drives anything.
        host = Host(strategy_text())
        self.assertTrue(host.loaded.ok, msg=str(host.loaded.diagnostic))
        self.assertIsNone(host.loaded.diagnostic)
        self.assertIsNotNone(host.run)
        # And the declaration a host has to size from is readable through the
        # run rather than out of the text it was handed.
        self.assertEqual(host.run.declaration(("meta", "strategy", "qty")), 1)
        self.assertEqual(host.run.declaration(("meta", "strategy", "product")), "intraday")

    def test_a_program_this_run_cannot_serve_is_refused_at_load_by_name(self):
        # Catches: a run that serves the position namespace with no ledger behind
        # it, which would load a strategy and quietly trade nothing. Run against
        # `Serving._facts` answering every name whether or not a book was given,
        # the load succeeds and this fails.
        #
        # The refusal is what a host shows the author, so the code and the name
        # are both asserted: a refusal that did not say which function it could
        # not serve would send the author to read the whole script.
        result = load_text(
            strategy_text(),
            {},
            Serving(None),
            capabilities=capabilities(ORDERS),
            read_time=utc_time,
        )
        self.assertFalse(result.ok)
        self.assertIsNone(result.run)
        self.assertEqual(result.diagnostic.code, "OS6004")
        self.assertEqual(result.diagnostic.values.get("name"), "pos.size")


class DrivingTheBarsOfAStrategy(unittest.TestCase):
    """The loop, the orders that come out of it and the answers that go back in.

    Four bars, and the program is the fixture's: it buys one unit while flat and
    emits the position it reads, so the column is where the fold becomes visible.
    """

    def setUp(self):
        self.host = Host(strategy_text())
        self.assertTrue(self.host.loaded.ok, msg=str(self.host.loaded.diagnostic))
        self.closes = (100.0, 101.0, 102.0, 103.0)

    def test_an_order_intent_comes_out_where_the_host_can_read_and_send_it(self):
        # Catches: step 9 handing nothing back. Run against `execute_bar`
        # answering an empty `applied`, the bar hands no call over, the count
        # below is 0 and this fails there. The order call is the one thing a
        # chart never needed and a host cannot do without.
        first = self.host.execute(0, self.closes[0], support.confirmed())
        self.assertTrue(first.ok, msg=str(first.diagnostic))
        self.assertEqual(len(first.applied), 1)
        self.assertEqual(first.applied[0].name, "buy")
        self.assertEqual(first.applied[0].effect, "order")
        # The call carries where it was written, which is what a refusal of it
        # has to point at.
        self.assertIsNotNone(first.applied[0].position)

        self.assertEqual(len(self.host.intents), 1)
        intent = self.host.intents[0]
        # Every field a host needs to make an order out of it. The quantity is
        # in the unit the declaration named and is not translated into lots
        # here: symbology is the host's.
        self.assertEqual(intent.kind, "place")
        self.assertEqual(intent.side, "buy")
        self.assertEqual(intent.qty, 1.0)
        self.assertEqual(intent.qty_type, "units")
        self.assertEqual(intent.order_type, "market")
        self.assertEqual(intent.product, "intraday")
        self.assertEqual(intent.instrument.symbol, RECORD["symbol"])
        self.assertEqual(intent.instrument.exchange, RECORD["exchange"])
        self.assertEqual(intent.bar.index, 0)
        # And the row the ledger appended for it, at the engine's own status:
        # an intent has left and nothing has come back.
        row = self.host.ledger.row_for(intent.intent_id)
        self.assertIsNotNone(row)
        self.assertEqual(row.status, "placed")
        self.assertEqual(row.filled_qty, 0.0)

    def test_a_frame_folded_back_in_moves_the_ledger_and_the_script_reads_it(self):
        # Catches: a fold that settles nothing. Run against `Ledger.settle`
        # skipping its `self._positions.settle(...)` line, the size after the
        # fold is still 0 and this fails there, with the columns flat behind it.
        #
        # The fold is also asserted to happen at the boundary and not inside the
        # bar that placed the order: the script reads 0 on bar 0 and 1 from bar 1
        # on, which is the difference between a position and an intention.
        first = self.host.execute(0, self.closes[0], support.confirmed())
        self.assertTrue(first.ok, msg=str(first.diagnostic))
        self.assertEqual(self.host.ledger.size(), 0.0, msg="nothing has filled yet")

        # The destination answers about the intent this run minted, which is how
        # a host matches one to the other.
        intent = self.host.intents[0]
        self.host.answer(
            OrderFrame(
                intent_id=intent.intent_id,
                status="filled",
                filled_qty=1.0,
                avg_fill_price=100.0,
                order_ref="R1",
                time=0.0,
            )
        )
        self.assertEqual(self.host.ledger.size(), 0.0, msg="delivered, not yet folded")

        for index in range(1, 4):
            self.host.execute(index, self.closes[index], support.confirmed(), self.closes[index - 1])

        self.assertEqual(self.host.ledger.size(), 1.0)
        self.assertEqual(self.host.ledger.avg_price(), 100.0)
        row = self.host.ledger.row_for(intent.intent_id)
        self.assertEqual(row.status, "filled")
        self.assertEqual(row.filled_qty, 1.0)
        self.assertEqual(row.order_ref, "R1")
        # The column is the position the script itself read, bar by bar.
        self.assertEqual([one[0] for one in self.host.columns], [0.0, 1.0, 1.0, 1.0])

    def test_a_moving_bar_hands_nothing_over_until_the_bar_is_decided(self):
        # Catches: step 9 applying a bar's effects on every execution rather
        # than on the decided one. Run against `decided` set to True in
        # `execute_bar`, the two moving executions hand the buy over as well and
        # this fails on its first assertion. It is the case a live host meets on
        # every bar and a backtest never meets at all.
        moving = [
            self.host.execute(0, 99.0, support.moving(1.0)),
            self.host.execute(0, 100.5, support.moving(2.0)),
        ]
        self.assertEqual([len(one.applied) for one in moving], [0, 0])
        self.assertEqual(self.host.intents, [])

        decided = self.host.execute(0, 100.0, closing(3.0))
        self.assertEqual(len(decided.applied), 1)
        self.assertEqual(len(self.host.intents), 1)
        self.assertEqual(self.host.intents[0].side, "buy")


class RewindingABarThatIsStillMoving(unittest.TestCase):
    """Section 6: the checkpoint, from the side that needs it every bar.

    The program here is the one the specification prints, because it is the one
    that accumulates: a library call holding a window, and a cell counting the
    bars that cleared it. A rollback that did not happen shows up in both.
    """

    def setUp(self):
        loaded = load(support.worked_example(), {}, mean_library(), capabilities=capabilities())
        self.assertTrue(loaded.ok, msg=str(loaded.diagnostic))
        self.run = loaded.run
        self.closes = (100.0, 102.0, 101.0, 105.0, 106.0)

    def at(self, index: int, close: float) -> Bar:
        return Bar(time=float(index), open=None, high=None, low=None, close=close)

    def drive(self, run, upto: int) -> None:
        for index in range(upto):
            run.execute_bar(index, self.at(index, self.closes[index]), support.confirmed())

    def test_a_bar_executed_three_times_is_accumulated_once(self):
        # Catches: a re-execution that does not roll back, which is the engine's
        # step 1. Run against the `if self._checkpoint.bar == index` branch of
        # `execute_bar` removed, the window takes three pushes for one bar, the
        # count reaches 7 instead of 5 and the answer stops agreeing with the run
        # that executed each bar once.
        once = load(support.worked_example(), {}, mean_library(), capabilities=capabilities()).run
        self.drive(once, 5)
        settled = list(once.channels.values)

        self.drive(self.run, 4)
        moving = [
            self.run.execute_bar(4, self.at(4, 104.0), support.moving(1.0)),
            self.run.execute_bar(4, self.at(4, 105.0), support.moving(2.0)),
            self.run.execute_bar(4, self.at(4, self.closes[4]), closing(3.0)),
        ]
        self.assertTrue(all(one.ok for one in moving))
        # The bar moved three times and the engine saw one of it.
        self.assertEqual(self.run.states.regions[0]["seen"], 5)
        self.assertEqual(list(self.run.cells.values), list(once.cells.values))
        self.assertEqual(moving[-1].columns, settled)

    def test_the_host_can_put_the_state_back_itself(self):
        # Catches: a restore that puts back the cells and forgets the library's
        # own regions. Run against `restore` leaving `self.states.regions` alone,
        # the window is still holding bar 4 and the first assertion after the
        # restore fails, reading 5 where it recorded 4 before the bar ran. This
        # is the call a host makes for itself: a replay, a step backwards, a bar
        # the feed corrected after the fact.
        self.drive(self.run, 4)
        mark = self.run.checkpoint()
        before = (self.run.states.regions[0]["seen"], list(self.run.cells.values))

        out = self.run.execute_bar(4, self.at(4, self.closes[4]), support.confirmed())
        self.assertTrue(out.ok, msg=str(out.diagnostic))
        self.assertNotEqual(
            (self.run.states.regions[0]["seen"], list(self.run.cells.values)),
            before,
            msg="the bar has to move something, or the rollback proves nothing",
        )

        self.run.restore(mark)
        self.assertEqual(self.run.states.regions[0]["seen"], before[0])
        self.assertEqual(list(self.run.cells.values), before[1])
        # And the bar executed again from there answers what it answered the
        # first time, which is the property a replay rests on.
        again = self.run.execute_bar(4, self.at(4, self.closes[4]), support.confirmed())
        self.assertEqual(again.columns, out.columns)


class ABarThatCarriesADiagnostic(unittest.TestCase):
    """What a host does when the third bar of a live session fails.

    The program reads an element of a two element array at an index the bar's own
    close gives it, so the third bar indexes past the end and the run stops there
    (OS4004). Built with the fixture the interpreter's own tests build programs
    with, since this engine has no compiler to make one from source.
    """

    #: One constant past the pool the fixture shares, which is what the close is
    #: measured against.
    CONSTS = list(support.POOL) + [["n", 100]]
    BASE = len(support.POOL)
    CODE = [
        ["CONST", 4],  # 1
        ["CONST", 5],  # 2
        ["ARRAY", 2],
        ["SLOAD", 0],  # the close
        ["CONST", BASE],  # 100
        ["SUB"],
        ["ELEM"],
        ["EMIT", 0],
        ["HALT"],
    ]

    def setUp(self):
        raw = support.program(
            self.CODE,
            consts=self.CONSTS,
            channels=[support.channel(0)],
            series=[support.register(0, "close")],
            requires=support.tags_for(self.CODE),
        )
        loaded = load_text(canonicalise(raw), {}, None, capabilities=capabilities())
        self.assertTrue(loaded.ok, msg=str(loaded.diagnostic))
        self.run = loaded.run

    def test_the_run_stops_at_the_bar_that_failed_and_what_came_before_stands(self):
        # Catches: a bar that fails answering ok, which would have the host carry
        # a half executed state into the next bar. Run against the `except
        # ScriptError` handler of `execute_bar` re-raising instead of returning a
        # BarResult, or against it returning one with no diagnostic, this fails:
        # in the first case the loop never gets an answer at all, in the second
        # the run is carried on past the bar that broke.
        answered = []
        stopped = None
        for index, close in enumerate((100.0, 101.0, 102.0, 103.0)):
            bar = Bar(time=float(index), open=close, high=close, low=close, close=close)
            result = self.run.execute_bar(index, bar, support.confirmed())
            if not result.ok:
                stopped = result
                break
            # Read the way a host reads it: a bar that answered ok and carried no
            # column is recorded as that rather than throwing here, so a run that
            # walks past the bar that failed is caught by the assertion below and
            # not by this loop falling over.
            answered.append(result.columns[0] if result.columns else None)

        self.assertEqual(answered, [1.0, 2.0], msg="the bars before it answered and stand")
        self.assertIsNotNone(stopped, msg="the third bar has to fail, or this proves nothing")
        self.assertEqual(stopped.index, 2)
        self.assertFalse(stopped.ok)
        # The code and the position, not the wording: a code is a promise.
        self.assertEqual(stopped.diagnostic.code, "OS4004")
        self.assertEqual((stopped.diagnostic.line, stopped.diagnostic.column), (1, 1))
        # Nothing half done comes out of the bar that failed: no columns, no
        # channels applied and nothing to send.
        self.assertEqual(stopped.columns, [])
        self.assertEqual(stopped.applied, [])
        self.assertEqual(stopped.alerts, [])


if __name__ == "__main__":
    unittest.main()
