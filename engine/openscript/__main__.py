"""The entry point the conformance adapter starts: ``python -m openscript``.

``spec/conformance.md`` section 9 gives an adapter three invocations, each
writing one JSON object to standard output and exiting 0, and this module is the
command line half of all three. Everything about what the engine answers is next
door in ``adapter/``.

    python -m openscript --describe
    python -m openscript <case-directory>
    python -m openscript --actual <case-directory>

**The compiled program arrives on standard input**, as one JSON object holding
the canonical text of the program under ``program``, or holding ``diagnostics``
when the case's script did not compile. This engine implements no compiler, which
section 1 provides for: an implementation that only has an engine reads compiled
programs produced elsewhere, runs the engine half and says so. The text goes to
``load_text`` rather than to a parsed object, because canonical bytes are what a
host sends in production and the hash it records a run against is taken over
them.

**Why it exits 0 on a failing case.** Section 9 puts the outcome inside the
object, and the runner holds the clock and the child process, so a non-zero exit
is the one thing left to mean a crash. An invocation that is not one of the three
is refused with a non-zero exit, because nothing it could write would be a case
result.

**The output is the canonical encoding**, written by the same writer the compiled
program's text boundary uses. One writer means a number in a report is spelled
the way a number in a program is, which is ``language.md`` section 5.5 in both
places rather than the interpreter's own rendering in one of them.
"""

import sys

from .adapter.answers import invoke
from .adapter.spellings import Malformed
from .canonical import canonicalise

_USAGE = (
    "Usage: python -m openscript --describe | <case-directory> | --actual <case-directory>\n"
    "conformance.md section 9 gives an adapter these three invocations and no other.\n"
    "A case invocation is handed the compiled program on standard input, as one JSON\n"
    "object holding the canonical program text under program, because this engine\n"
    "implements no compiler and reads programs produced elsewhere (section 1)."
)


def main(arguments) -> int:
    try:
        answered = invoke(arguments)
    except Malformed as reason:
        sys.stderr.write(f"{reason}\n")
        return 1
    if answered is None:
        sys.stderr.write(f"{_USAGE}\n")
        return 1
    sys.stdout.write(f"{canonicalise(answered)}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
