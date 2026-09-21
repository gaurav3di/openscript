"""The conformance adapter: one case in, one JSON object out.

``spec/conformance.md`` section 9 is the whole specification of what is here, and
``__main__.py`` next door is the command line that starts it. This package is the
door and holds nothing of its own.

What goes where:

- ``page``          what the conformance page fixes, held to it by a test
- ``spellings``     how a value is written in a case file and in a report
- ``reading``       one case directory, by the names section 2's table gives it
- ``expectations``  what the case's own files expect, as channels
- ``serving``       the seam between the library's entries and the machine
- ``running``       the engine's answer for one case, with no comparison made
- ``matching``      the comparison of section 6, and the caps it is held to
- ``answers``       the three invocations, each to the object it writes

**Nothing here decides what this engine can do.** The engine refuses what it
cannot serve, by name, at load; ``running`` turns that refusal into the
``unsupported`` outcome. A list of unsupported features kept in the adapter would
say what somebody believed, and would go on saying it after the engine grew the
feature.
"""

from .answers import answer_for, describe, invoke, result_for

__all__ = ["answer_for", "describe", "invoke", "result_for"]
