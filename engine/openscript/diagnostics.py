"""How this engine says something went wrong, and what it refuses to say twice.

Every failure carries a catalogue code, a position and the values the
catalogue's message has placeholders for. Nothing here holds the message text.
That is deliberate and it is the repository's own rule read in this language:
`spec/errors.json` is the catalogue and the authority, the wording is generated
into the first engine rather than retyped in it, and a second engine that typed
the sentences out again would be a second place for them to be wrong. A host
that wants the prose has the catalogue; what the conformance suite compares is
the code, the line, the column and the severity, and those are all here.

The placeholder names are held to the catalogue by a test rather than by
attention: a name this engine invents is a message with a hole in it, and the
hole would only ever be seen by the user it was written for.

**Severity is derived and not copied.** An engine's failure stops something: a
bar, or a load. There is no reading of a compiled program that produces a
warning, because nothing downstream of the engine could act on one, so every
diagnostic raised from here is an error and the constant below says so once. The
same test measures that against the catalogue.

**A failure is thrown rather than returned.** An error in the middle of an
expression has to abandon the rest of the bar, and there is no value a division
by zero could return that every instruction above it would not have to check
again. The throw crosses the interpreter and stops at the one boundary that
knows what to do with it, and nothing this package exposes lets it out: a host
draws many studies in one loop, and one script failing has to be a diagnostic
about that script and nothing else.
"""

from dataclasses import dataclass, field
from typing import Any, Mapping, NamedTuple


class Position(NamedTuple):
    """Where a diagnostic points, as ``debug.pos`` holds it: a line and a column.

    A compiled program carries a position per instruction and not an offset into
    text, because the engine is handed a program and not the source it came
    from. Line and column still say where, which is what a message needs.
    """

    line: int
    column: int


#: What a load-time failure carries. The defect is in the program rather than in
#: the source, so there is no line to name: ``compiled-program.md`` section 10.
NO_POSITION = Position(0, 0)

#: The one severity an engine raises. See the note at the head of this module.
ERROR = "error"


@dataclass(frozen=True)
class Diagnostic:
    """One failure: a code, where it happened, and the message's own values."""

    code: str
    position: Position
    values: Mapping[str, Any] = field(default_factory=dict)
    severity: str = ERROR

    @property
    def line(self) -> int:
        return self.position.line

    @property
    def column(self) -> int:
        return self.position.column


class ScriptError(Exception):
    """A diagnostic on its way out of the machine."""

    def __init__(self, diagnostic: Diagnostic) -> None:
        super().__init__(diagnostic.code)
        self.diagnostic = diagnostic


def failure(code: str, position: Position = NO_POSITION, **values: Any) -> Diagnostic:
    """The diagnostic for a code, with the values its message names."""
    return Diagnostic(code=code, position=position, values=dict(values))


def raise_at(code: str, position: Position = NO_POSITION, **values: Any) -> Any:
    """Throw that diagnostic. Returns nothing: the call never comes back."""
    raise ScriptError(failure(code, position, **values))


def malformed(location: str, reason: str) -> Diagnostic:
    """A verification failure, ``compiled-program.md`` section 3.5.

    One code covers a malformed instruction list, an unreadable encoding and a
    reference naming an input that was never declared, because they are not
    three fixes: all three are defects of the compiler that wrote the program
    and none of them is repairable by hand.
    """
    return failure("OS6018", NO_POSITION, location=location, reason=reason)


def at_instruction(listing: str, index: int) -> str:
    """The location half of OS6018 for an instruction, spelled as 3.5 spells it."""
    return f"instruction {index}" if listing == "code" else f"{listing} instruction {index}"
