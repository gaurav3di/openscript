"""Identity calls preserve every tag while obeying the numeric zero rule."""

import copy
import unittest

from openscript.library import table
from openscript.library.arithmetic import or_else
from openscript.memory import Channels, Register
from openscript.run import load
from openscript.values import Colour, Reference
from tests.support import channel, confirmed, flat, pattern, program, register


class ZeroBoundaries(unittest.TestCase):
    def test_host_register_normalizes_before_history_or_library_arguments(self):
        register = Register()
        register.current = -0.0
        self.assertEqual(pattern(register.current), "0000000000000000")
        register.close()
        self.assertEqual(pattern(register.at(0)), "0000000000000000")
        saved = copy.deepcopy(register)
        register.current = 2.0
        restored = copy.deepcopy(saved)
        self.assertEqual(pattern(restored.current), "0000000000000000")
        self.assertEqual(pattern(restored.at(0)), "0000000000000000")

    def test_identity_normalizes_either_numeric_zero(self):
        entry = table()[("orElse", 2)]
        for value, fallback in [(-0.0, 1.0), (None, -0.0), (-0.0, -0.0), (0.0, -0.0)]:
            self.assertEqual(pattern(or_else(value, fallback)), "0000000000000000")
            self.assertEqual(pattern(entry.call(None, [value, fallback])), "0000000000000000")

    def test_identity_preserves_boolean_text_colour_and_reference(self):
        entry = table()[("orElse", 2)]
        for value in [False, True, "", "zero", None, 3.0, Colour(1, 2, 3, 0.5), Reference()]:
            self.assertIs(or_else(value, None), value)
            self.assertIs(or_else(None, value), value)
            self.assertIs(entry.call(None, [value, None]), value)
            self.assertIs(entry.call(None, [None, value]), value)

    def test_compiled_host_bar_and_cell_are_positive_zero(self):
        raw = program([["SLOAD", 0], ["STORE", 0], ["LOAD", 0], ["STOREC", 0],
                       ["LOADC", 0], ["EMIT", 0], ["HALT"]], channels=[channel(0)],
                      series=[register(0, "close")], frame={"slots": 1},
                      cells=[{"id": 0, "kind": "var", "name": "saved"}])
        loaded = load(raw)
        self.assertTrue(loaded.ok, loaded.diagnostic)
        row = loaded.run.execute_bar(0, flat(-0.0), confirmed())
        self.assertIsNone(row.diagnostic)
        self.assertEqual(pattern(row.columns[0]), "0000000000000000")

    def test_channel_normalizes_before_publication(self):
        channels = Channels(1)
        channels.write(0, -0.0)
        self.assertEqual(pattern(channels.read(0)), "0000000000000000")


if __name__ == "__main__":
    unittest.main()
