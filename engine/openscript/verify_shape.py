"""Check 1 of ``compiled-program.md`` section 3.5: is this a compiled program at all.

This is the half of verification that reads an untrusted object and answers that
question before anything else runs, because every later check indexes into a
table this one proves is a table.

Every failure here is OS6018. A malformed instruction list, an unreadable
encoding and a field of the wrong type are not three fixes: each is a defect of
the compiler that wrote the program and none of them is repairable by hand. What
varies is the location, and the location is a field path, so whoever wrote the
compiler is told ``outputs.plots[2].channel`` rather than "structure".

One difference from the first engine, and it is this interpreter's alone: its
own ``True`` is an instance of its integer type, so every numeric test below
refuses a boolean explicitly. Without that line a program carrying ``true``
where a channel index belongs would verify, and the failure would arrive later
as a wrong number.
"""

from typing import Any, Callable, Optional, Sequence, Set

from .diagnostics import Diagnostic, malformed

#: The tags a constant pool entry may carry, section 2.9.
CONSTANT_TAGS = ("z", "b", "n", "s", "c")


class ShapeCheck:
    """Collects the first failure and stops: a malformed program has no second opinion."""

    def __init__(self) -> None:
        self._failure: Optional[Diagnostic] = None

    def problem(self) -> Optional[Diagnostic]:
        return self._failure

    def fail(self, path: str, reason: str) -> bool:
        if self._failure is None:
            self._failure = malformed(path, reason)
        return False

    def object(self, value: Any, path: str) -> bool:
        if not isinstance(value, dict):
            return self.fail(path, "an object was required")
        return True

    def array(self, value: Any, path: str) -> bool:
        if not isinstance(value, list):
            return self.fail(path, "an array was required")
        return True

    def number(self, value: Any, path: str) -> bool:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return self.fail(path, "a finite number was required")
        if value != value or value in (float("inf"), float("-inf")):
            return self.fail(path, "a finite number was required")
        return True

    def whole(self, value: Any, path: str) -> bool:
        if not self.number(value, path):
            return False
        if float(value) != int(value):
            return self.fail(path, "a whole number was required")
        return True

    def string(self, value: Any, path: str) -> bool:
        if not isinstance(value, str):
            return self.fail(path, "a string was required")
        return True

    def boolean(self, value: Any, path: str) -> bool:
        if not isinstance(value, bool):
            return self.fail(path, "a true or false was required")
        return True

    def index(self, value: Any, path: str, size: int, table: str) -> bool:
        """A whole number that indexes a table, with the table's size in the message."""
        if not self.whole(value, path):
            return False
        if value < 0 or value >= size:
            return self.fail(path, f"{value} is outside {table}, which holds {size}")
        return True

    def one(self, value: Any, path: str, allowed: Sequence[str]) -> bool:
        if not self.string(value, path):
            return False
        if value not in allowed:
            return self.fail(path, f"{value} is not one of {', '.join(allowed)}")
        return True

    def nullable(self, value: Any, path: str, check: Callable[[Any, str], bool]) -> bool:
        """A field that may be a value or null, which is a value a script could write."""
        return True if value is None else check(value, path)


def check_colour(shape: ShapeCheck, value: Any, path: str) -> bool:
    if not shape.array(value, path):
        return False
    if len(value) != 4:
        return shape.fail(path, "a colour is four numbers")
    for at in range(3):
        if not shape.whole(value[at], f"{path}[{at}]"):
            return False
        channel = value[at]
        if channel < 0 or channel > 255:
            return shape.fail(f"{path}[{at}]", f"a channel runs 0 to 255 and this is {channel}")
    if not shape.number(value[3], f"{path}[3]"):
        return False
    alpha = value[3]
    if alpha < 0 or alpha > 1:
        return shape.fail(f"{path}[3]", f"an alpha runs 0 to 1 and this is {alpha}")
    return True


def check_constant(shape: ShapeCheck, value: Any, path: str) -> bool:
    """One constant pool entry, section 2.9: a two element array of tag and value."""
    if not shape.array(value, path):
        return False
    if len(value) != 2:
        return shape.fail(path, "a pool entry is a tag and a value")
    tag = value[0]
    if not shape.one(tag, f"{path}[0]", CONSTANT_TAGS):
        return False
    held = value[1]
    if tag == "z":
        return True if held is None else shape.fail(f"{path}[1]", "the absent entry holds null")
    if tag == "b":
        return shape.boolean(held, f"{path}[1]")
    if tag == "n":
        return shape.number(held, f"{path}[1]")
    if tag == "s":
        return shape.string(held, f"{path}[1]")
    return check_colour(shape, held, f"{path}[1]")


def check_field(shape: ShapeCheck, value: Any, path: str, keys: Set[str]) -> bool:
    """A declaration field, section 2.3: a value, or the input reference.

    The key half of check 10 lives here, because this is the one walk that visits
    every field that may hold a reference. The value half runs later, with the
    host's settings in hand, and is OS6019 rather than OS6018: that value came
    from a settings dialog and the user who typed it can correct it.
    """
    if value is None or isinstance(value, (bool, str)):
        return True
    if isinstance(value, (int, float)):
        return shape.number(value, path)
    if isinstance(value, list):
        for at, one in enumerate(value):
            if not shape.number(one, f"{path}[{at}]"):
                return False
        return True
    if not shape.object(value, path):
        return False
    if "input" not in value:
        return shape.fail(path, "an object here is an input reference")
    key = value["input"]
    if not shape.string(key, f"{path}.input"):
        return False
    if key not in keys:
        return shape.fail(path, f"it names the input {key}, which inputs[] does not declare")
    return True
