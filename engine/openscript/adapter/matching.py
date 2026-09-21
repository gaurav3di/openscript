"""The comparison of ``conformance.md`` section 6, in this language.

The page prints the function and every step of it, and this is that function with
nothing added. Each step is written out below beside the wrong implementation it
refuses, because the whole value of the suite rests on this being the same rule
in both engines: a comparison that was a little more forgiving in one of them
would report agreement that is not there, which is worse than reporting none.

1. Two absent values match, asked before anything numeric is.
2. One absent and one present fail, whatever the tolerance. A number is not
   nearly absent, and warmup length is a specified property, so a value one bar
   early is a defect however small it is.
3. A result that is not finite is its own outcome. ``language.md`` section 5.1
   says an infinity and a not-a-number never appear as values, so producing one
   is a defect rather than a near miss, and burying it among numeric failures
   would hide the one failure that is never a rounding difference.
4. Signed zero is normalised. Nothing in the language can observe the sign of a
   zero, so comparing raw bits would fail a case over a difference no script can
   see.
5. Equality is over the eight bytes, not over a rendering, so a formatting
   decision can never make two different values look equal.
6. With both bounds zero, anything past step 5 fails.
7. The bound is ``max(abs, rel * |e|)`` and never a sum: exactly one bound is in
   force at any magnitude, and a failure can name which of the two it broke.

**A declared tolerance is held to the caps section 6 prints.** A case past either
is not a conformance case at all, and it is reported ``error`` rather than run
under a bound the page refuses.
"""

import struct
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .page import TOLERANCE_CAP_ABS, TOLERANCE_CAP_REL
from .spellings import written

#: Section 4: what a diagnostic is compared on, and nothing else. The message
#: text and the suggested fix are deliberately not compared, because improving
#: the wording of an error is something this project wants to keep doing.
DIAGNOSTIC_FIELDS: Tuple[str, ...] = ("code", "line", "column", "severity")

#: Section 6: exact, which is what a comparison is until a case declares otherwise.
EXACT = (0.0, 0.0)

_PASS: Dict[str, Any] = {"outcome": "pass"}


def _bits(value: float) -> bytes:
    """The eight bytes of a binary64, so equality is over bits and not over text."""
    return struct.pack(">d", value)


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def compare_numbers(actual: Any, expected: Any, abs_bound: float, rel_bound: float) -> Dict[str, Any]:
    """Steps 1 to 8, in the page's order, over one asserted numeric value."""
    if expected is None and actual is None:
        return _PASS
    if expected is None or actual is None:
        return {"outcome": "fail", "bound": "absence"}
    if not _is_number(actual) or not _finite(actual):
        return {"outcome": "nonFinite"}
    if not _is_number(expected) or not _finite(expected):
        return {"outcome": "nonFinite"}
    left = 0.0 if actual == 0 else float(actual)
    right = 0.0 if expected == 0 else float(expected)
    if _bits(left) == _bits(right):
        return _PASS
    difference = abs(left - right)
    if abs_bound == 0 and rel_bound == 0:
        return {"outcome": "fail", "bound": "exact", "difference": difference}
    relative = rel_bound * abs(right)
    if difference <= max(abs_bound, relative):
        return _PASS
    return {
        "outcome": "fail",
        "bound": "abs" if abs_bound >= relative else "rel",
        "difference": difference,
    }


def _finite(value: Any) -> bool:
    return value == value and value not in (float("inf"), float("-inf"))


def _kind_of(value: Any) -> str:
    if value is None:
        return "absent"
    if isinstance(value, bool):
        return "bool"
    if _is_number(value):
        return "number"
    if isinstance(value, str):
        return "string"
    return "list" if isinstance(value, list) else "object"


def compare_values(actual: Any, expected: Any, tolerance: Tuple[float, float]) -> Dict[str, Any]:
    """One value of any kind, under section 6's table.

    Absence is asked first for every kind, because the table says it is never
    subject to a tolerance and that is as true of a string as of a number. Two
    values of different kinds fail as ``kind``: a bool where a number was
    expected is not a near miss.
    """
    if expected is None or actual is None:
        return compare_numbers(actual, expected, tolerance[0], tolerance[1])
    kind = _kind_of(expected)
    if kind != _kind_of(actual):
        return {"outcome": "fail", "bound": "kind"}
    if kind == "number":
        return compare_numbers(actual, expected, tolerance[0], tolerance[1])
    if kind in ("bool", "string"):
        return _PASS if actual == expected else {"outcome": "fail", "bound": "exact"}
    return _PASS if _stable(actual) == _stable(expected) else {"outcome": "fail", "bound": "exact"}


def _stable(value: Any) -> str:
    """A nested value as one piece of text, keys sorted, so two spellings are one."""
    if isinstance(value, list):
        return "[" + ",".join(_stable(one) for one in value) + "]"
    if isinstance(value, dict):
        members = (f"{key}:{_stable(value[key])}" for key in sorted(value))
        return "{" + ",".join(members) + "}"
    return written(value)


def _fields_of(channel: str, expected: Dict[str, Any]) -> Sequence[str]:
    """Section 4: four fields for a diagnostic, else the expected element's own.

    "Compared on the fields the case names and no others" is what lets a case
    assert the part of a ledger row it is about without freezing every other
    field of it.
    """
    if channel == "diagnostics":
        return DIAGNOSTIC_FIELDS
    return sorted(expected)


def _difference(
    result: Dict[str, Any],
    channel: str,
    index: Optional[int],
    column: Optional[str],
    actual: Any,
    expected: Any,
) -> Dict[str, Any]:
    found = {
        "outcome": result["outcome"],
        "channel": channel,
        "index": index,
        "column": column,
        "expected": written(expected),
        "actual": written(actual),
    }
    if "bound" in result:
        found["bound"] = result["bound"]
    if "difference" in result:
        found["difference"] = written(result["difference"])
    return found


def compare_channel(
    channel: str, actual: Any, expected: Any, tolerance: Tuple[float, float]
) -> Optional[Dict[str, Any]]:
    """One channel: an ordered list, length first, then element by element.

    Nothing when the channel matches, else the first difference with its index,
    its column and both values as a report writes them. A length mismatch is
    reported before any element is compared, which is section 6's table, and at
    the first index one list has and the other lacks.
    """
    if not isinstance(expected, list) or not isinstance(actual, list):
        return {
            "outcome": "fail",
            "channel": channel,
            "index": None,
            "column": None,
            "bound": "kind",
            "expected": _kind_of(expected),
            "actual": _kind_of(actual),
        }
    if len(actual) != len(expected):
        return {
            "outcome": "fail",
            "channel": channel,
            "index": min(len(actual), len(expected)),
            "column": None,
            "bound": "length",
            "expected": str(len(expected)),
            "actual": str(len(actual)),
        }
    for index, want in enumerate(expected):
        got = actual[index]
        if not isinstance(want, dict):
            result = compare_values(got, want, tolerance)
            if result["outcome"] != "pass":
                return _difference(result, channel, index, None, got, want)
            continue
        for column in _fields_of(channel, want):
            wanted = want.get(column)
            found = got.get(column) if isinstance(got, dict) else None
            result = compare_values(found, wanted, tolerance)
            if result["outcome"] != "pass":
                return _difference(result, channel, index, column, found, wanted)
    return None


def compare_channels(
    asserted: Sequence[str],
    actual: Dict[str, Any],
    expected: Dict[str, Any],
    tolerance: Tuple[float, float],
) -> Dict[str, Any]:
    """Every asserted channel, in the case's own order, to one outcome."""
    for channel in asserted:
        found = compare_channel(channel, actual.get(channel), expected.get(channel), tolerance)
        if found is not None:
            return found
    return dict(_PASS)


def tolerance_from(declared: Any) -> Tuple[Optional[Tuple[float, float]], Optional[str]]:
    """The case's tolerance, held to section 6, or the sentence refusing it.

    Absent means exact. A non-zero bound needs a stated reason, which is the rule
    that stops a tolerance from being the thing an engine author widens until the
    suite goes green. A bound past the cap is not a conformance case at all.
    """
    if declared is None:
        return EXACT, None
    if not isinstance(declared, dict):
        return None, "tolerance is not an object"
    bounds: List[float] = []
    for name in ("abs", "rel"):
        value = declared.get(name, 0)
        if value is None:
            value = 0
        if not _is_number(value) or not _finite(value):
            return None, f"tolerance.{name} is not a finite number"
        if value < 0:
            return None, f"tolerance.{name} is below zero"
        bounds.append(float(value))
    abs_bound, rel_bound = bounds[0], bounds[1]
    reason = declared.get("reason")
    stated = isinstance(reason, str) and reason.strip() != ""
    if (abs_bound != 0 or rel_bound != 0) and not stated:
        return None, "a non-zero tolerance is declared with no reason (section 6)"
    if abs_bound > TOLERANCE_CAP_ABS or rel_bound > TOLERANCE_CAP_REL:
        return None, (
            f"a tolerance of abs {written(abs_bound)} and rel {written(rel_bound)} is looser than "
            f"the cap of abs {written(TOLERANCE_CAP_ABS)} and rel {written(TOLERANCE_CAP_REL)}, so "
            "this is not a conformance case (section 6)"
        )
    return (abs_bound, rel_bound), None
