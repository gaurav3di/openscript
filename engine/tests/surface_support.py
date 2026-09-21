"""The programs the surface tests run, built one channel at a time.

A surface is a declaration in ``outputs`` pointing at a channel
(``compiled-program.md`` 2.7), so a test about one is a program with that
declaration and the two or three instructions that write its channel. The
builders below write those, and nothing else: every other table is what
``support.program`` leaves empty, and a default that decided anything would be a
test passing for a reason its own file does not show.
"""

from typing import Any, Dict, List, Optional, Sequence

from tests import support

from openscript.contracts import Bar, BarState
from openscript.run import load
from openscript.verify import capabilities

#: Pool entries these programs reach for, after the three 2.9 reserves.
ABSENT_AT = 0
HUNDRED = 3
MARK = 4
PAINT = 5
OTHER = 6

#: The pool those indexes address. The two colours carry arbitrary channels: the
#: named colours are the authority in ``spec/colours.json`` and a test about a
#: name reads them from there rather than writing a third copy of one.
POOL: List[Any] = support.RESERVED + [
    ["n", 100],
    ["s", "UP"],
    ["c", [17, 34, 51, 1]],
    ["c", [68, 85, 102, 0.5]],
]


def started(raw: Dict[str, Any]) -> Any:
    """A loaded run of a program, or the diagnostic that refused it."""
    return load(raw, {}, None, capabilities=capabilities())


def bar(index: int, close: Any, high: Any = None) -> Bar:
    """One bar. ``close`` and ``high`` may be absent, which is what a gap is."""
    return Bar(time=float(index) * 60000.0, open=close, high=high, low=close, close=close)


def executed(
    run: Any,
    prices: Sequence[Any],
    confirmed: Optional[Sequence[bool]] = None,
    indexes: Optional[Sequence[int]] = None,
    highs: Optional[Sequence[Any]] = None,
) -> List[Any]:
    """Every execution of a run, in the order a driver would ask for them.

    ``indexes`` lets one bar be executed more than once, which is what a moving
    bar is, and ``confirmed`` says which of those executions the engine decided.
    """
    out = []
    for at, close in enumerate(prices):
        index = at if indexes is None else indexes[at]
        decided = True if confirmed is None else confirmed[at]
        high = None if highs is None else highs[at]
        out.append(
            run.execute_bar(
                index,
                bar(index, close, high),
                BarState(is_new=True, is_confirmed=decided, is_realtime=not decided, updates=1.0),
                supplied=len(prices),
            )
        )
    return out


def plot(key: str, channel: int, title: str = "") -> Dict[str, Any]:
    """One declared plot, 2.8's own fields, with nothing the test is not about."""
    return {
        "key": key,
        "title": title or key,
        "type": "line",
        "channel": channel,
        "color": None,
        "colorChannel": None,
        "width": 1.5,
        "lineStyle": "solid",
        "offset": 0,
        "overlay": None,
        "scale": "right",
        "precision": None,
        "priceFormat": None,
        "ohlc": None,
    }


def band(
    first: str, second: str, up: Optional[int] = None, down: Optional[int] = None
) -> Dict[str, Any]:
    """One declared band between two plot keys, 2.8's ``fills[]``."""
    return {
        "between": [first, second],
        "colorUp": None,
        "colorDown": None,
        "colorUpChannel": up,
        "colorDownChannel": down,
        "opacity": 1,
        "overlay": None,
    }


def marker(key: str, channel: int) -> Dict[str, Any]:
    """One declared marker, 2.8's ``markers[]``: the channel carries the text."""
    return {
        "key": key,
        "channel": channel,
        "position": "above",
        "shape": "label",
        "color": None,
        "textColor": None,
    }


def level(channel: int, title: str = "") -> Dict[str, Any]:
    """One declared level, 2.8's ``levels[]``: the channel carries the price."""
    return {
        "title": title,
        "channel": channel,
        "color": [128, 128, 128, 1],
        "lineStyle": "dashed",
        "lineWidth": 1,
    }


def outputs(**changed: Any) -> Dict[str, Any]:
    """The eight fields of ``outputs``, with the ones a test declares filled in."""
    built: Dict[str, Any] = {
        "plots": [],
        "fills": [],
        "levels": [],
        "markers": [],
        "tables": [],
        "alerts": [],
        "barColor": None,
        "background": None,
    }
    built.update(changed)
    return built


def marking(kind: str = "string", constant: int = MARK) -> Dict[str, Any]:
    """A program that writes a pool entry on the bars above a hundred.

    The branch is what makes the channel absent on the other bars, and 2.7 says
    that is the only way a channel is absent: nothing wrote it.
    """
    return support.program(
        [
            ["SLOAD", 0],
            ["CONST", HUNDRED],
            ["GT"],
            ["JUMP_FALSE", 6],
            ["CONST", constant],
            ["EMIT", 0],
            ["HALT"],
        ],
        consts=POOL,
        channels=[support.channel(0, kind, defer=True)],
        series=[support.register(0, "close")],
        outputs=outputs(markers=[marker("m0", 0)]),
    )


def painting(field: str, colour: Optional[Sequence[float]] = None) -> Dict[str, Any]:
    """A program that paints the bars above a hundred and leaves the rest alone.

    ``colour`` is the pool entry the paint writes, as 2.9 writes one: red, green
    and blue as whole numbers and an alpha from 0 to 1. A test about a named
    colour passes the channels ``spec/colours.json`` holds for that name.
    """
    pool = list(POOL)
    if colour is not None:
        pool[PAINT] = ["c", list(colour)]
    return support.program(
        [
            ["SLOAD", 0],
            ["CONST", HUNDRED],
            ["GT"],
            ["JUMP_FALSE", 6],
            ["CONST", PAINT],
            ["JUMP", 7],
            ["CONST", ABSENT_AT],
            ["EMIT", 0],
            ["HALT"],
        ],
        consts=pool,
        channels=[support.channel(0, "color", once=True)],
        series=[support.register(0, "close")],
        outputs=outputs(**{field: {"channel": 0}}),
    )


def levelling() -> Dict[str, Any]:
    """A program whose first level is the close and whose second is never written.

    Two levels rather than one, because what a row has to say when one of them
    is not drawn is which of the declared levels it is.
    """
    return support.program(
        [["SLOAD", 0], ["EMIT", 0], ["HALT"]],
        consts=POOL,
        channels=[support.channel(0, "number", once=True), support.channel(1, "number")],
        series=[support.register(0, "close")],
        outputs=outputs(levels=[level(0, "Close"), level(1, "Never")]),
    )


def banding(coloured: bool = False) -> Dict[str, Any]:
    """A program with two plotted columns and one band drawn between them.

    ``coloured`` adds the per-bar colour channel 2.8 gives a band whose script
    computed a colour rather than declaring one, written on the bars above a
    hundred, so that a row carries a colour on some bars and null on others.
    """
    code: List[Any] = [["SLOAD", 0], ["EMIT", 0], ["SLOAD", 1], ["EMIT", 1]]
    channels = [support.channel(0, "number", once=True), support.channel(1, "number", once=True)]
    if coloured:
        code += [
            ["SLOAD", 0],
            ["CONST", HUNDRED],
            ["GT"],
            ["JUMP_FALSE", 10],
            ["CONST", PAINT],
            ["EMIT", 2],
        ]
        channels.append(support.channel(2, "color"))
    code.append(["HALT"])
    return support.program(
        code,
        consts=POOL,
        channels=channels,
        series=[support.register(0, "close"), support.register(1, "high")],
        outputs=outputs(
            plots=[plot("a", 0, "First"), plot("b", 1, "Second")],
            fills=[band("a", "b", up=2 if coloured else None)],
        ),
    )
