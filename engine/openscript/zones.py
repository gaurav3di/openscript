"""Reading an instant in a named zone, and the one zone this engine can read.

`stdlib.md` section 12.1 fixes what a zone is: an IANA name, never a fixed
offset, because an offset held constant is silently wrong for half the year
anywhere that observes a seasonal clock change and nothing about the wrong half
looks wrong. Section 12.2 adds that the name is resolved against the host
runtime's own timezone database, that two engines agree as far as their databases
do, and that a name a database does not hold is OS6005 and never a guessed
offset.

**This engine holds one zone and declines the rest, and the reason is the
dependency rule rather than the calendar.** What the standard library can answer
is set out here rather than discovered by whoever meets it:

- The civil arithmetic needs nothing installed. ``civil.py`` is the proleptic
  Gregorian formula, so ``UTC`` is exact on every machine and for every instant,
  including the ones an interpreter's own date type refuses.
- The offsets do not come with the interpreter. The module that reads named
  zones is in the standard library, but the table it reads is not: it looks for a
  database the operating system ships, and where there is none it falls back to a
  separately installed package of the same data. On the machine this stage was
  written on, that search path is empty and the fallback package is what answers,
  so an engine built on it would have taken a dependency the host never accepted,
  and ``scripts/check-python.mjs`` could not have caught it: the check reads
  import names against the interpreter's own list, and the import that resolves
  a zone is one of the interpreter's own. It is the data behind it that is not.
- The consequence is worse than the dependency. `conformance.md` section 5
  requires a case to produce the same result on every machine and to read nothing
  outside the case directory, environment variables included, and that module
  consults an environment variable for its search path. A run that answered a
  session in one zone on a build machine and declined it on a laptop would be
  reproducible on neither.

So a zone that is not ``UTC`` is not answered here under a guessed offset and not
answered from a table this repository copied, which would be the same staleness a
fixed offset has. It is declined, and the caller reports the case
``unsupported`` naming the feature, which `conformance.md` section 8 defines and
counts separately from a pass. A host whose instruments trade in another zone
supplies the reader, which is the same footing `stdlib.md` section 12.2 puts every
engine on: the database is the host runtime's.

**The shape of the name is checked before any database is.** Section 12.2
requires it: "an engine applies this rule before it consults one: a script
refused on one engine has to be refused on every engine, and an abbreviation is
ambiguous in any case". So a name that is neither an area and a location nor
``UTC`` is malformed on every engine, whatever any database would have said about
it, and that is a different answer from a well formed name this engine cannot
read. The two are told apart below because only one of them is this engine's
limit.
"""

import re
from typing import Optional

from .civil import MAX_INSTANT, Civil, fields_at, instant_at, whole_instant

#: The one name with no area, which names one offset everywhere and is the whole
#: of what this engine's own calendar is right for.
READABLE = "UTC"

#: An area and a location, section 12.2's rule, applied before any database is.
_AREA_AND_LOCATION = re.compile(r"^[A-Za-z][A-Za-z0-9+_-]*/[A-Za-z][A-Za-z0-9+_/-]*$")


def named(zone: object) -> bool:
    """Whether this is a zone name at all, as against an abbreviation or an offset.

    ``"UTC"`` or an area and a location. A name that fails this is one every
    engine refuses, and refusing it is OS6005's own sentence rather than a
    limit of this engine's calendar.
    """
    if not isinstance(zone, str):
        return False
    return zone == READABLE or _AREA_AND_LOCATION.match(zone) is not None


def readable(zone: object) -> bool:
    """Whether this engine can read a calendar in this zone.

    True of one name. A well formed name this answers false to is not a bad
    name: it is a zone whose offsets this engine does not hold, which is the
    caller's ``unsupported`` and never an answer under another zone's clock.
    """
    return zone == READABLE


def fields_in(instant: float, zone: object) -> Optional[Civil]:
    """The civil fields an instant has in a zone, or nothing where there are none.

    Three ways to have none, and they are one answer here because the calls above
    make one of them: a zone this engine does not read, a timestamp that is not a
    number, and a magnitude past the largest instant a calendar reads.
    """
    if not readable(zone):
        return None
    if not isinstance(instant, (int, float)) or isinstance(instant, bool):
        return None
    whole = whole_instant(float(instant))
    return None if whole is None else fields_at(whole)


def instant_of(fields: Civil, zone: object) -> Optional[int]:
    """The instant a wall clock reading names in a zone, or nothing for no reading.

    In ``UTC`` a reading names exactly one instant, so the two readings section
    12.2 settles for a zone that changes its clock do not arise: there is no hour
    this zone skips and none it repeats. A zone that has them is one this engine
    declines above, which is why that rule is stated there and the arithmetic is
    not written here to be exercised by nothing.
    """
    if not readable(zone):
        return None
    found = instant_at(fields)
    # Compared as it is rather than as a binary64: a year a script computed can
    # be an integer with three hundred digits in it, and converting one of those
    # to a float raises where the first engine answers absence. Nothing in this
    # package raises, so the magnitude is compared and the answer is absence.
    return None if abs(found) > MAX_INSTANT else found
