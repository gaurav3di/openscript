"""The sentences ``req.error`` hands a script, which are values and not diagnostics.

``diagnostics.py`` carries no message text, and says why: a diagnostic is a code,
a position and the values its message names, and a host that wants the prose
has the catalogue. That reasoning stops at the one place the prose is not for a
host. `stdlib.md` 15.5 and `host-interface.md` 5.4 put the reason a read failed
into ``req.error(read)``, a ``series string`` a script can test, print and
compare, and the first engine answers it with the catalogue's own message
filled in. A value two engines compute differently is a disagreement on every
case that reads it, so this engine hands over the same sentence.

**Six templates are carried, and a test holds each to the catalogue.** They are
copied from ``spec/errors.json`` rather than read from it at run time, for the
reason ``version.py`` and ``adapter/page.py`` give for their own constants: a
package a host installs does not carry the specification. What stops a copy
from drifting is ``tests/test_request_reasons.py``, which reads the catalogue
and fails the build the day one of these stops being its message, and which
also fails on a request code a refusal can carry and this table does not hold.

**A slot is filled the way the first engine fills one**: a name that is an
identifier, in braces, replaced by the value it was given, and a slot with no
value left written out rather than blanked. The values here are always strings,
so no number is ever spelled on this path.
"""

import re
from typing import Mapping

#: The messages of the codes a failed read can carry, as ``spec/errors.json``
#: writes them. OS6012 is the engine's own, for a calendar read with no zone to
#: date it in; the other five are what a host may answer (``host-interface.md``
#: 5.4), with OS6009 standing for any refusal that is not one of the four.
TEMPLATES: Mapping[str, str] = {
    "OS6007": "The host does not know {symbol} on {exchange}.",
    "OS6008": "{symbol} at {timeframe} returned no bars over the range this chart covers.",
    "OS6009": "The host could not fetch {symbol} at {timeframe}: {reason}.",
    "OS6012": "The host did not supply {fact} for {symbol}.",
    "OS6014": "The host has no {timeframe} data for {symbol}; it offers {available}.",
    "OS6015": "{requested} is not a whole multiple of {chart}.",
}

#: A slot, in the one syntax the catalogue declares. An identifier only, so a
#: brace in a message that is not a slot is left alone.
_SLOT = re.compile(r"\{([A-Za-z][A-Za-z0-9_]*)\}")


def reason(code: str, **values: str) -> str:
    """The catalogue's message for a code, with its slots filled."""
    return _SLOT.sub(lambda found: values.get(found.group(1), found.group(0)), TEMPLATES[code])
