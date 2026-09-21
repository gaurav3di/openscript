"""The status vocabulary of ``stdlib.md`` section 17.7, and what each word does.

The words themselves are the page's and the table there is the authority. What
is here is the three facts the fold needs to be able to ask: whether a word is
one of the seven, whether it ends an order, and how far along its life it sits.
``tests/test_statuses.py`` reads the table out of the page and fails the day one
of the three stops being what the page says, which is the arrangement this
engine already uses for every other constant it carries: the package a host
installs does not ship the specification, so the values live here and a test
holds them to the document.

**A rank rather than an ordering of the seven words.** Two of them share the
middle rank because an order that is live and one that is waiting for its
trigger are the same distance from the end, and either may follow the other
without the status going backwards.

**``placed`` is the engine's own.** It means an intent has left and nothing has
come back, and a host cannot report a state the destination has never described,
so it is the one word the last column of the table refuses a host.
"""

from typing import FrozenSet, Optional, Tuple

#: The seven words a row's status may take, in the order the page prints them.
STATUSES: Tuple[str, ...] = (
    "placed",
    "working",
    "triggerPending",
    "filled",
    "cancelled",
    "rejected",
    "expired",
)

#: The four that end an order. A terminal row still takes a fill, under 17.8, so
#: this decides what the status may become and nothing about what the quantity
#: may do.
TERMINAL: FrozenSet[str] = frozenset({"filled", "cancelled", "rejected", "expired"})

#: The six a host may send in a frame, which is every word but the engine's own.
HOST_SENDABLE: Tuple[str, ...] = tuple(one for one in STATUSES if one != "placed")

#: The word a row is appended at.
PLACED = "placed"


def is_terminal(status: str) -> bool:
    """Whether this word ends an order."""
    return status in TERMINAL


def status_from(word: str) -> Optional[str]:
    """The word a host sent, or nothing where it is not one of the seven.

    A word outside the vocabulary leaves a row's status alone and the rest of
    the frame folds anyway, which is ``row``'s decision and is written there.
    """
    return word if word in STATUSES else None


def rank_of(status: str) -> int:
    """How far along its life a status sits: 0 sent, 1 live, 2 ended."""
    if status == PLACED:
        return 0
    return 2 if is_terminal(status) else 1
