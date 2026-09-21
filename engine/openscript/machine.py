"""The instruction loop: forty-one arms and nothing clever in any of them.

Section 4 is deliberately small and deliberately dull. There is one way to do
each thing, no instruction is a shorthand for two others, and a new one cannot be
added without a major format bump. So this is a loop over a list, with a table of
handlers, and the table is data: a name in a compiled program never becomes a
function here, and nothing on this path builds anything out of text.

**Verification is what lets this be plain.** A verified program cannot underflow
the stack, cannot jump out of bounds, cannot address a slot that does not exist
and cannot loop without charging the budget (section 3.5), so none of that is
tested again per instruction. What is tested per instruction is the one thing
verification cannot decide: the tags of the values, which is where absence lives.

**Absence has a rule in every arm and the rule is the page's.** It propagates
through arithmetic and ordering comparison, is total under equality, is three
valued under the logical operators, and is false at a branch. Those five rules
are ``values.py``'s, and an engine that special cased absence anywhere else would
have a bug rather than an optimisation.
"""

import math
from typing import Any, Callable, Dict, List, Optional, Sequence

from .budget import Budget
from .contracts import CallContext, Library
from .diagnostics import NO_POSITION, Position, raise_at
from .memory import Cells, Channels, Frame, Register, States, read_history
from .program import LoadedProgram
from .values import (
    ABSENT,
    ArrayValue,
    conjunction,
    disjunction,
    equal,
    finite,
    is_number,
    is_whole,
    negation,
    ordered,
    stored,
    truthy,
)


class PendingEffect:
    """One library call that reaches the outside world, held until step 9.

    A function with an effect does not perform it when it executes: it leaves a
    record here and pushes absent. The list is discarded at step 3 of every
    execution and applied at step 9 only when the bar is decided, which is what
    makes a condition that was true halfway through a bar and false when it
    closed place no order at all.
    """

    __slots__ = ("fn", "name", "effect", "arguments", "position")

    def __init__(
        self, fn: int, name: str, effect: str, arguments: List[Any], position: Position
    ) -> None:
        self.fn = fn
        self.name = name
        self.effect = effect
        self.arguments = arguments
        self.position = position


class Machine:
    """One program, its memory, and the loop that walks its instructions."""

    def __init__(
        self,
        program: LoadedProgram,
        cells: Cells,
        states: States,
        registers: List[Register],
        channels: Channels,
        budget: Budget,
        library: Library,
    ) -> None:
        self.program = program
        self.cells = cells
        self.states = states
        self.registers = registers
        self.channels = channels
        self.budget = budget
        self.library = library
        self.pending: List[PendingEffect] = []
        self.context = CallContext()
        self.bar_index = 0
        self._frames: List[Frame] = []
        self._loop_line: Optional[int] = None
        self._answer: Any = ABSENT
        self._running = False
        self._arms: Dict[str, Callable[[Frame, Sequence[Any]], None]] = {
            "CONST": self._const,
            "DUP": self._dup,
            "POP": self._pop_top,
            "LOAD": self._load,
            "STORE": self._store,
            "CELL_INIT": self._cell_init,
            "LOADC": self._load_cell,
            "STOREC": self._store_cell,
            "SLOAD": self._series_load,
            "SSTORE": self._series_store,
            "HIST": self._history,
            "HISTP": self._history_parameter,
            "ADD": self._add,
            "SUB": self._subtract,
            "MUL": self._multiply,
            "DIV": self._divide,
            "MOD": self._modulo,
            "NEG": self._negate,
            "LT": self._less,
            "LE": self._less_equal,
            "GT": self._greater,
            "GE": self._greater_equal,
            "EQ": self._equals,
            "NE": self._differs,
            "NOT": self._not,
            "AND": self._and,
            "OR": self._or,
            "AND_SHORT": self._and_short,
            "OR_SHORT": self._or_short,
            "JUMP": self._jump,
            "JUMP_FALSE": self._jump_false,
            "TICK": self._tick,
            "FOR_INIT": self._for_init,
            "FOR_NEXT": self._for_next,
            "ARRAY": self._array,
            "ELEM": self._element,
            "CALL_LIB": self._call_library,
            "CALL_FN": self._call_function,
            "RET": self._return,
            "EMIT": self._emit,
            "HALT": self._halt,
        }

    # -- the loop ---------------------------------------------------------

    def begin(self, bar_index: int, context: CallContext) -> None:
        """Step 3's share: a fresh frame 0 with every slot absent, and the counters.

        The frame exists before step 6 rather than at it, because step 5 writes
        each input's effective value into a slot of this frame and the two steps
        are in that order.
        """
        self.bar_index = bar_index
        self.context = context
        self.pending = []
        self._loop_line = None
        self.budget.begin()
        top = self.program.top
        self._frames = [Frame(top.code, top.slots, positions=top.positions)]

    def write_slot(self, slot: int, value: Any) -> None:
        """Step 5: one input's effective value, into frame 0."""
        self._frames[0].slots[slot] = stored(value)

    def execute(self) -> Any:
        """Step 6: run the top-level list from instruction 0 until ``HALT``."""
        return self._walk()

    def _walk(self) -> Any:
        self._answer = ABSENT
        self._running = True
        while self._running:
            current = self._frames[-1]
            if self.budget.step():
                self.budget.spent(self.here(), self._loop_line)
            instruction = current.code[current.pc]
            current.pc += 1
            self._arms[instruction[0]](current, instruction)
        return self._answer

    def here(self) -> Position:
        """Where the instruction that is executing came from in the source."""
        if not self._frames:
            return NO_POSITION
        frame = self._frames[-1]
        at = frame.pc - 1
        positions = frame.positions
        if positions is None or at < 0 or at >= len(positions):
            return NO_POSITION
        return positions[at]

    # -- constants and stack ----------------------------------------------

    def _const(self, frame: Frame, instruction: Sequence[Any]) -> None:
        frame.stack.append(self.program.consts[instruction[1]])

    def _dup(self, frame: Frame, instruction: Sequence[Any]) -> None:
        frame.stack.append(frame.stack[-1])

    def _pop_top(self, frame: Frame, instruction: Sequence[Any]) -> None:
        frame.stack.pop()

    # -- slots -------------------------------------------------------------

    def _load(self, frame: Frame, instruction: Sequence[Any]) -> None:
        frame.stack.append(frame.slots[instruction[1]])

    def _store(self, frame: Frame, instruction: Sequence[Any]) -> None:
        frame.slots[instruction[1]] = stored(frame.stack.pop())

    # -- cells --------------------------------------------------------------

    def _cell_init(self, frame: Frame, instruction: Sequence[Any]) -> None:
        cell = frame.cell_base + instruction[1]
        if self.cells.initialised(cell):
            frame.pc = instruction[2]
            return
        # Marked before the initialiser runs, not after: the two differ only if
        # the initialiser could reach this instruction again, which needs
        # recursion, which is an error.
        self.cells.mark(cell)

    def _load_cell(self, frame: Frame, instruction: Sequence[Any]) -> None:
        frame.stack.append(self.cells.read(frame.cell_base + instruction[1]))

    def _store_cell(self, frame: Frame, instruction: Sequence[Any]) -> None:
        self.cells.write(frame.cell_base + instruction[1], frame.stack.pop())

    # -- series registers ---------------------------------------------------

    def _series_load(self, frame: Frame, instruction: Sequence[Any]) -> None:
        frame.stack.append(self.registers[instruction[1]].current)

    def _series_store(self, frame: Frame, instruction: Sequence[Any]) -> None:
        self.registers[instruction[1]].current = stored(frame.stack.pop())

    def _read_back(self, frame: Frame, register: int) -> None:
        back = frame.stack.pop()
        frame.stack.append(
            read_history(
                self.registers[register],
                back,
                self.bar_index,
                self.program.retained,
                self.here(),
            )
        )

    def _history(self, frame: Frame, instruction: Sequence[Any]) -> None:
        self._read_back(frame, instruction[1])

    def _history_parameter(self, frame: Frame, instruction: Sequence[Any]) -> None:
        # A parameter whose call site bound -1 cannot be reached by a HISTP: the
        # compiler binds a register only for a parameter whose history the body
        # reads, and a HISTP against -1 is a corrupt program the verifier caught.
        self._read_back(frame, frame.bindings[instruction[1]])

    # -- arithmetic ---------------------------------------------------------

    def _two(self, frame: Frame):
        right = frame.stack.pop()
        return frame.stack.pop(), right

    def _add(self, frame: Frame, instruction: Sequence[Any]) -> None:
        left, right = self._two(frame)
        if left is ABSENT or right is ABSENT:
            frame.stack.append(ABSENT)
            return
        if is_number(left) and is_number(right):
            frame.stack.append(finite(left + right))
            return
        if isinstance(left, str) and isinstance(right, str):
            # The one operator that grows a string, and so the one that meets
            # the ceiling: a log appended to on every bar is what OS5008 is for.
            frame.stack.append(self.budget.text(self.here(), left + right))
            return
        # Any other combination is a program the checker should have rejected,
        # and an engine that invented a conversion here would become the only
        # engine that runs that script.
        frame.stack.append(ABSENT)

    def _numeric(self, frame: Frame, of: Callable[[float, float], Any]) -> None:
        left, right = self._two(frame)
        if not is_number(left) or not is_number(right):
            frame.stack.append(ABSENT)
            return
        frame.stack.append(of(float(left), float(right)))

    def _subtract(self, frame: Frame, instruction: Sequence[Any]) -> None:
        self._numeric(frame, lambda a, b: finite(a - b))

    def _multiply(self, frame: Frame, instruction: Sequence[Any]) -> None:
        self._numeric(frame, lambda a, b: finite(a * b))

    def _divide(self, frame: Frame, instruction: Sequence[Any]) -> None:
        # Absent when the divisor is zero, zero divided by zero included: the
        # language has no infinity and no not-a-number to hand back.
        self._numeric(frame, lambda a, b: ABSENT if b == 0 else finite(a / b))

    def _modulo(self, frame: Frame, instruction: Sequence[Any]) -> None:
        # The remainder of truncated division, so the sign follows the left
        # operand rather than the divisor.
        self._numeric(frame, lambda a, b: ABSENT if b == 0 else finite(math.fmod(a, b)))

    def _negate(self, frame: Frame, instruction: Sequence[Any]) -> None:
        value = frame.stack.pop()
        frame.stack.append(finite(-float(value)) if is_number(value) else ABSENT)

    # -- comparison ---------------------------------------------------------

    def _order(self, frame: Frame, wanted: Callable[[float], bool]) -> None:
        left, right = self._two(frame)
        found = ordered(left, right)
        frame.stack.append(ABSENT if found is ABSENT else wanted(found))

    def _less(self, frame: Frame, instruction: Sequence[Any]) -> None:
        self._order(frame, lambda found: found < 0)

    def _less_equal(self, frame: Frame, instruction: Sequence[Any]) -> None:
        self._order(frame, lambda found: found <= 0)

    def _greater(self, frame: Frame, instruction: Sequence[Any]) -> None:
        self._order(frame, lambda found: found > 0)

    def _greater_equal(self, frame: Frame, instruction: Sequence[Any]) -> None:
        self._order(frame, lambda found: found >= 0)

    def _equals(self, frame: Frame, instruction: Sequence[Any]) -> None:
        left, right = self._two(frame)
        frame.stack.append(equal(left, right))

    def _differs(self, frame: Frame, instruction: Sequence[Any]) -> None:
        left, right = self._two(frame)
        frame.stack.append(not equal(left, right))

    # -- logic ---------------------------------------------------------------

    def _not(self, frame: Frame, instruction: Sequence[Any]) -> None:
        frame.stack.append(negation(frame.stack.pop()))

    def _and(self, frame: Frame, instruction: Sequence[Any]) -> None:
        left, right = self._two(frame)
        frame.stack.append(conjunction(left, right))

    def _or(self, frame: Frame, instruction: Sequence[Any]) -> None:
        left, right = self._two(frame)
        frame.stack.append(disjunction(left, right))

    def _and_short(self, frame: Frame, instruction: Sequence[Any]) -> None:
        # The value that decides the answer by itself stays on the stack as the
        # answer. Absence decides neither operator, so it does not short circuit.
        if frame.stack[-1] is False:
            frame.pc = instruction[1]

    def _or_short(self, frame: Frame, instruction: Sequence[Any]) -> None:
        if frame.stack[-1] is True:
            frame.pc = instruction[1]

    # -- branching and loops --------------------------------------------------

    def _jump(self, frame: Frame, instruction: Sequence[Any]) -> None:
        frame.pc = instruction[1]

    def _jump_false(self, frame: Frame, instruction: Sequence[Any]) -> None:
        if not truthy(frame.stack.pop()):
            frame.pc = instruction[1]

    def _tick(self, frame: Frame, instruction: Sequence[Any]) -> None:
        line = self.program.loop_lines[instruction[1]]
        self._loop_line = line
        self.budget.tick(self.here(), line)

    def _for_init(self, frame: Frame, instruction: Sequence[Any]) -> None:
        step = frame.stack.pop()
        limit = frame.stack.pop()
        start = frame.stack.pop()
        bounds = ((start, "start"), (limit, "limit"), (step, "step"))
        for value, bound in bounds:
            if value is ABSENT:
                # An absent bound means the number of iterations is unknown, and
                # running zero times would hide that.
                raise_at("OS4013", self.here(), bound=bound)
        for value, _bound in bounds:
            if not is_number(value):
                raise_at("OS4001", self.here(), index=str(value))
        if step == 0:
            raise_at(
                "OS3004",
                self.here(),
                name="this loop",
                argument="step",
                range="anything but zero",
                found=0,
            )
        frame.slots[instruction[2]] = start
        frame.slots[instruction[3]] = limit
        frame.slots[instruction[4]] = step
        # A descending range with a positive step runs zero times and is never
        # silently reversed.
        if (start > limit) if step > 0 else (start < limit):
            frame.pc = instruction[5]

    def _for_next(self, frame: Frame, instruction: Sequence[Any]) -> None:
        limit = frame.slots[instruction[3]]
        step = frame.slots[instruction[4]]
        moved = finite(float(frame.slots[instruction[2]]) + float(step))
        frame.slots[instruction[2]] = moved
        if moved is ABSENT:
            return
        if (moved <= limit) if step > 0 else (moved >= limit):
            frame.pc = instruction[5]

    # -- arrays ----------------------------------------------------------------

    def _array(self, frame: Frame, instruction: Sequence[Any]) -> None:
        count = instruction[1]
        held = frame.stack[len(frame.stack) - count :] if count else []
        del frame.stack[len(frame.stack) - count :]
        # A new array every time it executes, which is why an array literal is
        # not a constant pool entry.
        frame.stack.append(ArrayValue(list(held)))

    def _element(self, frame: Frame, instruction: Sequence[Any]) -> None:
        index = frame.stack.pop()
        array = frame.stack.pop()
        size = len(array.elements) if isinstance(array, ArrayValue) else 0
        usable = (
            isinstance(array, ArrayValue)
            and is_whole(index)
            and 0 <= index < size
        )
        if not usable:
            # The opposite of a history read past the start of the dataset, and
            # the difference is the point: an array has an extent the script
            # chose, so an index outside it is a mistake.
            raise_at(
                "OS4004",
                self.here(),
                index="none" if index is ABSENT else str(index),
                name="the array",
                size=size,
            )
        frame.stack.append(array.elements[int(index)])

    # -- calls -------------------------------------------------------------------

    def _call_library(self, frame: Frame, instruction: Sequence[Any]) -> None:
        which, count, state = instruction[1], instruction[2], instruction[3]
        arguments = frame.stack[len(frame.stack) - count :] if count else []
        del frame.stack[len(frame.stack) - count :]
        entry = self.program.entries[which]
        if entry.effect != "none":
            self.pending.append(
                PendingEffect(which, entry.name, entry.effect, list(arguments), self.here())
            )
            frame.stack.append(ABSENT)
            return
        region = None if state < 0 else self.states.region(frame.state_base + state)
        # The string ceiling, both halves: the length a call can be asked for
        # before a character of it exists, and the string it did build. A call of
        # no arguments answers a fact the host stated rather than a string this
        # bar grew, and the ceiling is on what a script grows.
        self.budget.measured(self.here(), self.library.length_of(entry.name, arguments))
        answer = self.library.call(entry.name, list(arguments), region, self.context)
        if arguments and isinstance(answer, str):
            self.budget.text(self.here(), answer)
        frame.stack.append(stored(answer))

    def _call_function(self, frame: Frame, instruction: Sequence[Any]) -> None:
        site = self.program.call_sites[instruction[1]]
        body = self.program.functions[site["fn"]]
        count = site["argc"]
        arguments = frame.stack[len(frame.stack) - count :] if count else []
        del frame.stack[len(frame.stack) - count :]
        called = Frame(
            body.code,
            body.slots,
            cell_base=site["cellBase"],
            state_base=site["stateBase"],
            bindings=site["series"],
            positions=body.positions,
        )
        for at, value in enumerate(arguments):
            called.slots[at] = value
        self._frames.append(called)

    def _return(self, frame: Frame, instruction: Sequence[Any]) -> None:
        value = frame.stack.pop()
        self._frames.pop()
        if not self._frames:
            self._answer = value
            self._running = False
            return
        self._frames[-1].stack.append(value)

    # -- output and termination -----------------------------------------------------

    def _emit(self, frame: Frame, instruction: Sequence[Any]) -> None:
        self.channels.write(instruction[1], frame.stack.pop())

    def _halt(self, frame: Frame, instruction: Sequence[Any]) -> None:
        self._answer = ABSENT
        self._running = False
