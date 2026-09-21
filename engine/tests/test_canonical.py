"""The canonical encoding, and the boundary it is required at.

Three questions, and each of them has a wrong implementation that would pass
everything else in this suite.

**A writer that uses the interpreter's own layout.** Every number below reads
back as the value it names on any host worth shipping on, so a test that only
round tripped would pass while one engine wrote ``1e+21`` and the other wrote
``1e21``, and the two would hash the same program to different bytes. The vectors
carry the text, so the text is what is compared.

**A loader that parses and does not compare.** Canonicity is not a property of
the object, and an engine that checked the object would find nothing to check:
an object has no whitespace and no key order until it is written. So the
comparison is against the text, and the rows below are text that parses
perfectly and is not canonical.

**A loader that asks the question at the wrong boundary.** An object built in the
same process was never text and enters at step 2, which is the minute this
repository already settled. A ``load`` that refused one would refuse the compiler
beside it.
"""

import json
import struct
import unittest

from tests import support
from tests.support import SPEC

from openscript.canonical import canonical_number, canonical_string, canonicalise, parse
from openscript.run import load, load_text


class TheNumberWriter(unittest.TestCase):
    """Every row of ``spec/vectors/number-text.json``, which is the rule's oracle."""

    def setUp(self):
        self.rows = json.loads(
            (SPEC / "vectors" / "number-text.json").read_text(encoding="utf-8")
        )["vectors"]

    def test_the_file_holds_the_boundary_rows(self):
        # A test that iterates an empty list passes and proves nothing.
        self.assertGreater(len(self.rows), 40)

    def test_every_value_is_written_as_the_vector_says(self):
        for row in self.rows:
            with self.subTest(note=row["note"]):
                value = struct.unpack(">d", bytes.fromhex(row["bits"]))[0]
                self.assertEqual(canonical_number(value), row["text"])

    def test_a_negative_zero_is_written_as_a_zero(self):
        # The language holds one zero, and an engine that spelled the sign here
        # would reach text with a difference nothing else in the language can
        # observe.
        self.assertEqual(canonical_number(-0.0), "0")
        self.assertEqual(canonical_number(0.0), "0")

    def test_an_infinity_is_not_a_number_a_program_holds(self):
        for value in (float("inf"), float("-inf"), float("nan")):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    canonical_number(value)


class TheStringWriter(unittest.TestCase):
    """A string escapes only what it must, and the three that have a letter."""

    def test_only_the_quote_the_backslash_and_the_controls_are_escaped(self):
        self.assertEqual(canonical_string("a"), '"a"')
        self.assertEqual(canonical_string('a"b'), '"a\\"b"')
        self.assertEqual(canonical_string("a\\b"), '"a\\\\b"')
        self.assertEqual(canonical_string("a\nb"), '"a\\nb"')
        self.assertEqual(canonical_string("a\rb"), '"a\\rb"')
        self.assertEqual(canonical_string("a\tb"), '"a\\tb"')
        self.assertEqual(canonical_string("a\x01b"), '"a\\u0001b"')

    def test_a_code_point_outside_the_basic_plane_is_written_as_itself(self):
        # Escaping it would be a second spelling of one string, and two emitters
        # that chose differently would hash one program to two names.
        self.assertEqual(canonical_string("a\U0001f600b"), '"a\U0001f600b"')


class TheObjectWriter(unittest.TestCase):
    def test_keys_are_sorted_by_code_point_and_nothing_separates_the_tokens(self):
        self.assertEqual(canonicalise({"b": 1, "a": 2}), '{"a":2,"b":1}')
        self.assertEqual(canonicalise({"Z": 1, "a": 2}), '{"Z":1,"a":2}')
        self.assertEqual(canonicalise([1, 2, 3]), "[1,2,3]")
        self.assertEqual(canonicalise(None), "null")
        self.assertEqual(canonicalise(True), "true")


class TheCorpusOfRealPrograms(unittest.TestCase):
    """Every shipped example, as the compiler beside this engine wrote it.

    The strongest check in this file: twelve programs of a few thousand
    characters each, written by the other engine's compiler, reproduced
    character for character by this writer. A layout rule that differed anywhere
    would part company inside the first one.
    """

    def setUp(self):
        self.files = sorted(
            one for one in (SPEC / "corpus").glob("*.json") if one.name != "index.json"
        )

    def test_the_corpus_is_there(self):
        self.assertGreater(len(self.files), 5)

    def test_every_program_is_rewritten_byte_for_byte(self):
        for one in self.files:
            with self.subTest(program=one.name):
                # The file ends with a newline, which is the file's and not the
                # program's: the canonical encoding has no whitespace in it.
                text = one.read_text(encoding="utf-8").rstrip("\n")
                self.assertEqual(canonicalise(json.loads(text)), text)

    def test_every_program_passes_the_text_entry(self):
        for one in self.files:
            with self.subTest(program=one.name):
                text = one.read_text(encoding="utf-8").rstrip("\n")
                parsed, refusal = parse(text)
                self.assertIsNone(refusal)
                self.assertIsInstance(parsed, dict)


class TextThatParsesAndIsNotCanonical(unittest.TestCase):
    """Each row is a program by the object it builds and is not by its bytes."""

    def setUp(self):
        self.canonical = canonicalise(support.program([["HALT"]]))

    def test_the_canonical_form_of_the_test_program_is_accepted(self):
        parsed, refusal = parse(self.canonical)
        self.assertIsNone(refusal)
        self.assertIsNotNone(parsed)

    def test_a_space_between_two_tokens_is_refused(self):
        spaced = self.canonical.replace('","', '", "', 1)
        parsed, refusal = parse(spaced)
        self.assertIsNone(parsed)
        self.assertEqual(refusal.code, "OS6018")
        self.assertTrue(refusal.values["location"].startswith("character "))

    def test_keys_in_another_order_are_refused(self):
        held = json.loads(self.canonical)
        backwards = {key: held[key] for key in reversed(list(held))}
        reordered = json.dumps(backwards, separators=(",", ":"))
        self.assertNotEqual(reordered, self.canonical)
        parsed, refusal = parse(reordered)
        self.assertIsNone(parsed)
        self.assertEqual(refusal.code, "OS6018")

    def test_a_byte_order_mark_is_refused_at_character_zero(self):
        parsed, refusal = parse("﻿" + self.canonical)
        self.assertIsNone(parsed)
        self.assertEqual(refusal.code, "OS6018")
        self.assertEqual(refusal.values["location"], "character 0")

    def test_text_that_does_not_parse_is_refused(self):
        parsed, refusal = parse("{")
        self.assertIsNone(parsed)
        self.assertEqual(refusal.code, "OS6018")

    def test_the_three_spellings_a_reader_would_build_a_non_number_from(self):
        # A reader that accepted these would hand the machine a value section 3.1
        # says it never holds, and the failure would arrive later as a wrong
        # number rather than here as a refusal.
        for spelling in ("NaN", "Infinity", "-Infinity"):
            with self.subTest(spelling=spelling):
                parsed, refusal = parse('{"openscript":' + spelling + "}")
                self.assertIsNone(parsed)
                self.assertEqual(refusal.code, "OS6018")

    def test_the_character_named_is_where_the_two_part(self):
        spaced = " " + self.canonical
        parsed, refusal = parse(spaced)
        self.assertIsNone(parsed)
        self.assertEqual(refusal.values["location"], "character 0")


class WhichBoundaryTheRuleIsAt(unittest.TestCase):
    """Text is held to it and an object is not, which is the minute on it."""

    def setUp(self):
        self.built = support.program([["HALT"]])

    def test_an_object_built_in_this_process_is_never_asked(self):
        # The wrong implementation this catches is an engine that canonicalises
        # whatever it is handed: it would refuse the compiler beside it, which
        # produced an object and never any text.
        result = load(self.built)
        self.assertTrue(result.ok, msg=str(result.diagnostic))

    def test_the_same_program_as_text_is_asked(self):
        self.assertTrue(load_text(canonicalise(self.built)).ok)
        refused = load_text(json.dumps(self.built))
        self.assertFalse(refused.ok)
        self.assertEqual(refused.diagnostic.code, "OS6018")


if __name__ == "__main__":
    unittest.main()
