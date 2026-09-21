"""The two string rules two engines have to share, written from the page.

**A string is a sequence of code points** (`compiled-program.md` section 3.1),
so length, indexing and comparison count code points and not the storage unit of
whatever language an engine is written in. This host stores a string as code
points already, which makes the rule free here and does not make it optional: an
engine whose strings are sixteen bit units has to count and index past a
surrogate pair as one element, or the two disagree about the length of a string
holding a symbol outside the basic plane and about every substring taken after
one.

**Ordering.** Two strings are ordered by comparing code points from the front,
the first difference deciding, and a string that runs out first ordering first
(`language.md` section 9.3, `stdlib.md` section 10). It is the one order in the
language: the four comparison operators and a sort over an array of strings
agree. This host's own comparison is already by code point, so the function below
is the rule written down rather than a correction of the host, and a test holds
it to a pair the unit based order would get wrong.

**Whitespace.** ``str.trim`` removes, and ``toNumber`` ignores at either end,
exactly the code points `stdlib.md` section 10 lists, which are the ones with the
Unicode White_Space property, and no other. The host's own strip removes a
different set: it takes the four information separators U+001C to U+001F as well,
and another host takes the byte order mark U+FEFF and leaves those, so neither
host's default is the set and the set is written out here. ``tests/test_strings``
walks every code point of the basic plane against the table read out of the page,
which is what makes the page the input rather than this list.
"""

# The code points `stdlib.md` section 10 lists, in the order it lists them.
_WHITESPACE: frozenset[int] = frozenset(
    {
        0x0009,  # character tabulation
        0x000A,  # line feed
        0x000B,  # line tabulation
        0x000C,  # form feed
        0x000D,  # carriage return
        0x0020,  # space
        0x0085,  # next line
        0x00A0,  # no-break space
        0x1680,  # ogham space mark
        0x2000,  # en quad, through the hair space
        0x2001,
        0x2002,
        0x2003,
        0x2004,
        0x2005,
        0x2006,
        0x2007,
        0x2008,
        0x2009,
        0x200A,
        0x2028,  # line separator
        0x2029,  # paragraph separator
        0x202F,  # narrow no-break space
        0x205F,  # medium mathematical space
        0x3000,  # ideographic space
    }
)


def is_whitespace(point: int) -> bool:
    """Whether one code point is in the trimmed set."""
    return point in _WHITESPACE


def trimmed(text: str) -> str:
    """``text`` with the whitespace of the written set taken off both ends."""
    start = 0
    end = len(text)
    while start < end and is_whitespace(ord(text[start])):
        start += 1
    while end > start and is_whitespace(ord(text[end - 1])):
        end -= 1
    return text[start:end]


def compare(a: str, b: str) -> int:
    """The order of two strings: negative when ``a`` comes first, by code point."""
    for one, other in zip(a, b):
        if one != other:
            return -1 if ord(one) < ord(other) else 1
    if len(a) == len(b):
        return 0
    return -1 if len(a) < len(b) else 1
