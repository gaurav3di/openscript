"""Every code this engine raises, held to the catalogue that owns it.

``spec/errors.json`` is the catalogue and the authority. This package carries no
message text for a diagnostic, on purpose: the wording is generated into the
first engine rather than retyped in it, and a second engine that typed the
sentences out again would be a second place for them to be wrong. (The reasons
``req.error`` hands a script are values rather than diagnostics, and
``tests/test_request_host.py`` holds those six to the catalogue word for word.)
What it does carry is a code and the values the message has placeholders for,
and those are exactly what can go wrong quietly.

So the package's own source is read here, every call that raises or builds a
diagnostic is found, and each one is put to the catalogue:

- **A code the catalogue does not have.** A diagnostic nobody can look up, and
  the conformance suite compares codes, so a wrong one is a failing case with a
  message that explains nothing.
- **A placeholder the catalogue does not name.** The message would render with a
  hole in it, and the hole would only ever be seen by the user it was written
  for.
- **A placeholder the catalogue names and this engine does not supply.** The same
  hole, reached from the other side.
- **A severity that is not the one an engine can raise.** Every failure here
  stops a bar or a load, and there is no reading of a compiled program that
  produces something a host could carry on past.

Nothing is executed to find them. The source is read as a syntax tree, which is
a tree and not a program: this package builds nothing out of text, and neither
does the test that reads it.
"""

import ast
import unittest

from tests.support import ENGINE, catalogue

from openscript.diagnostics import (
    ERROR,
    NO_POSITION,
    Diagnostic,
    ScriptError,
    at_instruction,
    failure,
    malformed,
    raise_at,
)

PACKAGE = ENGINE / "openscript"

#: The calls that carry a code, and where the code sits in each: the two that
#: build a diagnostic, and the refusal an array call raises for the machine to
#: position (``arrays.py``).
BUILDERS = ("failure", "raise_at", "Refused")


def raised():
    """Every (file, line, code, placeholder names) this package can produce."""
    found = []
    for one in sorted(PACKAGE.rglob("*.py")):
        tree = ast.parse(one.read_text(encoding="utf-8"), filename=str(one))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Name):
                continue
            if node.func.id not in BUILDERS or not node.args:
                continue
            first = node.args[0]
            if not isinstance(first, ast.Constant) or not isinstance(first.value, str):
                continue
            names = tuple(sorted(one.arg for one in node.keywords if one.arg is not None))
            found.append((one.relative_to(ENGINE).as_posix(), node.lineno, first.value, names))
    return found


class EveryCodeThisEngineRaises(unittest.TestCase):
    def setUp(self):
        self.entries = {one["code"]: one for one in catalogue()["entries"]}
        self.raised = raised()

    def test_the_source_was_actually_read(self):
        # A walk that found nothing would make every comparison below pass over
        # an empty list, which is the one failure this file cannot afford.
        self.assertGreater(len(self.raised), 10)
        self.assertGreater(len({one[2] for one in self.raised}), 8)

    def test_every_code_is_in_the_catalogue(self):
        for where, line, code, _names in self.raised:
            with self.subTest(at=f"{where}:{line}", code=code):
                self.assertIn(code, self.entries)

    def test_every_code_is_an_error_rather_than_a_softer_severity(self):
        for where, line, code, _names in self.raised:
            with self.subTest(at=f"{where}:{line}", code=code):
                self.assertEqual(self.entries[code]["severity"], ERROR)

    def test_every_call_supplies_exactly_the_placeholders_the_message_names(self):
        for where, line, code, names in self.raised:
            with self.subTest(at=f"{where}:{line}", code=code):
                wanted = tuple(sorted(self.entries[code].get("placeholders", {})))
                self.assertEqual(names, wanted)

    def test_the_codes_this_stage_owns_are_all_reachable(self):
        # Every code the interpreter is responsible for is raised by some path
        # here. One that is not would be a promise nothing keeps, which is the
        # rule the other engine's own check enforces on the catalogue.
        mine = {
            "OS3004",
            "OS4001",
            "OS4002",
            "OS4004",
            "OS4013",
            "OS5001",
            "OS5002",
            "OS5003",
            "OS5004",
            "OS5005",
            "OS5009",
            "OS6004",
            "OS6006",
            "OS6016",
            "OS6017",
            "OS6018",
            "OS6019",
        }
        self.assertEqual(mine - {one[2] for one in self.raised}, set())


class WhatADiagnosticCarries(unittest.TestCase):
    def test_a_load_failure_carries_no_line_because_the_defect_is_in_the_program(self):
        found = malformed("consts", "an array was required")
        self.assertEqual(found.position, NO_POSITION)
        self.assertEqual(found.line, 0)
        self.assertEqual(found.column, 0)

    def test_the_location_of_an_instruction_is_spelled_as_the_page_spells_it(self):
        self.assertEqual(at_instruction("code", 7), "instruction 7")
        self.assertEqual(at_instruction("functions[2]", 7), "functions[2] instruction 7")

    def test_a_raised_failure_arrives_as_its_diagnostic(self):
        with self.assertRaises(ScriptError) as stopped:
            raise_at("OS4013", NO_POSITION, bound="start")
        self.assertIsInstance(stopped.exception.diagnostic, Diagnostic)
        self.assertEqual(stopped.exception.diagnostic.code, "OS4013")
        self.assertEqual(stopped.exception.diagnostic.values, {"bound": "start"})

    def test_a_diagnostic_holds_no_message_text(self):
        # The catalogue owns the wording and the suite compares the code, the
        # line, the column and the severity. A copy of a sentence here would be
        # a sentence to keep in step with one nobody would remember to read.
        held = failure("OS6006", tag="orders")
        self.assertEqual(sorted(vars(held)), ["code", "position", "severity", "values"])


if __name__ == "__main__":
    unittest.main()
