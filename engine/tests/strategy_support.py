"""What a test of the strategy profile builds its programs and its cases out of.

A case carries source and this engine implements no compiler, so a test here
cannot compile one: it builds the compiled program itself. The three below are
the smallest programs that reach what this stage owns, and every constant beside
them is a file of a case directory, written by the test rather than recorded by
a run.

Nothing here decides anything. The bars are four numbers a reader can multiply,
the declaration holds every field this engine reads and nothing it does not, and
the frames are one line naming the bar they arrive after.
"""

import json
import tempfile
import unittest
from pathlib import Path
from typing import Any, Dict, Optional

from tests.support import POOL, channel, program, register

from openscript.adapter.answers import answer_for
from openscript.canonical import canonicalise

#: Four bars an hour apart, whose closes are exact in binary64.
BARS = (
    "time,open,high,low,close,volume\n"
    "0,100,101,99,100,10\n"
    "3600000,100,101,99,101,10\n"
    "7200000,100,101,99,102,10\n"
    "10800000,100,101,99,103,10\n"
)

#: One frame per line, delivered after the bar the first column names.
FILLED = "afterBar,intent,status,filledQty,avgFillPrice,orderRef,text\n0,1,filled,1,100,R1,\n"

CASE = {
    "id": "adapter/traded",
    "category": "strategy",
    "profile": "strategy",
    "languageVersion": 1,
    "description": "One order, one fill, one ledger row.",
    "asserts": ["orders"],
}

BACKTEST = json.dumps({"digits": 2, "costs": None, "range": {"from": None, "to": None}})

INSTRUMENT = json.dumps(
    {
        "symbol": "AAA",
        "exchange": "XX",
        "currency": "CUR",
        "interval": "60",
        "timezone": "UTC",
        "tickSize": 0.05,
        "lotSize": 1,
        "pointValue": 1,
        "hasVolume": True,
    }
)

#: The declaration a strategy of this engine's is run under. Every field this
#: engine reads is here, and nothing it does not read.
DECLARATION = {
    "capital": 100000,
    "currency": "CUR",
    "qty": 1,
    "qtyType": "units",
    "product": "intraday",
    "fillOn": "nextOpen",
    "slippage": 0,
    "commission": 0,
    "commissionType": "perTrade",
    "pyramiding": 1,
    "closeOnSessionEnd": False,
}

#: The pool this file's programs reach into, after the three section 2.9 reserves.
CONSTS = list(POOL) + [["s", ""], ["s", "qty"]]
EMPTY = len(POOL)
WRITTEN = EMPTY + 1

#: ``buy``'s manifest row: five parameters and the written names 4.10 adds.
BUY = {"name": "buy", "arity": 6, "state": False, "effect": "order"}
SIZE = {"name": "pos.size", "arity": 0, "state": False, "effect": "none"}

#: The one plot these programs emit through, which is what names a column of
#: ``expected.csv`` and what lets the values channel be read back.
PLOT = {
    "key": "p0",
    "title": "size",
    "type": "line",
    "channel": 0,
    "color": None,
    "colorChannel": None,
    "width": 1,
    "lineStyle": "solid",
    "offset": 0,
    "overlay": None,
    "scale": "right",
    "precision": None,
    "priceFormat": None,
    "ohlc": None,
}

#: The suite's own default window, which is every hour of every day.
WHOLE_DAY = {"start": "00:00", "end": "24:00", "days": [1, 2, 3, 4, 5, 6, 7]}

#: What the position reads on each bar once the fill of ``FILLED`` has folded.
HELD = "bar,size\n0,0\n1,1\n2,1\n3,1\n"

#: And what it reads when the case supplies no frame at all.
NEVER = "bar,size\n0,0\n1,0\n2,0\n3,0\n"


def buying(always: bool = False, **declared: Any) -> Dict[str, Any]:
    """A strategy that buys one unit and emits the position it reads.

    The emitted channel is ``pos.size``, which is what makes the fold's boundary
    visible: the order is sent on bar 0, the frame arrives after it, and the size
    the script reads is zero until the bar the fold happened at.

    ``always`` drops the guard, so the buy is sent on every bar, which is what a
    declaration allowing one entry has to refuse. ``declared`` overrides a field
    of the declaration, for a test about a figure the declaration fixes.
    """
    sending = [
        ["CONST", 4],  # qty, which is 1
        ["CONST", 0],  # limit, absent
        ["CONST", 0],  # stop, absent
        ["CONST", EMPTY],  # tag
        ["CONST", 0],  # leg, absent
        ["CONST", WRITTEN],  # the arguments the script wrote, 4.10's extra one
        ["CALL_LIB", 0, 6, -1],  # buy, which pushes absence and leaves a record
        ["POP"],
    ]
    guard = (
        []
        if always
        else [
            ["CALL_LIB", 1, 0, -1],  # pos.size, which is 0 only while flat
            ["CONST", 3],  # 0
            ["EQ"],
            ["JUMP_FALSE", len(sending) + 4],
        ]
    )
    made = program(
        guard + sending + [["CALL_LIB", 1, 0, -1], ["EMIT", 0], ["HALT"]],
        consts=CONSTS,
        channels=[channel(0)],
        series=[register(0, "close")],
        requires=["core.1", "orders"],
        lib={"manifest": 1, "functions": [BUY, SIZE]},
    )
    made["meta"] = {**made["meta"], "kind": "strategy", "strategy": {**DECLARATION, **declared}}
    made["outputs"]["plots"] = [dict(PLOT)]
    return made


#: ``sell``'s row, which is ``buy``'s in the other direction.
SELL = {"name": "sell", "arity": 6, "state": False, "effect": "order"}


def opposing() -> Dict[str, Any]:
    """A strategy that sends a buy and a sell on the same bar, which is refused.

    ``stdlib.md`` 17.2 refuses two calls on opposite sides of one bar, because
    which of the two to honour has no defensible answer. What it is here for is
    the half of the rule that is this adapter's: the bar sends both or neither,
    so the row the buy had already appended has to be taken back.
    """
    def order(which: int) -> list:
        return [
            ["CONST", 4],
            ["CONST", 0],
            ["CONST", 0],
            ["CONST", EMPTY],
            ["CONST", 0],
            ["CONST", WRITTEN],
            ["CALL_LIB", which, 6, -1],
            ["POP"],
        ]

    made = program(
        order(0) + order(1) + [["CONST", 3], ["EMIT", 0], ["HALT"]],
        consts=CONSTS,
        channels=[channel(0)],
        series=[register(0, "close")],
        requires=["core.1", "orders"],
        lib={"manifest": 1, "functions": [BUY, SELL]},
    )
    made["meta"] = {**made["meta"], "kind": "strategy", "strategy": dict(DECLARATION)}
    made["outputs"]["plots"] = [dict(PLOT)]
    return made


#: ``vwap(src)``, which reads the close, the volume and the session boundary.
VWAP = {"name": "vwap", "arity": 1, "state": True, "effect": "none"}


def averaging() -> Dict[str, Any]:
    """A study that emits the volume weighted average since the session opened.

    One call, and it reads three facts that are not its argument: this bar's
    volume, the close it is weighted by and whether the session opened here. So
    it is the whole of what the seam has to state about a bar, in one number a
    reader can check by hand.
    """
    made = program(
        [["SLOAD", 0], ["CALL_LIB", 0, 1, 0], ["EMIT", 0], ["HALT"]],
        consts=CONSTS,
        channels=[channel(0)],
        series=[register(0, "close")],
        requires=["core.1"],
        lib={"manifest": 1, "functions": [VWAP]},
        states=[{"id": 0, "fn": 0}],
    )
    made["outputs"]["plots"] = [dict(PLOT)]
    return made


def envelope(made: Dict[str, Any]) -> Dict[str, Any]:
    """What the invocation carries: the compiled program as canonical text."""
    return {"program": canonicalise(made)}


class Cases(unittest.TestCase):
    def setUp(self):
        holder = tempfile.TemporaryDirectory()
        self.addCleanup(holder.cleanup)
        self.root = Path(holder.name)

    def case(self, **files: Optional[str]) -> str:
        """One case directory holding the files named, and nothing else."""
        here = self.root / "adapter" / "traded"
        here.mkdir(parents=True, exist_ok=True)
        held = {
            "case.json": json.dumps(CASE),
            "script.os": "buy()\n",
            "bars.csv": BARS,
            "backtest.json": BACKTEST,
            "instrument.json": INSTRUMENT,
            "frames.csv": FILLED,
            **files,
        }
        for name, text in held.items():
            path = here / name
            if text is None:
                if path.exists():
                    path.unlink()
                continue
            path.write_text(text, encoding="utf-8")
        return str(here)

    def answer(self, **files: Optional[str]) -> Dict[str, Any]:
        return answer_for(self.case(**files), envelope(buying()))

