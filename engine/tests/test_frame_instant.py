"""The instant a frame arrived at, read out of ``frames.csv`` and onto the frame.

``host-interface.md`` 7.2 gives an order frame a ``time``, the destination's own
instant for it, and ``stdlib.md`` 17.7 moves a row's ``updatedAt`` to it: when a
frame last changed the row. ``conformance.md`` section 3 carries the column, and
this engine is driven from the file, so a reader that dropped it would hand the
ledger frames with no instant and leave that field where the placement put it,
whatever the case says its destination did.

The wrong readers below are written against: one that drops the column, one that
takes the word for an absent value as a number, one that reads the columns by a
list of its own rather than by the header the file states, and one that refuses a
file written with the seven columns the page had before.
"""

import unittest

from openscript.adapter.page import FRAMES_HEADER
from openscript.adapter.reading import read_frames
from openscript.adapter.spellings import Malformed

BREAK = chr(10)

#: Two frames about one order: an acknowledgement at one instant and a fill at a
#: later one, which is the pair a file with no column for them could not tell
#: apart from a pair that arrived together.
SPOKEN = (
    "afterBar,intent,status,filledQty,avgFillPrice,orderRef,text,time",
    "1,1,working,0,none,R1,,1735693200000",
    "3,1,filled,10,102.6,R1,,1735700400000",
)


def file_of(*lines):
    return BREAK.join(lines) + BREAK


class TheInstantColumn(unittest.TestCase):
    def test_a_frame_carries_the_instant_the_file_states(self):
        read = read_frames(file_of(*SPOKEN))
        self.assertEqual([one.time for one in read], [1735693200000.0, 1735700400000.0])
        self.assertEqual([one.after_bar for one in read], [1, 3])
        self.assertEqual(read[1].avg_fill_price, 102.6)

    def test_an_instant_the_destination_never_stated_is_absence(self):
        # Absent as ``none``, the way every other case file writes an absent
        # field. A reader taking the word for a number would put a frame in the
        # ledger at an instant of nothing at all.
        read = read_frames(file_of(SPOKEN[0], "1,1,working,0,none,R1,,none"))
        self.assertIsNone(read[0].time)

    def test_a_file_without_the_column_states_no_instant_on_any_row(self):
        # Section 3: an omitted column is absent on every row, and the optional
        # columns are dropped from the right. Catches a reader that reads by a
        # list of its own: one column short, it would take the reference for the
        # text and the text for the instant.
        narrow = tuple(line[: line.rfind(",")] for line in SPOKEN)
        read = read_frames(file_of(*narrow))
        self.assertEqual(tuple(narrow[0].split(",")), FRAMES_HEADER[:-1])
        self.assertEqual([one.time for one in read], [None, None])
        self.assertEqual([one.order_ref for one in read], ["R1", "R1"])
        self.assertEqual([one.text for one in read], ["", ""])

    def test_an_instant_that_is_not_a_number_is_refused(self):
        # A malformed case is reported ``error`` and never run, because a frame
        # at an instant nobody can read is not input the expected output came
        # from.
        with self.assertRaises(Malformed):
            read_frames(file_of(SPOKEN[0], "1,1,working,0,none,R1,,half past"))


if __name__ == "__main__":
    unittest.main()
