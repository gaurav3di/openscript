"""The two version numbers this engine declares, and why they are typed here.

``openscript.format`` versions the compiled program's structure and
``openscript.language`` versions meaning, and section 9.1 says they move at
different speeds for different reasons. An engine declares which majors it can
load and which language versions it has library semantics for, and section 9.4
refuses on both.

**These numbers exist elsewhere and this is the second copy, held by a check.**
The first engine has them generated from the page and from the package manifest,
because a number typed twice is a number that will disagree the day somebody
edits one copy. That generator writes one language's file. A package a host
installs cannot read the specification, which is not shipped with it, so the
numbers have to be in the package, and the honest arrangement is the one the
distribution file next door already uses for the package version: write it, and
have a check fail the build the day it drifts. ``tests/test_version.py`` reads
the sentence out of ``spec/compiled-program.md`` by the same pattern the
generator uses, so the page stays the source and this stays a copy that cannot
go stale quietly.
"""

#: The compiled format this engine implements: the major it loads, and the
#: highest minor of that major it was written against.
FORMAT = "1.1"

#: The language versions this engine has library semantics for.
#:
#: An engine selects semantics by the program's ``language`` and not by the
#: newest it implements, so that a saved script never changes its numbers.
LANGUAGE_VERSIONS = (1,)


def format_major() -> int:
    return int(FORMAT.split(".")[0])


def format_minor() -> int:
    parts = FORMAT.split(".")
    return int(parts[1]) if len(parts) > 1 else 0
