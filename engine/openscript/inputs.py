"""Inputs, resolved once at load, sections 2.6 and 5.1.

Input resolution and the substitution of every ``{ "input": ... }`` reference
happen **once, before step 1 of bar 0**, so the declarations in ``outputs`` and
anything built from them exist before the first bar runs. Step 5 writes already
resolved values into slots and resolves nothing.

**A value that fails validation is a refusal, not a fallback.** The host's value
is used when it passes and the declared default when the host supplies none, and
a supplied value that fails is OS6019 and the program does not run. Falling back
to the default would be a settings dialog that silently ignores what a user
typed, which is worse than one that says the value is out of range.

**An input value is never absent.** ``input()`` cannot declare ``none`` as a
default, because the default's type is what fixes the input's type.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

from .bars import is_bar_field
from .diagnostics import Diagnostic, failure
from .program import constant_value
from .values import ABSENT, Colour, is_number

#: The eight built-in series a ``"source"`` input may select, section 2.6.
SOURCES: Tuple[str, ...] = (
    "open",
    "high",
    "low",
    "close",
    "hl2",
    "hlc3",
    "ohlc4",
    "volume",
)


@dataclass(frozen=True)
class ResolvedInput:
    key: str
    slot: int
    #: The bar field a ``"source"`` input selected, which step 5 reads per bar.
    field: Optional[str]
    #: The effective value, for every other kind.
    value: Any


@dataclass(frozen=True)
class InputResult:
    inputs: Sequence[ResolvedInput]
    diagnostic: Optional[Diagnostic] = None

    @property
    def ok(self) -> bool:
        return self.diagnostic is None


TimeReader = Callable[[str], Optional[float]]


def resolve_inputs(
    raw: Mapping[str, Any],
    settings: Mapping[str, Any],
    read_time: Optional[TimeReader] = None,
) -> InputResult:
    found: List[ResolvedInput] = []
    for declared in raw["inputs"]:
        one, refusal = _resolve_one(declared, settings, read_time)
        if refusal is not None:
            return InputResult((), refusal)
        found.append(one)
    return InputResult(tuple(found))


def _resolve_one(
    declared: Mapping[str, Any],
    settings: Mapping[str, Any],
    read_time: Optional[TimeReader],
) -> Tuple[Optional[ResolvedInput], Optional[Diagnostic]]:
    supplied = settings[declared["key"]] if declared["key"] in settings else None
    fallback = constant_value(declared["default"])

    # A source and a time are checked even where the host stored nothing,
    # because each declares its value as text this engine still has to read.
    # Every other kind takes its declared default unexamined: a default is
    # written in the source, and validation here is about a value that arrived
    # from outside it.
    ask_anyway = declared["kind"] in ("source", "time")
    if declared["key"] not in settings and not ask_anyway:
        return ResolvedInput(declared["key"], declared["slot"], None, fallback), None

    held = fallback if declared["key"] not in settings else supplied
    value, field, refusal = check_setting(declared, held, read_time)
    if refusal is not None:
        return None, failure(
            "OS6019", value=_describe(held), key=declared["key"], validation=refusal
        )
    return ResolvedInput(declared["key"], declared["slot"], field, value), None


def check_setting(
    declared: Mapping[str, Any],
    supplied: Any,
    read_time: Optional[TimeReader] = None,
) -> Tuple[Any, Optional[str], Optional[str]]:
    """What the engine will run with for one stored value, or the rule it breaks.

    Answered outside the engine as well: a chart builds a settings dialog before
    anything is loaded, so it has to know what a stored value is worth before the
    run that would refuse it exists. A second copy of these rules in an adapter
    would be the same fact in two files, answering differently the first time
    either was edited.
    """
    kind = declared["kind"]
    if kind == "source":
        if not isinstance(supplied, str) or supplied not in SOURCES:
            return None, None, f"a source names one of {', '.join(SOURCES)}"
        if not is_bar_field(supplied):
            return None, None, "this engine has no bar field of that name"
        return ABSENT, supplied, None

    if kind == "time":
        unreadable = "a time is a timestamp or a date and time the host can read"
        if is_number(supplied):
            return float(supplied), None, None
        if not isinstance(supplied, str):
            return None, None, unreadable
        if read_time is None:
            return supplied, None, None
        when = read_time(supplied)
        if when is None:
            return None, None, unreadable
        return float(when), None, None

    broken = _validate(declared, supplied)
    if broken is not None:
        return None, None, broken
    return _as_value(supplied), None, None


def _as_value(supplied: Any) -> Any:
    """A stored setting as a machine value: a number is a float, a colour a colour."""
    if isinstance(supplied, bool) or isinstance(supplied, str) or supplied is None:
        return supplied if supplied is not None else ABSENT
    if is_number(supplied):
        return float(supplied)
    if isinstance(supplied, Colour):
        return supplied
    if isinstance(supplied, (list, tuple)) and len(supplied) == 4:
        red, green, blue, alpha = supplied
        return Colour(float(red), float(green), float(blue), float(alpha))
    return supplied


def _validate(declared: Mapping[str, Any], supplied: Any) -> Optional[str]:
    """What rule the host's value broke, or nothing when it passes."""
    kind = declared["kind"]
    if kind == "number":
        if not is_number(supplied):
            return "this input takes a number"
        if declared.get("min") is not None and supplied < declared["min"]:
            return f"the minimum is {declared['min']}"
        if declared.get("max") is not None and supplied > declared["max"]:
            return f"the maximum is {declared['max']}"
        return None
    if kind == "bool":
        return None if isinstance(supplied, bool) else "this input takes true or false"
    if kind == "color":
        return None if _is_colour(supplied) else "this input takes a colour"
    if kind == "select":
        if not isinstance(supplied, str):
            return "this input takes one of its listed values"
        allowed = [constant_value(one) for one in (declared.get("options") or [])]
        if supplied not in allowed:
            return f"the choices are {', '.join(str(one) for one in allowed)}"
        return None
    return None if isinstance(supplied, str) else "this input takes a string"


def _is_colour(value: Any) -> bool:
    if isinstance(value, Colour):
        return True
    return isinstance(value, (list, tuple)) and len(value) == 4 and all(
        is_number(one) for one in value
    )


def field_value(field: Any, inputs: Sequence[ResolvedInput]) -> Any:
    """A declaration field with its ``{ "input": key }`` reference substituted.

    Every field of ``meta``, of ``meta.strategy`` and of every declaration in
    ``outputs`` may hold the reference, and it is gone before bar 0.
    """
    if field is None:
        return ABSENT
    if isinstance(field, dict):
        key = field.get("input")
        for one in inputs:
            if one.key == key:
                return one.value
        return ABSENT
    if isinstance(field, (list, tuple)) and len(field) == 4 and all(is_number(one) for one in field):
        red, green, blue, alpha = field
        return Colour(float(red), float(green), float(blue), float(alpha))
    return field


#: A date and time read as if it were UTC.
#:
#: **A stand-in.** ``stdlib.md`` section 12.1 reads every calendar field in the
#: chart's timezone, which is an IANA name the host states, and an engine that
#: has not been given one cannot apply it. A host with a zone supplies its own
#: reader; this is what a test and a host with no zone get, and it is
#: deterministic, which is the property that matters most here.
def utc_time(text: str) -> Optional[float]:
    for pattern in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M",
                    "%Y-%m-%dT%H:%M", "%Y-%m-%d"):
        try:
            when = datetime.strptime(text.strip(), pattern)
        except ValueError:
            continue
        return when.replace(tzinfo=timezone.utc).timestamp() * 1000
    return None


def _describe(value: Any) -> str:
    if value is None:
        return "none"
    if isinstance(value, str):
        return f'"{value}"'
    if isinstance(value, bool) or is_number(value):
        return str(value)
    return "a value of another type"


def settings_slots(inputs: Sequence[ResolvedInput]) -> Dict[int, ResolvedInput]:
    return {one.slot: one for one in inputs}
