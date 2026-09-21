"""Checks 2 to 7 of ``compiled-program.md`` section 3.5, over one instruction list.

Verification is not optional and not a debug mode. An engine that skips it can
be handed a malformed list and will read past the end of an array or jump into
the middle of an expression, and the failure will look like a wrong number
rather than a broken program. What these checks buy is what the interpreter is
then allowed to assume and therefore not to test: a verified program cannot
underflow the stack, cannot jump out of bounds, cannot address a slot that does
not exist and cannot loop without charging the budget.

Check 6 is the one that looks small and is not. The target of every backward
jump must be a ``TICK``, so no cycle in the control flow graph can run without
charging the loop budget, and the whole of that guarantee is checkable by
looking at one instruction rather than by analysing the graph.
"""

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Sequence

from .diagnostics import at_instruction
from .opcodes import (
    INSTRUCTION_TAGS,
    TABLE_NAMES,
    depth_change,
    is_opcode,
    operand_count,
    tables_for,
    targets,
)
from .verify_shape import ShapeCheck


@dataclass
class ListLimits:
    """How big each table an operand may index is, for the list being walked."""

    slots: int
    cells: int
    states: int
    registers: int
    channels: int
    libFunctions: int
    callSites: int
    loops: int
    consts: int
    bindings: int
    argc_of: Callable[[int], int] = field(default=lambda site: 0)

    def size(self, table: str) -> Optional[int]:
        return getattr(self, table, None)


def check_list(
    shape: ShapeCheck,
    listing: str,
    code: Sequence[Any],
    limits: ListLimits,
    terminator: str,
) -> bool:
    """Walks one instruction list: checks 2, 3, 4, 5 and 6.

    ``terminator`` is ``HALT`` for the bar's own code and ``RET`` for a function
    body or a read's body, which is check 4, and the depth at it must be zero,
    which is check 5.
    """
    if len(code) == 0:
        return shape.fail(listing, "an instruction list cannot be empty")

    # Check 2, and every operand in range.
    for at, instruction in enumerate(code):
        where = at_instruction(listing, at)
        if not shape.array(instruction, where):
            return False
        opcode = instruction[0] if instruction else None
        if not is_opcode(opcode):
            return shape.fail(where, f"{opcode} is not an opcode this engine implements")
        operands = instruction[1:]
        if len(operands) != operand_count(opcode):
            return shape.fail(
                where,
                f"{opcode} takes {operand_count(opcode)} operands and carries {len(operands)}",
            )
        if not _check_operands(shape, where, opcode, operands, limits, len(code)):
            return False

        # Check 6: the target of a backward jump is a TICK.
        for position in targets(opcode):
            target = operands[position]
            if target > at:
                continue
            landing = code[target]
            if not isinstance(landing, list) or not landing or landing[0] != "TICK":
                return shape.fail(
                    where,
                    f"it jumps back to instruction {target}, which is not a TICK, so the loop "
                    "would run without charging the budget",
                )

    # Check 4.
    last = code[-1]
    if not isinstance(last, list) or not last or last[0] != terminator:
        return shape.fail(
            at_instruction(listing, len(code) - 1),
            f"the last instruction of this list must be {terminator}",
        )
    for at in range(len(code) - 1):
        if code[at][0] == "HALT":
            return shape.fail(at_instruction(listing, at), "HALT is only ever the last instruction")

    return _check_depths(shape, listing, code, limits, terminator)


def _check_operands(
    shape: ShapeCheck,
    where: str,
    opcode: str,
    operands: Sequence[Any],
    limits: ListLimits,
    length: int,
) -> bool:
    tables = tables_for(opcode)
    for at, operand in enumerate(operands):
        if not shape.whole(operand, f"{where} operand {at}"):
            return False
        table = tables[at] if at < len(tables) else None
        if table is None or table == "count":
            if operand < 0:
                return shape.fail(f"{where} operand {at}", "a count cannot be negative")
            continue
        if table == "target":
            # Check 3. A target past the terminator is out of the list.
            if operand < 0 or operand >= length:
                return shape.fail(where, f"the jump target {operand} is outside a list of {length}")
            continue
        # A CALL_LIB with no state carries -1 rather than an index.
        if opcode == "CALL_LIB" and table == "states" and operand == -1:
            continue
        size = limits.size(table)
        if size is None:
            continue
        if operand < 0 or operand >= size:
            named = TABLE_NAMES.get(table, table)
            return shape.fail(
                f"{where} operand {at}", f"{operand} is outside {named}, which holds {size}"
            )
    return True


def _check_depths(
    shape: ShapeCheck,
    listing: str,
    code: Sequence[Any],
    limits: ListLimits,
    terminator: str,
) -> bool:
    """Check 5: the depth agrees on every path, never goes below zero, is zero at the end.

    A disagreement at a join is a corrupt program and not a program with an
    unusual shape: every instruction has a fixed effect, so two paths reaching
    one instruction with different depths means one of them was built wrong.
    """
    depths: List[Optional[int]] = [None] * len(code)
    depths[0] = 0
    pending = [0]

    def reach(index: int, depth: int, origin: int) -> bool:
        if depth < 0:
            return shape.fail(at_instruction(listing, origin), "it takes the stack below zero")
        known = depths[index]
        if known is None:
            depths[index] = depth
            pending.append(index)
            return True
        if known != depth:
            return shape.fail(
                at_instruction(listing, index),
                f"two paths reach it with the stack {known} and {depth} deep",
            )
        return True

    while pending:
        index = pending.pop()
        instruction = code[index]
        depth = depths[index]
        opcode = instruction[0]
        operands = instruction[1:]
        after = depth + depth_change(opcode, operands, limits.argc_of)
        if opcode == terminator:
            if after != 0:
                return shape.fail(
                    at_instruction(listing, index),
                    f"the stack is {after} deep at {terminator} and must be empty",
                )
            continue
        for position in targets(opcode):
            if not reach(operands[position], after, index):
                return False
        if opcode not in ("JUMP", "RET", "HALT"):
            if not reach(index + 1, after, index):
                return False

    return True


#: How high a write count is carried before it stops mattering.
#:
#: "More than once" is the whole of what check 7 needs to know, and without a
#: ceiling a loop around an ``EMIT`` would never settle.
_CAP = 2


def check_once(shape: ShapeCheck, code: Sequence[Any], once: Sequence[bool]) -> bool:
    """Check 7: every channel declared ``once`` is written exactly once on every path.

    That is how a plot column is guaranteed a value, or an explicit absence, for
    every bar.
    """
    channels = len(once)
    if channels == 0:
        return True
    least: List[Optional[List[int]]] = [None] * len(code)
    most: List[Optional[List[int]]] = [None] * len(code)
    least[0] = [0] * channels
    most[0] = [0] * channels
    pending = [0]

    def merge(index: int, low: Sequence[int], high: Sequence[int]) -> None:
        if index < 0 or index >= len(code):
            return
        known_low, known_high = least[index], most[index]
        if known_low is None or known_high is None:
            least[index] = list(low)
            most[index] = list(high)
            pending.append(index)
            return
        changed = False
        for channel in range(channels):
            lower = min(known_low[channel], low[channel])
            upper = min(_CAP, max(known_high[channel], high[channel]))
            if lower != known_low[channel]:
                known_low[channel] = lower
                changed = True
            if upper != known_high[channel]:
                known_high[channel] = upper
                changed = True
        if changed:
            pending.append(index)

    end = -1
    while pending:
        index = pending.pop()
        instruction = code[index]
        low, high = least[index], most[index]
        opcode = instruction[0]
        if opcode == "HALT":
            end = index
            continue
        next_low, next_high = list(low), list(high)
        if opcode == "EMIT":
            channel = instruction[1]
            next_low[channel] = min(_CAP, next_low[channel] + 1)
            next_high[channel] = min(_CAP, next_high[channel] + 1)
        for position in targets(opcode):
            merge(instruction[position + 1], next_low, next_high)
        if opcode not in ("JUMP", "RET"):
            merge(index + 1, next_low, next_high)

    if end < 0:
        return shape.fail("code", "no path reaches HALT")
    low, high = least[end], most[end]
    for channel in range(channels):
        if not once[channel]:
            continue
        if low[channel] != 1 or high[channel] != 1:
            return shape.fail(
                f"channels[{channel}]",
                f"it is declared once and is written {low[channel]} to {high[channel]} times "
                "on a path to HALT",
            )
    return True


def missing_tag(lists: Sequence[Sequence[Any]], requires: Sequence[str]) -> Optional[Dict[str, str]]:
    """Check 8's program half: an instruction whose tag the program never declared."""
    for code in lists:
        for instruction in code:
            tag = INSTRUCTION_TAGS.get(instruction[0])
            if tag is not None and tag not in requires:
                return {"opcode": instruction[0], "tag": tag}
    return None
