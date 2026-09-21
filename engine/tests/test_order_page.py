"""The two tables of section 17 this engine copies, read back out of the page.

The engine reads no page, so a vocabulary and a set of signatures have to live in
the package a host installs. A copy is a fact stated twice unless something holds
the two equal, and this is that something: it reads ``stdlib.md`` and fails the
build the day a word, a column or a parameter below stops being the document's.

**What each of these catches.** A status added to the page and not to the engine
would be folded as a word outside the vocabulary and would leave a row's status
alone for ever, which looks exactly like a destination that never answered. A
terminal column read the other way round would release a working order's claim
and let a close be sent twice. And a signature whose parameters have moved is an
argument read from the wrong slot: a quantity read where a limit price is would
place an order at a size nobody wrote.
"""

import re
import unittest

from tests.support import SPEC

from openscript.diagnostics import Position
from openscript.strategy.calls import PARAMETERS, call_of
from openscript.strategy.statuses import (
    HOST_SENDABLE,
    PLACED,
    STATUSES,
    TERMINAL,
    is_terminal,
    rank_of,
    status_from,
)

PAGE = (SPEC / "stdlib.md").read_text(encoding="utf-8")

#: Where a test's call is written. Nothing here turns on a position.
AT = Position(1, 1)

#: One row of 17.7's status table: the word, then the two columns that are yes or
#: no. The two middle columns of the table are prose and are not read.
STATUS_ROW = re.compile(r"^\|\s`(\w+)`\s\|[^|]*\|\s*(Yes|No)\s*\|\s*(Yes|No)\s*\|\s*$", re.M)


def signature_of(name: str):
    """The parameters 17.2 or 17.3 gives one call, in the order it writes them."""
    found = re.search(r"^\|\s`" + re.escape(name) + r"\((.*?)\)`", PAGE, re.M)
    if found is None:
        return None
    inner = found.group(1)
    if inner.strip() == "":
        return ()
    return tuple(one.split("=")[0].strip() for one in inner.split(","))


class TheStatusVocabulary(unittest.TestCase):
    def setUp(self) -> None:
        self.rows = STATUS_ROW.findall(PAGE)

    def test_the_table_is_the_seven_words_in_the_page_order(self):
        self.assertEqual(tuple(word for word, _t, _h in self.rows), STATUSES)

    def test_terminal_is_the_column_the_page_prints(self):
        printed = {word for word, terminal, _h in self.rows if terminal == "Yes"}
        self.assertEqual(printed, set(TERMINAL))
        for word, terminal, _host in self.rows:
            self.assertEqual(is_terminal(word), terminal == "Yes", word)

    def test_a_host_may_send_every_word_but_the_engine_s_own(self):
        printed = tuple(word for word, _t, host in self.rows if host == "Yes")
        self.assertEqual(printed, HOST_SENDABLE)
        self.assertNotIn(PLACED, HOST_SENDABLE)

    def test_a_word_outside_the_vocabulary_is_not_one(self):
        # A destination's own word mapped onto nothing. Read as a status it would
        # decide an order was dead on a word the engine has never seen.
        self.assertIsNone(status_from("partiallyFilled"))
        self.assertIsNone(status_from(""))
        for word in STATUSES:
            self.assertEqual(status_from(word), word)

    def test_the_two_live_words_share_a_rank_and_sit_between_the_ends(self):
        # Either may follow the other without the status going backwards, which is
        # what a rank per word rather than an ordering of the seven is for.
        self.assertEqual(rank_of("working"), rank_of("triggerPending"))
        self.assertLess(rank_of(PLACED), rank_of("working"))
        for word in TERMINAL:
            self.assertGreater(rank_of(word), rank_of("working"))


class TheCallSignatures(unittest.TestCase):
    def test_every_call_the_engine_reads_is_a_call_the_page_declares(self):
        for name in PARAMETERS:
            self.assertIsNotNone(signature_of(name), name)

    def test_the_parameters_are_the_page_s_own_in_the_page_s_order(self):
        for name, params in PARAMETERS.items():
            self.assertEqual(signature_of(name), params, name)

    def test_the_written_names_sit_one_past_the_page_s_last_parameter(self):
        # 4.10: an order call takes one argument more than the language surface
        # shows, and it is the last one. An engine counting the surface would read
        # that string as the leg, and would then never see an argument the script
        # wrote that came out absent.
        for name, params in PARAMETERS.items():
            args = [None] * len(params) + [" ".join(params)]
            self.assertEqual(call_of(name, args, AT).absent, params, name)
            quiet = [None] * len(params) + [""]
            self.assertEqual(call_of(name, quiet, AT).absent, (), name)


if __name__ == "__main__":
    unittest.main()
