"""The stateless half of the library manifest: what a name and an arity resolve to.

``CALL_LIB`` names a function by its index in a program's own table, and
`compiled-program.md` section 2.5 has the engine check every entry of that table
against its manifest at load: the name must exist, the arity must match, and
``state`` and ``effect`` must agree. This module is the half of that manifest
whose functions hold nothing across bars, keyed by name and arity, because the
library keys a function that way: ``change(src)`` and ``change(src, len)`` are two
functions and not one with a default.

**Every entry here is ``state`` false and ``effect`` none.** A function that holds
a state region across bars, and a function with an effect on the chart, the
ledger or the log, is in the stateful half. That is not a division of taste: a
stateless entry needs no state region, no checkpoint and no rollback
(`compiled-program.md` section 6), so an engine can call one of these from
anywhere without asking whose call site it is.

**What a call is given.** Three of these read something that is not an argument:
``roundToTick`` asks the host for the instrument's tick, ``trueRange`` reads the
bar and whether it is the oldest one, and the calls that make or read an array
reach the heap. None of those is this package's to own, so a call takes a context
and asks it. The protocol below is the whole of what the stateless half needs
from an interpreter, and it is written as six members rather than as an engine
object so that the interpreter stage can satisfy it with whatever it already has.
"""

from typing import Callable, Dict, NamedTuple, Optional, Protocol, Sequence, Tuple

from . import arithmetic, colour, elementary, rounding, strings
from .bars import true_range
from .number_text import spell, text_length, text_of, to_number
from .values import Value


class Context(Protocol):
    """What a stateless call may ask its caller for, and nothing more."""

    def bar(self, fact: str) -> Value:
        """One fact of the bar being computed: ``high``, ``low``, ``previousClose``."""

    def host(self, fact: str) -> Value:
        """One fact the host states about the instrument, such as ``tickSize``."""

    def first_bar(self) -> bool:
        """Whether this is the oldest bar of the dataset.

        ``trueRange`` turns on it, and no argument can answer it: `stdlib.md`
        section 6 grants that bar the library's one exception to absence
        propagation, and an absent previous close in the middle of a run is a
        hole rather than the start of history.
        """

    def kind_of(self, reference: Value) -> str:
        """The kind of a heap object, which is how ``text`` spells a reference."""

    def items_of(self, reference: Value) -> list[Value] | None:
        """The elements of an array, or absence when the value is not one."""

    def make_array(self, items: list[Value]) -> Value:
        """A new array on the heap, holding these elements in this order."""


Call = Callable[[Context, Sequence[Value]], Value]


class Entry(NamedTuple):
    """One manifest row: what a program's table is checked against at load."""

    name: str
    arity: int
    call: Call
    state: bool = False
    effect: str = "none"


def _at(args: Sequence[Value], index: int) -> Value:
    """An argument, or absence where the caller passed fewer than the arity.

    A call arrives with its defaults already filled (`compiled-program.md`
    section 4.10), so a short argument list is a program the load-time check
    should have refused. Absence rather than a raise, for the reason
    ``values.py`` gives.
    """
    return args[index] if index < len(args) else None


def _one(name: str, of: Callable[[Value], Value]) -> Entry:
    return Entry(name, 1, lambda _ctx, args: of(_at(args, 0)))


def _two(name: str, of: Callable[[Value, Value], Value]) -> Entry:
    return Entry(name, 2, lambda _ctx, args: of(_at(args, 0), _at(args, 1)))


def _three(name: str, of: Callable[[Value, Value, Value], Value]) -> Entry:
    return Entry(name, 3, lambda _ctx, args: of(_at(args, 0), _at(args, 1), _at(args, 2)))


def _constant(name: str, value: float) -> Entry:
    """A constant read bare, which the format still compiles to a call of none."""
    return Entry(name, 0, lambda _ctx, _args: value)


def _named_colour(name: str) -> Entry:
    """One of the nineteen bare colour names, which is also a call of no arguments."""
    return Entry(name, 0, lambda _ctx, _args: colour.named(name))


def _text(ctx: Context, args: Sequence[Value]) -> Value:
    return spell(_at(args, 0), ctx.kind_of)


def _split(ctx: Context, args: Sequence[Value]) -> Value:
    parts = strings.split(_at(args, 0), _at(args, 1))
    return None if parts is None else ctx.make_array(list(parts))


def _join(ctx: Context, args: Sequence[Value]) -> Value:
    items = ctx.items_of(_at(args, 0))
    return None if items is None else strings.join(items, _at(args, 1))


def _round_to_tick(ctx: Context, args: Sequence[Value]) -> Value:
    return rounding.round_to_tick(_at(args, 0), ctx.host("tickSize"))


def _true_range(ctx: Context, _args: Sequence[Value]) -> Value:
    return true_range(
        ctx.bar("high"), ctx.bar("low"), ctx.bar("previousClose"), ctx.first_bar()
    )


# `stdlib.md` section 8.1, the bare arithmetic.
_MATHS: tuple[Entry, ...] = (
    _one("abs", arithmetic.abs_of),
    _one("sign", arithmetic.sign),
    _two("min", arithmetic.minimum),
    _two("max", arithmetic.maximum),
    _three("clamp", arithmetic.clamp),
    _one("floor", rounding.floor),
    _one("ceil", rounding.ceil),
    _one("round", rounding.round_to_whole),
    _two("round", rounding.round_to),
    _one("trunc", rounding.trunc),
    _two("roundToStep", rounding.round_to_step),
    Entry("roundToTick", 1, _round_to_tick),
    _one("sqrt", elementary.sqrt),
    _two("pow", elementary.power),
    _one("exp", elementary.exp),
    _one("log", elementary.log),
    _one("log10", elementary.log10),
    _two("mod", arithmetic.mod),
    _one("isNone", arithmetic.is_none),
    _two("orElse", arithmetic.or_else),
    _one("toBool", arithmetic.to_bool),
)

# `stdlib.md` section 8.2, the `math` namespace.
_MATH_NAMESPACE: tuple[Entry, ...] = (
    _constant("math.pi", elementary.PI),
    _constant("math.e", elementary.E),
    _one("math.log2", elementary.log2),
    _two("math.hypot", elementary.hypot),
    _one("math.toDegrees", elementary.to_degrees),
    _one("math.toRadians", elementary.to_radians),
    _one("math.sin", elementary.sin),
    _one("math.cos", elementary.cos),
    _one("math.tan", elementary.tan),
    _one("math.asin", elementary.asin),
    _one("math.acos", elementary.acos),
    _one("math.atan", elementary.atan),
    _two("math.atan2", elementary.atan2),
)

# `stdlib.md` section 10, strings and formatting.
_TEXT: tuple[Entry, ...] = (
    Entry("text", 1, _text),
    _two("text", text_of),
    _one("toNumber", to_number),
    _one("str.length", strings.length),
    _one("str.upper", strings.upper),
    _one("str.lower", strings.lower),
    _one("str.trim", strings.trim),
    _two("str.contains", strings.contains),
    _two("str.startsWith", strings.starts_with),
    _two("str.endsWith", strings.ends_with),
    _two("str.indexOf", strings.index_of),
    _three("str.substring", strings.substring),
    _three("str.replace", strings.replace),
    _three("str.replaceAll", strings.replace_all),
    Entry("str.split", 2, _split),
    Entry("str.join", 2, _join),
    _three("str.padLeft", strings.pad_left),
    _three("str.padRight", strings.pad_right),
    _two("str.repeat", strings.repeat),
)

#: The two calls whose string can be measured before it is built, and the
#: function that measures each.
#:
#: The string ceiling is the interpreter's to spend and nothing in this package
#: raises, so this is how the two meet: the interpreter asks how long the string
#: will be and refuses the call rather than the result. Every other call that
#: builds a string is measured after it is built, because its length is not known
#: until the work is done, and that costs nothing: the length of a replaced or a
#: padded string is within a constant factor of what it was handed. These two are
#: not, and a count a script computed can ask either of them for a string no
#: engine could hold.
#: The calls that BUILD a string, and so are held to the code point ceiling.
#:
#: Named rather than inferred, because the answer's type cannot tell a string a
#: call made from one it passed through. `orElse(chart.symbol, "x")` answers a
#: string, and it is the host's symbol: refusing it for being long would refuse
#: the host its own instrument name, which is a difference the first engine does
#: not make. That engine guards these twelve call sites and no others
#: (`src/core/engine/library/text.ts` and `dates.ts`), so this is that set.
BUILDS_A_STRING: frozenset = frozenset(
    {
        "text",
        "str.upper",
        "str.lower",
        "str.trim",
        "str.substring",
        "str.replace",
        "str.replaceAll",
        "str.join",
        "str.padLeft",
        "str.padRight",
        "str.repeat",
        "date.format",
    }
)

MEASURED: Dict[Tuple[str, int], Callable[..., Optional[int]]] = {
    ("text", 2): text_length,
    ("str.repeat", 2): strings.repeat_length,
}

# `stdlib.md` section 11, the nineteen names and the calls that compute a colour.
_COLOUR: tuple[Entry, ...] = tuple(_named_colour(name) for name in colour.NAMES) + (
    _three("rgb", colour.rgb),
    Entry(
        "rgba",
        4,
        lambda _ctx, args: colour.rgba(_at(args, 0), _at(args, 1), _at(args, 2), _at(args, 3)),
    ),
    _two("fade", colour.fade),
    _three("mix", colour.mix),
    _one("alpha", colour.alpha),
    _two("withAlpha", colour.with_alpha),
)

# `stdlib.md` section 6, the one reading of a range that holds nothing.
_RANGES: tuple[Entry, ...] = (Entry("trueRange", 0, _true_range),)

ENTRIES: tuple[Entry, ...] = _MATHS + _MATH_NAMESPACE + _TEXT + _COLOUR + _RANGES


def table() -> dict[tuple[str, int], Entry]:
    """The entries by name and arity, which is how a manifest is looked up."""
    return {(entry.name, entry.arity): entry for entry in ENTRIES}
