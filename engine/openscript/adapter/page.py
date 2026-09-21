"""What ``spec/conformance.md`` fixes, carried here because the engine reads no page.

Every value below is printed in that document, and a copy is a fact stated twice
unless something holds the two equal. So the arrangement is the one section 6
already uses for the tolerance caps, in the page's own words: the figures "are
read out of this section by a test and held to the constants the projection
carries, because the engine reads no page". ``tests/test_adapter_page.py`` is
that test here. It reads the document and fails the build the day a value below
stops being the page's.

The reason the constants are not simply read at run time is the same reason
``version.py`` next door carries two numbers rather than reading them: a package
a host installs does not carry the specification, and an adapter that could only
answer with the repository beside it would be an adapter nobody outside this
tree could run.

Nothing here is a default this file chose. Section 3's instrument block is that
section's, "chosen to be boring rather than realistic"; the channels are section
2's ``asserts`` vocabulary; the outcomes and the profiles are sections 9 and 8.
"""

from typing import Any, Dict, Tuple

#: Section 2: the file names a case directory may hold. A file the table does
#: not name is not input, so a directory holding one is malformed rather than
#: read past.
CASE_FILES: Tuple[str, ...] = (
    "case.json",
    "script.os",
    "bars.csv",
    "expected.csv",
    "expected.json",
    "instrument.json",
    "settings.json",
    "backtest.json",
    "ticks.csv",
    "frames.csv",
    "notes.md",
)

#: The one row of that table written with a name in it: a secondary series, one
#: file per series the script asks for.
SECONDARY_PREFIX = "bars."
SECONDARY_SUFFIX = ".csv"

#: Section 2: the channels a case may assert. A case asserts the ones it names
#: and no others, which is what keeps a change to one output from failing a case
#: about something else.
CHANNELS: Tuple[str, ...] = (
    "diagnostics",
    "values",
    "markers",
    "fills",
    "levels",
    "barColors",
    "background",
    "table",
    "drawings",
    "alerts",
    "orders",
    "trades",
    "performance",
    "log",
)

#: Section 9: the outcomes a case result may carry. The runner refuses one this
#: list does not name, and so does this adapter's own test.
OUTCOMES: Tuple[str, ...] = ("pass", "fail", "nonFinite", "error", "unsupported", "skipped")

#: Section 8: the profiles, in the order they include one another.
PROFILES: Tuple[str, ...] = ("core", "chart", "strategy")

#: Section 3: the header of ``bars.csv``, in this order. An extra column is an
#: error rather than ignored, so a typo in a header cannot drop an input.
BARS_HEADER: Tuple[str, ...] = ("time", "open", "high", "low", "close", "volume")

#: Section 3: the fields of one row of ``frames.csv``, the last three optional
#: and dropped from the right, so a header the page allows is a prefix of this.
FRAMES_HEADER: Tuple[str, ...] = (
    "afterBar",
    "intent",
    "status",
    "filledQty",
    "avgFillPrice",
    "orderRef",
    "text",
    "time",
)

#: Section 4: how an absent value is written in a case file, in every column of
#: every one of them.
ABSENT_TEXT = "none"

#: Section 6: the loosest tolerance that is still a conformance case. A case
#: past either bound is reported ``error`` rather than run.
TOLERANCE_CAP_ABS = 1e-12
TOLERANCE_CAP_REL = 1e-9

#: Section 3: the instrument facts a case that states no ``instrument.json``
#: runs under.
DEFAULT_INSTRUMENT: Dict[str, Any] = {
    "symbol": "TEST",
    "exchange": "TEST",
    "interval": "60",
    "timezone": "UTC",
    "tickSize": 0.01,
    "lotSize": 1,
    "hasVolume": True,
    "session": {"start": "00:00", "end": "24:00", "days": [1, 2, 3, 4, 5, 6, 7]},
}

#: Section 3: the fields of ``backtest.json``, all three always stated.
BACKTEST_FIELDS: Tuple[str, ...] = ("digits", "costs", "range")


def is_case_file(name: str) -> bool:
    """Whether section 2's table names this file, including a secondary series."""
    if name in CASE_FILES:
        return True
    return (
        name.startswith(SECONDARY_PREFIX)
        and name.endswith(SECONDARY_SUFFIX)
        and len(name) > len(SECONDARY_PREFIX) + len(SECONDARY_SUFFIX)
        and name != "bars.csv"
    )


def is_secondary(name: str) -> bool:
    """Whether this file is a secondary series rather than the case's own bars."""
    return name != "bars.csv" and is_case_file(name) and name.startswith(SECONDARY_PREFIX)
