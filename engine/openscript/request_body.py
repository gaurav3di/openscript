"""A request expression, executed over the requested bars, `compiled-program.md` 2.16.1.

**The body is a program the machine already knows how to run.** It holds the
tables a program holds for the machine of section 3 and none of the tables that
describe a chart, so the whole of this module is: build a program-shaped view
whose code, frame, registers, cells, states, functions and loops are the body's
own, keep the constant pool and the library manifest the program's, and drive the
same machine over it once per requested bar. Nothing new is asked of the
instruction loop, which is why a body ends in ``RET`` rather than in an opcode of
its own.

**Every table is counted from zero and none of them is the program's.** The
registers are the requested instrument's bars and the cells and state regions
step once per requested bar, so a body that reached into the program's tables
would put this chart's history behind another chart's name.

**A requested bar moves exactly as the chart's newest bar does.** ``settle`` is a
bar that has closed and ``peek`` the one still forming, and every execution
starts from the state the last settled bar left, so peeking one bucket on ten
chart bars gives the answer peeking it once does. That is section 6 one level
down, and it is what makes a ``"developing"`` read the bucket so far. The state
is copied only when a peek is about to change it, the way ``run.py`` copies a
bar's checkpoint only when the bar is executed a second time: a confirmed read
settles each bucket once and copies nothing.

**What a call inside a body is told** is the chart's instrument record with the
three facts that identify an instrument replaced by the read's own (its symbol,
its exchange, its timeframe as the interval), the requested bar's own prices as
the bar a call reads, no session, and the reads written inside this one as the
requests ``req.isReady`` and ``req.error`` answer about. That is the first
engine's body, fact for fact.
"""

import copy
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .bars import bar_field, facts_for
from .budget import Budget, EngineLimits, step_bound
from .contracts import Bar, BarState, CallContext, Library
from .dates import BAR_TIME
from .machine import Machine
from .memory import Cells, Channels, Register, States
from .program import LoadedProgram, loaded
from .request_plan import Plan
from .values import ABSENT, ArrayValue, is_number

#: The tables a body replaces in the program it is written in, section 2.16.1.
_OWN = ("frame", "series", "cells", "states", "functions", "callSites", "loops", "code", "requests")


def body_program(parent: LoadedProgram, request: Dict[str, Any]) -> LoadedProgram:
    """The body's tables wearing a program's shape.

    A copy of the parent with its own tables written over, so the two things the
    two share by design, the constant pool and the manifest, are shared by
    construction. A read carries no channel, so the view has none, which is also
    what verification refused an ``EMIT`` inside a body against.
    """
    body = request["body"]
    raw = dict(parent.raw)
    for name in _OWN:
        raw[name] = body[name]
    raw["channels"] = []
    raw["debug"] = dict(parent.raw["debug"], pos=body["pos"], fnPos=body["fnPos"])
    return loaded(raw, parent.entries)


def carry(value: Any) -> Any:
    """A value the body produced, as a value of the machine that reads it.

    A number, a string, a colour or absence is the same value on both sides. An
    array is not handed over as itself, because the chart would then hold the
    body's own array and a ``push`` there would reach back into another machine's
    memory; it is copied, sharing what it shared, on every bar that reads it.
    Only an array can arrive: a drawing or a grid inside a read is OS3006.
    """
    return copy.deepcopy(value) if isinstance(value, ArrayValue) else value


class RequestBody:
    """One read's expression, its memory, and the requested bars it has settled."""

    def __init__(
        self,
        program: LoadedProgram,
        plan: Plan,
        limits: EngineLimits,
        library: Library,
        inputs: Sequence[Tuple[int, Any]],
        nested: Any,
    ) -> None:
        raw = program.raw
        self.program = program
        self.plan = plan
        self.inputs = list(inputs)
        #: The reads written inside this one (``requests.RequestSet``).
        self.nested = nested
        self.cells = Cells(len(raw["cells"]))
        self.states = States(len(raw["states"]))
        self.registers = [Register() for _ in raw["series"]]
        budget = Budget(step_bound(raw), program.loop_budget, limits.string_length)
        self.machine = Machine(program, self.cells, self.states, self.registers, Channels(0), budget, library)
        self._live = [at for at, one in enumerate(raw["cells"]) if one["kind"] == "live"]
        #: Requested bars that have closed, which is the index the next one takes.
        self.settled = 0
        #: Executions of the requested bar still forming, for ``bar.updates``.
        self.touches = 0
        #: The previous requested bar's close, which ``trueRange`` reads.
        self.last_close: Any = ABSENT
        #: The requested bars themselves, which a read written inside folds.
        self.history: List[Bar] = []
        #: The state the last settled bar left, while a peek has written over it.
        self._kept: Optional[Tuple[Any, Any, Any]] = None
        self._nested_mark: Any = None

    def peek(self, bar: Bar, context: CallContext) -> Any:
        """The requested bar still forming. Nothing is committed: it is still moving."""
        value = self._execute(bar, False, context)
        self.touches += 1
        return value

    def settle(self, bar: Bar, context: CallContext) -> Any:
        """The requested bar has closed, and the state it leaves is the next one's start."""
        value = self._execute(bar, True, context)
        self._kept = None
        retained = self.program.retained
        if retained is not None:
            for register in self.registers:
                register.trim(retained)
        self.last_close = _price(bar.close)
        self.settled += 1
        self.touches = 0
        return value

    def _execute(self, bar: Bar, closed: bool, context: CallContext) -> Any:
        index = self.settled
        # Steps 1 and 2 one level down: the state the last settled bar left, and
        # no history entry a previous execution of this requested bar wrote.
        if self._kept is not None:
            self._restore(self._kept)
        elif not closed:
            self._kept = copy.deepcopy((self.cells.values, self.cells.ready, self.states.regions))
        for register in self.registers:
            register.truncate(index)
            register.current = ABSENT
        # A bar that has closed is not the last one, since something later closed
        # it; the one still forming is.
        state = BarState(
            is_new=self.touches == 0,
            is_confirmed=closed,
            is_realtime=False,
            updates=float(self.touches + 1),
        )
        facts = facts_for(index, index + (2 if closed else 1), state)
        inside = CallContext(
            bar_index=index,
            instrument=self._instrument(context.instrument),
            now=context.now,
            requests=self.nested,
            bar=self._bar(bar),
        )
        self.machine.begin(index, inside)
        for at, declared in enumerate(self.program.raw["series"]):
            if declared["kind"] == "bar":
                self.registers[at].current = bar_field(declared["field"], bar, facts)
        # A setting a body reads arrives as a register, resolved once at load.
        for series, value in self.inputs:
            self.registers[series].current = value
        if not self.nested.empty:
            self._fold_nested(index, bar, inside)
        value = self.machine.execute()
        for register in self.registers:
            register.close()
        return value

    def _fold_nested(self, index: int, bar: Bar, inside: CallContext) -> None:
        """The reads written inside this one, over the requested bars so far.

        Handed over one requested bar at a time, so a nested lookahead read sees
        no further than the requested bar being executed, which is what the mode
        does on a live chart's newest bucket, one level down.
        """
        if index < len(self.history):
            self.history[index] = bar
        else:
            self.history.append(bar)
        if self.touches == 0:
            self._nested_mark = self.nested.mark()
        else:
            self.nested.restore(self._nested_mark, self.history)
        self.nested.fill(self.registers, self.history, index, inside)

    def _restore(self, kept: Tuple[Any, Any, Any]) -> None:
        """Back to the last settled bar, except that a live cell keeps what it holds now."""
        was = [(at, self.cells.values[at], self.cells.ready[at]) for at in self._live]
        values, flags, regions = copy.deepcopy(kept)
        self.cells.values[:] = values
        self.cells.ready[:] = flags
        self.states.regions = regions
        for at, value, flag in was:
            self.cells.values[at] = value
            self.cells.ready[at] = flag

    def _instrument(self, enclosing: Any) -> Dict[str, Any]:
        """The enclosing record, with the read's own identity written over three facts."""
        query = self.plan.query
        facts = dict(enclosing)
        if query.instrument is not None:
            facts["symbol"] = query.instrument
        if query.exchange is not None:
            facts["exchange"] = query.exchange
        facts["interval"] = query.timeframe
        return facts

    def _bar(self, bar: Bar) -> Dict[str, Any]:
        """The requested bar as a library call reads one. No session: absent, not false."""
        return {
            "open": _price(bar.open),
            "high": _price(bar.high),
            "low": _price(bar.low),
            "close": _price(bar.close),
            "volume": _price(bar.volume),
            "previousClose": self.last_close,
            BAR_TIME: _price(bar.time),
        }


def _price(value: Any) -> Any:
    return float(value) if is_number(value) else ABSENT
