"""Load-time verification, section 3.5, and the refusals a host makes beside it.

Before executing a single bar an engine must verify the program. What is bought
by doing it here rather than discovering a problem halfway through a bar is
stated in the specification and is the reason the interpreter next door is as
plain as it is: a verified program cannot underflow the stack, cannot jump out
of bounds, cannot address a slot that does not exist and cannot loop without
charging the budget. Every remaining failure is a script error with a source
position, which is the only kind of failure a user should ever see.

Three refusals that are not verification sit here too, because they happen at
the same moment and for the same reason: a version this engine does not
implement (OS6016, OS6017), a capability it does not have (OS6006) and a library
entry that disagrees with its manifest (OS6004). The fourth, the budgets a host
is willing to spend, is ``budget.py``: that is a question about this host rather
than about this program, and two hosts may honestly answer it differently.

**The order of those refusals is the specification's, 9.4, and not an accident
of where the code grew.** It is an ordered list that stops at the first failure,
so a program that is wrong in two ways reports the one the list reaches first,
and two engines hand the same program the same message. Each step below says
which number it is.
"""

from dataclasses import dataclass
from typing import Any, Dict, Optional, Sequence, Tuple

from .budget import EngineLimits, all_code, check_budgets
from .contracts import Library, NoLibrary
from .diagnostics import Diagnostic, failure, malformed
from .verify_code import ListLimits, check_list, check_once, missing_tag
from .verify_shape import ShapeCheck
from .verify_tables import check_tables
from .version import FORMAT, LANGUAGE_VERSIONS, format_major

#: What this engine can do on its own, as the tags of section 2.2.
#:
#: Six of the ten, the five that are the machine's and ``req.timeframe``: a read
#: of the chart's own instrument at a coarser interval is folded from the bars a
#: run is handed (``requests.py``), so there is nothing for a host to supply and
#: nothing for it to decline. The others are not refusals of this module's
#: making: ``orders`` needs an order route and a ledger, ``objects`` and
#: ``tables`` need the library calls that build one, and ``req.symbol`` needs
#: bars for another instrument, which a run serves only when it is handed a
#: provider to ask (``run.load``). Each is added by the stage that serves it, so
#: a program that needs one is refused at load naming the feature rather than
#: drawing a study with a silently empty line through it.
MACHINE_CAPABILITIES: Tuple[str, ...] = ("core.1", "arrays", "functions", "loops", "alerts", "req.timeframe")

#: The tag a read of another instrument declares, served with a provider only.
REQ_SYMBOL = "req.symbol"


def capabilities(*served: str) -> Tuple[str, ...]:
    """The machine's tags, plus whatever the stages wired in this run serve."""
    return MACHINE_CAPABILITIES + tuple(tag for tag in served if tag not in MACHINE_CAPABILITIES)


@dataclass(frozen=True)
class VerifyOptions:
    capabilities: Sequence[str] = MACHINE_CAPABILITIES
    limits: EngineLimits = EngineLimits()
    library: Library = NoLibrary()


@dataclass(frozen=True)
class VerifyResult:
    program: Optional[Dict[str, Any]]
    diagnostic: Optional[Diagnostic]

    @property
    def ok(self) -> bool:
        return self.diagnostic is None


def _major_of(version: str) -> Optional[int]:
    parts = version.split(".")
    if not parts or not all(part.isdigit() for part in parts):
        return None
    return int(parts[0])


def verify(raw: Any, options: VerifyOptions = VerifyOptions()) -> VerifyResult:
    """Steps 2 to 8 of section 9.4, stopping at the first failure."""
    shape = ShapeCheck()

    def broken() -> VerifyResult:
        found = shape.problem()
        if found is None:
            found = malformed("the program", "it is not a compiled program")
        return VerifyResult(None, found)

    def refused(diagnostic: Diagnostic) -> VerifyResult:
        return VerifyResult(None, diagnostic)

    if not shape.object(raw, "the program"):
        return broken()
    version = raw.get("openscript")
    if not shape.object(version, "openscript"):
        return broken()
    if not shape.string(version.get("format"), "openscript.format"):
        return broken()
    if not shape.whole(version.get("language"), "openscript.language"):
        return broken()

    # Steps 2 and 3: the major decides, and a minor in either direction loads.
    major = _major_of(version["format"])
    if major is None:
        shape.fail("openscript.format", "a version of the form major.minor was required")
        return broken()
    if major != format_major():
        return refused(failure("OS6016", found=version["format"], max=FORMAT))

    # Step 1's other half: the tables every later step indexes into.
    if not check_tables(shape, raw):
        return broken()

    # Step 4, and it comes before the language version on purpose: a program
    # that is both compiled from a language this engine lacks and dependent on a
    # capability it lacks reports the capability, which names the feature that
    # was refused rather than a number the reader has to look up.
    for tag in raw["requires"]:
        if not isinstance(tag, str):
            return VerifyResult(None, malformed("requires", "a capability tag is a string"))
        if tag not in options.capabilities:
            return refused(failure("OS6006", tag=tag))

    # Step 5.
    language = raw["openscript"]["language"]
    if language not in LANGUAGE_VERSIONS:
        return refused(
            failure(
                "OS6017",
                found=language,
                versions=", ".join(str(one) for one in LANGUAGE_VERSIONS),
            )
        )

    # Step 6.
    disagreement = _check_library(raw, options.library)
    if disagreement is not None:
        return refused(disagreement)

    # Step 7.
    over = check_budgets(raw, options.limits)
    if over is not None:
        return refused(over)

    # Step 8, which is section 3.5 itself.
    sizes = _table_sizes(raw)
    if not check_list(shape, "code", raw["code"], sizes, "HALT"):
        return broken()
    for at in range(len(raw["functions"])):
        body = raw["functions"][at]["code"]
        if not check_list(shape, f"functions[{at}]", body, _body_sizes(sizes, raw, at), "RET"):
            return broken()
    if not check_once(shape, raw["code"], [one["once"] for one in raw["channels"]]):
        return broken()
    # 2.16.1: a read's body is an instruction list the same machine walks, so it
    # gets the same walk. Its terminator is RET rather than HALT, because a body
    # produces a value and HALT does not.
    if not _check_bodies(shape, "requests", raw["requests"], sizes):
        return broken()

    # Check 8, the program's half: an instruction whose tag it never declared.
    missing = missing_tag(all_code(raw), raw["requires"])
    if missing is not None:
        return refused(
            failure(
                "OS6018",
                location="requires",
                reason=f"the program uses {missing['opcode']} and does not declare {missing['tag']}",
            )
        )

    return VerifyResult(raw, None)


def _check_library(raw: Any, library: Library) -> Optional[Diagnostic]:
    """Check 9: every ``lib.functions`` entry agrees with this engine's manifest.

    This catches a program compiled against a newer library before it computes a
    single wrong number, which is why the entries carry facts the engine already
    knows: they are there to be disagreed with.
    """
    for at, entry in enumerate(raw["lib"]["functions"]):
        mine = library.entry(entry["name"], entry["arity"])
        if mine is None:
            return failure(
                "OS6004",
                index=at,
                name=entry["name"],
                arity=entry["arity"],
                manifest=library.describe(entry["name"]),
            )
        if mine.state != entry["state"] or mine.effect != entry["effect"]:
            held = f"{entry['name']} holding state {mine.state} with effect {mine.effect}"
            return failure(
                "OS6004", index=at, name=entry["name"], arity=entry["arity"], manifest=held
            )
    return None


def _argc_reader(sites: Sequence[Any]):
    def argc_of(site: int) -> int:
        return sites[site]["argc"] if 0 <= site < len(sites) else 0

    return argc_of


def _table_sizes(raw: Any) -> ListLimits:
    return ListLimits(
        slots=raw["frame"]["slots"],
        cells=len(raw["cells"]),
        states=len(raw["states"]),
        registers=len(raw["series"]),
        channels=len(raw["channels"]),
        libFunctions=len(raw["lib"]["functions"]),
        callSites=len(raw["callSites"]),
        loops=len(raw["loops"]),
        consts=len(raw["consts"]),
        bindings=0,
        argc_of=_argc_reader(raw["callSites"]),
    )


def _bindings_for(sites: Sequence[Any], fn: int) -> int:
    """How many series bindings a ``HISTP`` inside this function body may index.

    Every site that calls the function has to bind the same number, because the
    operand is fixed in the body, so the smallest binding list is the one that
    decides what is in range.
    """
    found = 0
    for site in sites:
        if site["fn"] != fn:
            continue
        found = len(site["series"]) if found == 0 else min(found, len(site["series"]))
    return found


def _with(sizes: ListLimits, **changed: Any) -> ListLimits:
    fields = dict(
        slots=sizes.slots,
        cells=sizes.cells,
        states=sizes.states,
        registers=sizes.registers,
        channels=sizes.channels,
        libFunctions=sizes.libFunctions,
        callSites=sizes.callSites,
        loops=sizes.loops,
        consts=sizes.consts,
        bindings=sizes.bindings,
        argc_of=sizes.argc_of,
    )
    fields.update(changed)
    return ListLimits(**fields)


def _body_sizes(base: ListLimits, raw: Any, fn: int) -> ListLimits:
    return _with(
        base,
        slots=raw["functions"][fn]["slots"],
        bindings=_bindings_for(raw["callSites"], fn),
    )


def _check_bodies(
    shape: ShapeCheck, prefix: str, requests: Sequence[Any], outer: ListLimits
) -> bool:
    """Check 8 over every read's body, and every read written inside one.

    The body's tables are its own and counted from zero, so the sizes are rebuilt
    for each of them; ``consts`` and ``lib.functions`` stay the program's,
    because those are the two a body shares. ``channels`` is zero, which is what
    refuses an ``EMIT`` inside a body without a rule of its own: a read carries
    no channel, no plot and no declaration.
    """
    for at, request in enumerate(requests):
        body = request["body"]
        where = f"{prefix}[{at}].body"
        sizes = _with(
            outer,
            slots=body["frame"]["slots"],
            cells=len(body["cells"]),
            states=len(body["states"]),
            registers=len(body["series"]),
            channels=0,
            callSites=len(body["callSites"]),
            loops=len(body["loops"]),
            bindings=0,
            argc_of=_argc_reader(body["callSites"]),
        )
        if not check_list(shape, f"{where}.code", body["code"], sizes, "RET"):
            return False
        for which in range(len(body["functions"])):
            one = body["functions"][which]
            inner = _with(
                sizes,
                slots=one["slots"],
                bindings=_bindings_for(body["callSites"], which),
            )
            if not check_list(shape, f"{where}.functions[{which}]", one["code"], inner, "RET"):
                return False
        if not _check_bodies(shape, f"{where}.requests", body["requests"], sizes):
            return False
    return True
