"""Arrays: the value of ``language.md`` 14.1 and the calls ``stdlib.md`` lists.

Two things an array does are instructions, the literal ``ARRAY`` and the
subscript ``ELEM``, and everything else is a call. The calls are here rather
than in ``library/``, because that package raises nothing and an array call has
two refusals of its own that no checker can make before the bar:

- **An index outside the array is OS4004**, not absence. That is the opposite of
  a history read past the start of the dataset, and the difference is the point:
  an array has an extent the script chose, so an index outside it is a mistake
  rather than a missing measurement. Taking an element from an empty array is
  the same refusal, naming the element that is not there.
- **An array past its element ceiling is OS5002.** The ceiling is a million
  elements and it is the language's own number, not a host's, so a script
  refused here is refused by every conforming engine.

Neither knows where in the source the call was written, which is the machine's
fact, so each is raised as ``Refused`` and the machine turns it into a
diagnostic at its own position (``Machine._positioned``).

**Every answer is written to agree with the first engine's to the bit.** The
reductions accumulate in index order, oldest first, as ``src/core/engine/
library/arrays.ts`` does; ``sort`` uses one total order written down below
rather than the host language's; and an absent element makes a reduction absent
rather than being skipped, because a mean over an array with a hole in it is a
mean over fewer values than the script thinks it has.

**Rollback needs nothing here.** An array is the object itself, held in a cell,
and the checkpoint is one deep copy over the cells, so a re-executed moving bar
starts from the array its checkpoint held.
"""

import functools
import math
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from .values import ABSENT, ArrayValue, equal, finite, is_number, is_whole

#: ``language.md`` 14.1: an array holds at most this many elements.
ELEMENT_CEILING = 1_000_000

#: The name a refusal gives the array. The first engine names it from the
#: program's debug names, which this machine does not keep; no case compares it.
UNNAMED = "the array"


class Refused(Exception):
    """A refusal an array call makes, still to be given the call's position."""

    def __init__(self, code: str, **values: Any) -> None:
        super().__init__(code)
        self.code = code
        self.values = values


def literal(held: Sequence[Any]) -> ArrayValue:
    """``ARRAY``: a new array every time it executes, never a pooled constant."""
    return _new(list(held))


def element(array: Any, index: Any) -> Any:
    """``ELEM`` and ``element(arr, i)``: the element, or OS4004 outside the extent."""
    size = len(array.elements) if isinstance(array, ArrayValue) else 0
    if not isinstance(array, ArrayValue):
        raise Refused("OS4004", index=_spelled(index), name=UNNAMED, size=size)
    return array.elements[_within(array, index, size)]


def _new(items: List[Any]) -> ArrayValue:
    _grew(len(items))
    return ArrayValue(items)


def _grew(size: int) -> None:
    if size > ELEMENT_CEILING:
        raise Refused("OS5002", max=ELEMENT_CEILING, name=UNNAMED, size=size)


def _spelled(index: Any) -> str:
    return "none" if index is ABSENT else str(index)


def _within(array: ArrayValue, index: Any, limit: int) -> int:
    """The index a call was given, checked against the array's own extent."""
    if not is_whole(index) or not 0 <= index < limit:
        raise Refused("OS4004", index=_spelled(index), name=UNNAMED, size=len(array.elements))
    return int(index)


def _array(arguments: Sequence[Any], at: int = 0) -> Optional[ArrayValue]:
    held = arguments[at] if at < len(arguments) else ABSENT
    return held if isinstance(held, ArrayValue) else None


def _empty(array: ArrayValue, which: str) -> None:
    if not array.elements:
        raise Refused("OS4004", index=which, name=UNNAMED, size=0)


def _rank(a: Any, b: Any) -> int:
    """The order ``sort`` uses: absence last, then numbers, strings by code point, bools.

    Two values of different kinds compare equal, so a stable sort leaves them
    where they were, which is what the first engine's comparator does. Python's
    string order is code point order, which is ``language.md`` 9.3's.
    """
    if a is ABSENT:
        return 0 if b is ABSENT else 1
    if b is ABSENT:
        return -1
    both = (type(a), type(b))
    if is_number(a) and is_number(b) or both == (str, str):
        return -1 if a < b else 1 if a > b else 0
    if both == (bool, bool):
        return 0 if a == b else 1 if a else -1
    return 0


def _numbers(array: ArrayValue) -> Optional[List[float]]:
    """The elements as numbers, or nothing when any of them is not one."""
    out: List[float] = []
    for one in array.elements:
        if not is_number(one):
            return None
        out.append(float(one))
    return out


def _sum(array: ArrayValue) -> Any:
    values = _numbers(array)
    if values is None:
        return ABSENT
    total = 0.0
    for one in values:
        total += one
    return finite(total)


def _mean(array: ArrayValue) -> Any:
    values = _numbers(array)
    if not values:
        return ABSENT
    total = _sum(array)
    return ABSENT if total is ABSENT else finite(total / len(values))


def _extreme(array: ArrayValue, high: bool) -> Any:
    values = _numbers(array)
    if not values:
        return ABSENT
    best = values[0]
    for one in values:
        if (one > best) if high else (one < best):
            best = one
    return finite(best)


def _spread(array: ArrayValue) -> Any:
    values = _numbers(array)
    mean = _mean(array)
    if values is None or mean is ABSENT:
        return ABSENT
    squares = 0.0
    for one in values:
        deviation = one - mean
        squares += deviation * deviation
    variance = finite(squares / len(values))
    return ABSENT if variance is ABSENT or variance < 0 else finite(math.sqrt(variance))


def _changed(arguments: Sequence[Any], change: Callable[[ArrayValue], Any]) -> Any:
    array = _array(arguments)
    return ABSENT if array is None else change(array)


def _set(array: ArrayValue, arguments: Sequence[Any]) -> Any:
    array.elements[_within(array, arguments[1], len(array.elements))] = arguments[2]
    return ABSENT


def _push(array: ArrayValue, value: Any, front: bool) -> Any:
    if front:
        array.elements.insert(0, value)
    else:
        array.elements.append(value)
    _grew(len(array.elements))
    return ABSENT


def _insert(array: ArrayValue, arguments: Sequence[Any]) -> Any:
    # One past the end is an append: a loop inserting at size(arr) builds a
    # list in order, and refusing it would make the last element a special case.
    array.elements.insert(_within(array, arguments[1], len(array.elements) + 1), arguments[2])
    _grew(len(array.elements))
    return ABSENT


def _take(array: ArrayValue, last: bool) -> Any:
    _empty(array, "the last element" if last else "the first element")
    return array.elements.pop() if last else array.elements.pop(0)


def _remove(array: ArrayValue, arguments: Sequence[Any]) -> Any:
    return array.elements.pop(_within(array, arguments[1], len(array.elements)))


def _slice(arguments: Sequence[Any]) -> Any:
    array = _array(arguments)
    start, stop = arguments[1], arguments[2]
    if array is None or start is ABSENT or stop is ABSENT:
        return ABSENT
    for name, value in (("from", start), ("to", stop)):
        if not is_whole(value) or value < 0:
            raise Refused("OS4003", name="slice", argument=name, found=_spelled(value))
    return _new(array.elements[int(start) : int(stop)])


def _index_of(arguments: Sequence[Any]) -> Any:
    array = _array(arguments)
    if array is None:
        return ABSENT
    for at, one in enumerate(array.elements):
        if equal(one, arguments[1]):
            return float(at)
    return -1.0


def _same(arguments: Sequence[Any]) -> Any:
    a, b = _array(arguments, 0), _array(arguments, 1)
    if a is None or b is None:
        return ABSENT
    if len(a.elements) != len(b.elements):
        return False
    return all(equal(x, y) for x, y in zip(a.elements, b.elements))


def _sort(array: ArrayValue, order: Any) -> Any:
    descending = order == "desc"
    key = functools.cmp_to_key((lambda a, b: _rank(b, a)) if descending else _rank)
    array.elements.sort(key=key)
    return ABSENT


def _reverse(array: ArrayValue) -> Any:
    array.elements.reverse()
    return ABSENT


def _clear(array: ArrayValue) -> Any:
    array.elements.clear()
    return ABSENT


def _reading(of: Callable[[ArrayValue], Any]) -> Callable[[Sequence[Any]], Any]:
    return lambda arguments: _changed(arguments, of)


#: Every array call, by name and argument count, which is how the manifest keys it.
CALLS: Dict[Tuple[str, int], Callable[[Sequence[Any]], Any]] = {
    ("size", 1): _reading(lambda array: float(len(array.elements))),
    ("element", 2): lambda arguments: element(arguments[0], arguments[1])
    if isinstance(arguments[0], ArrayValue)
    else ABSENT,
    ("set", 3): lambda arguments: _changed(arguments, lambda array: _set(array, arguments)),
    ("push", 2): lambda arguments: _changed(arguments, lambda array: _push(array, arguments[1], False)),
    ("unshift", 2): lambda arguments: _changed(arguments, lambda array: _push(array, arguments[1], True)),
    ("insert", 3): lambda arguments: _changed(arguments, lambda array: _insert(array, arguments)),
    ("pop", 1): _reading(lambda array: _take(array, True)),
    ("shift", 1): _reading(lambda array: _take(array, False)),
    ("remove", 2): lambda arguments: _changed(arguments, lambda array: _remove(array, arguments)),
    ("slice", 3): _slice,
    ("copy", 1): _reading(lambda array: _new(list(array.elements))),
    ("indexOf", 2): _index_of,
    ("arrayEqual", 2): _same,
    ("sort", 2): lambda arguments: _changed(arguments, lambda array: _sort(array, arguments[1])),
    ("reverse", 1): _reading(_reverse),
    ("sum", 1): _reading(_sum),
    ("avg", 1): _reading(_mean),
    ("min", 1): _reading(lambda array: _extreme(array, False)),
    ("max", 1): _reading(lambda array: _extreme(array, True)),
    ("stdev", 1): _reading(_spread),
    ("clear", 1): _reading(_clear),
}
