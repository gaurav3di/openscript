"""The instruction table, held to the page that prints it.

``opcodes.py`` is a copy of section 4.13's table, and a copy is exactly what this
repository does not leave to attention: the figure the specification prints is
measured by a test rather than quoted by one. So the page is read here by
pattern, row by row, and every opcode's operand names and stack effect are
compared with the table this engine dispatches on.

What it catches, and none of these would be caught by any other test in this
suite until the day a real program used the instruction:

- **An operand miscounted.** ``FOR_INIT`` takes five and an engine that wrote
  four would accept a program the format never allowed and misread every later
  operand in the list.
- **A depth written with the wrong sign.** The depth walk of check 5 is the only
  thing standing between a malformed list and a read past the end of a stack, and
  a walk done with the wrong numbers proves nothing while reporting that it did.
- **An opcode that is here and is not there, or the reverse.** Forty-one is a
  promise rather than a measurement, and an engine with forty two arms is an
  engine running programs the format does not define.
"""

import re
import unittest

from tests.support import SPEC

from openscript import opcodes

ROW = re.compile(r"^\|\s*`([A-Z_]+)`\s*\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$")
NAME = re.compile(r"`([A-Za-z]+)`")


def page_table():
    """Section 4.13's rows: opcode, operand names, depth as written, group."""
    page = (SPEC / "compiled-program.md").read_text(encoding="utf-8")
    start = page.index("### 4.13 The whole set")
    block = page[start : page.index("## 5. Per-bar execution")]
    found = {}
    for line in block.splitlines():
        matched = ROW.match(line)
        if matched is None:
            continue
        opcode, operands, depth, group = matched.groups()
        found[opcode] = (
            tuple(NAME.findall(operands)),
            depth.strip().strip("`"),
            group.strip(),
        )
    return found


def as_written(depth) -> str:
    """This engine's depth in the spelling the page writes it in."""
    if isinstance(depth, str):
        return depth
    return f"+{depth}" if depth > 0 else str(depth)


class TheTableIsThePages(unittest.TestCase):
    def setUp(self):
        self.page = page_table()

    def test_the_page_was_actually_read(self):
        # A pattern that matched nothing would make every comparison below pass
        # over an empty table, which is the failure this whole file exists to
        # avoid in the other direction.
        self.assertGreater(len(self.page), 30)

    def test_the_set_is_the_same_on_both_sides(self):
        self.assertEqual(sorted(self.page), sorted(opcodes.TABLE))

    def test_the_count_is_the_one_the_page_states(self):
        stated = (SPEC / "compiled-program.md").read_text(encoding="utf-8")
        self.assertIn("Forty-one instructions", stated)
        self.assertEqual(opcodes.COUNT, 41)
        self.assertEqual(len(self.page), 41)

    def test_every_operand_list_agrees(self):
        for opcode, (operands, _depth, _group) in self.page.items():
            with self.subTest(opcode=opcode):
                self.assertEqual(tuple(opcodes.operand_names(opcode)), operands)

    def test_every_depth_agrees(self):
        for opcode, (_operands, depth, _group) in self.page.items():
            with self.subTest(opcode=opcode):
                self.assertEqual(as_written(opcodes.TABLE[opcode][1]), depth)

    def test_every_group_agrees(self):
        for opcode, (_operands, _depth, group) in self.page.items():
            with self.subTest(opcode=opcode):
                self.assertEqual(opcodes.TABLE[opcode][2], group)


class TheTwoDepthsThatAreFormulas(unittest.TestCase):
    """``1 - n`` and ``1 - argc`` are resolved, not read as a number."""

    def test_an_array_of_n_leaves_one_value(self):
        for count in (0, 1, 3, 17):
            with self.subTest(count=count):
                self.assertEqual(opcodes.depth_change("ARRAY", [count], lambda site: 0), 1 - count)

    def test_a_library_call_reads_its_argument_count_and_not_its_index(self):
        # The count is the second operand. An engine that read the first would
        # charge the function's index to the stack.
        self.assertEqual(opcodes.depth_change("CALL_LIB", [9, 2, -1], lambda site: 0), -1)

    def test_a_user_call_reads_the_call_site(self):
        self.assertEqual(opcodes.depth_change("CALL_FN", [0], lambda site: 3), -2)


class TheDerivedTables(unittest.TestCase):
    def test_a_jump_target_is_found_by_the_operand_name_the_page_gives_it(self):
        self.assertEqual(tuple(opcodes.targets("JUMP")), (0,))
        self.assertEqual(tuple(opcodes.targets("CELL_INIT")), (1,))
        self.assertEqual(tuple(opcodes.targets("FOR_INIT")), (4,))
        self.assertEqual(tuple(opcodes.targets("FOR_NEXT")), (4,))
        self.assertEqual(tuple(opcodes.targets("ADD")), ())

    def test_every_operand_table_names_a_table_the_shape_check_knows(self):
        known = set(opcodes.TABLE_NAMES) | {"target", "count"}
        for opcode, tables in opcodes.OPERAND_TABLES.items():
            with self.subTest(opcode=opcode):
                self.assertEqual(len(tables), opcodes.operand_count(opcode))
                for table in tables:
                    self.assertIn(table, known)

    def test_nothing_is_an_opcode_that_is_not_one(self):
        self.assertFalse(opcodes.is_opcode("PUSH"))
        self.assertFalse(opcodes.is_opcode(7))
        self.assertTrue(opcodes.is_opcode("HALT"))


if __name__ == "__main__":
    unittest.main()
