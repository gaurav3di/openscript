"""The forty-one instructions, as a table rather than as forty-one functions.

``compiled-program.md`` section 4.13 prints the whole set with its operands and
its stack effect, and this is that table in the one form an engine needs it:
what each opcode's operands are called, how deep the stack goes after it, which
operand is a jump target, and which table each operand indexes into.

It is a table because verification needs the same facts the interpreter needs. A
dispatch written as forty-one functions with the operand counts implied by their
signatures would leave the verifier to state them a second time, and the two
would drift the day an instruction changed.

**The page is the source and this is a copy, so a test compares them.** That is
the standing habit of this repository: a figure the specification prints is
measured by a test rather than quoted by one. ``tests/test_opcodes.py`` reads
section 4.13 out of the document by pattern and holds every row here to it, so a
row the page gains, loses or changes fails this engine's tests naming the
opcode. Nothing here may be corrected without the page being read again.
"""

from typing import Mapping, Sequence, Tuple

#: Depth changes that are not a fixed number, written as the page writes them.
BY_COUNT = "1 - n"
BY_ARGC = "1 - argc"

#: Opcode, operand names in order, depth change, and the group the page files it under.
TABLE: Mapping[str, Tuple[Sequence[str], object, str]] = {
    "CONST": (("k",), 1, "Constants and stack"),
    "DUP": ((), 1, "Constants and stack"),
    "POP": ((), -1, "Constants and stack"),
    "LOAD": (("s",), 1, "Slots"),
    "STORE": (("s",), -1, "Slots"),
    "CELL_INIT": (("c", "t"), 0, "Cells"),
    "LOADC": (("c",), 1, "Cells"),
    "STOREC": (("c",), -1, "Cells"),
    "SLOAD": (("r",), 1, "Series"),
    "SSTORE": (("r",), -1, "Series"),
    "HIST": (("r",), 0, "Series"),
    "HISTP": (("p",), 0, "Series"),
    "ADD": ((), -1, "Arithmetic"),
    "SUB": ((), -1, "Arithmetic"),
    "MUL": ((), -1, "Arithmetic"),
    "DIV": ((), -1, "Arithmetic"),
    "MOD": ((), -1, "Arithmetic"),
    "NEG": ((), 0, "Arithmetic"),
    "LT": ((), -1, "Comparison"),
    "LE": ((), -1, "Comparison"),
    "GT": ((), -1, "Comparison"),
    "GE": ((), -1, "Comparison"),
    "EQ": ((), -1, "Comparison"),
    "NE": ((), -1, "Comparison"),
    "NOT": ((), 0, "Logic"),
    "AND": ((), -1, "Logic"),
    "OR": ((), -1, "Logic"),
    "AND_SHORT": (("t",), 0, "Logic"),
    "OR_SHORT": (("t",), 0, "Logic"),
    "JUMP": (("t",), 0, "Control"),
    "JUMP_FALSE": (("t",), -1, "Control"),
    "TICK": (("l",), 0, "Control"),
    "FOR_INIT": (("l", "s", "sLim", "sStep", "t"), -3, "Control"),
    "FOR_NEXT": (("l", "s", "sLim", "sStep", "t"), 0, "Control"),
    "ARRAY": (("n",), BY_COUNT, "Arrays"),
    "ELEM": ((), -1, "Arrays"),
    "CALL_LIB": (("f", "n", "st"), BY_COUNT, "Calls"),
    "CALL_FN": (("site",), BY_ARGC, "Calls"),
    "RET": ((), -1, "Calls"),
    "EMIT": (("ch",), -1, "Output"),
    "HALT": ((), 0, "Termination"),
}

#: Which operand of an instruction is a jump target, by position.
#:
#: Read off the operand names rather than written down again: ``t`` is the name
#: section 4's operand table gives a jump target and nothing else carries it.
TARGETS: Mapping[str, Sequence[int]] = {
    opcode: tuple(at for at, name in enumerate(names) if name == "t")
    for opcode, (names, _depth, _group) in TABLE.items()
}

#: Which table each operand indexes into, for the range half of check 1.
#:
#: ``target`` is an instruction index in the same list and ``count`` is a number
#: the instruction carries rather than an index into anything.
OPERAND_TABLES: Mapping[str, Sequence[str]] = {
    "CONST": ("consts",),
    "LOAD": ("slots",),
    "STORE": ("slots",),
    "CELL_INIT": ("cells", "target"),
    "LOADC": ("cells",),
    "STOREC": ("cells",),
    "SLOAD": ("registers",),
    "SSTORE": ("registers",),
    "HIST": ("registers",),
    "HISTP": ("bindings",),
    "AND_SHORT": ("target",),
    "OR_SHORT": ("target",),
    "JUMP": ("target",),
    "JUMP_FALSE": ("target",),
    "TICK": ("loops",),
    "FOR_INIT": ("loops", "slots", "slots", "slots", "target"),
    "FOR_NEXT": ("loops", "slots", "slots", "slots", "target"),
    "ARRAY": ("count",),
    "CALL_LIB": ("libFunctions", "count", "states"),
    "CALL_FN": ("callSites",),
    "EMIT": ("channels",),
}

#: What a reader is told a table is called when an operand is outside it.
TABLE_NAMES: Mapping[str, str] = {
    "slots": "the frame",
    "cells": "cells",
    "states": "states",
    "registers": "series",
    "channels": "channels",
    "libFunctions": "lib.functions",
    "callSites": "callSites",
    "loops": "loops",
    "consts": "consts",
    "bindings": "the call site's series bindings",
}

#: Check 8's program half: an instruction that needs a tag in ``requires``.
INSTRUCTION_TAGS: Mapping[str, str] = {
    "ARRAY": "arrays",
    "ELEM": "arrays",
    "CALL_FN": "functions",
    "TICK": "loops",
}


def is_opcode(name: object) -> bool:
    return isinstance(name, str) and name in TABLE


def operand_count(opcode: str) -> int:
    return len(TABLE[opcode][0])


def operand_names(opcode: str) -> Sequence[str]:
    return TABLE[opcode][0]


def depth_change(opcode: str, operands: Sequence[int], argc_of) -> int:
    """How far the stack moves, with the two formulas resolved.

    ``CALL_FN`` reads its call site's ``argc``, which is fixed at load, so the
    depth stays statically computable and the verifier can walk the list.
    """
    written = TABLE[opcode][1]
    if written == BY_COUNT:
        return 1 - int(operands[1] if opcode == "CALL_LIB" else operands[0])
    if written == BY_ARGC:
        return 1 - int(argc_of(int(operands[0])))
    return int(written)


def targets(opcode: str) -> Sequence[int]:
    return TARGETS.get(opcode, ())


COUNT: int = len(TABLE)


def tables_for(opcode: str) -> Sequence[str]:
    return OPERAND_TABLES.get(opcode, ())
