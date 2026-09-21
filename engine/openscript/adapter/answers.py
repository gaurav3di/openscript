"""The three objects ``conformance.md`` section 9 says an adapter writes.

    adapter --describe                  the engine's identity
    adapter <case-directory>            one case result
    adapter --actual <case-directory>   the channels the case asserts, no comparison

The third exists so that two engines can be compared with each other rather than
each with an expected file: a case result carries an outcome and a first
difference rather than the values, so two adapters reporting ``pass`` prove only
that both matched a file, which section 10 says is not enough. In that mode this
adapter makes no comparison, reads no tolerance and reports no outcome.

**This engine implements no compiler, and the program arrives compiled.** Section
1 covers it: "An implementation that only has an engine (it reads compiled
programs produced elsewhere) runs the engine half and says so". So the compiled
program is handed to this process, as the canonical text a host sends it in
production, and the invocation that carries it is described in ``__main__.py``.
Two consequences are reported rather than hidden. A case whose assertion is the
compiler's own diagnostics is ``unsupported``, because those diagnostics are not
this engine's to claim. And the text goes in through ``load_text``, so the
canonicity check at the text boundary is exercised on every case rather than
skipped by handing the engine an object.

**The profile claimed is the page's lowest**, and every case this engine cannot
run is named on the case with the ``unsupported`` outcome. Section 8 offers
``engine-only`` for an implementation with no compiler and the runner's own
vocabulary is the profile table, which does not list it, so the identity carries
both: the profile the table names, and the flag that says what section 8 would
have it say. The stage's report records that as a defect of the page rather than
leaving it to be discovered.
"""

import json
import sys
import tomllib
from pathlib import Path
from typing import Any, Dict, Optional

from ..version import FORMAT, LANGUAGE_VERSIONS
from .expectations import expected_channels
from .matching import compare_channels, tolerance_from
from .page import PROFILES
from .reading import read_case
from .running import run_case
from .spellings import Malformed

#: The distribution file beside the package, which states the version once.
_PROJECT = "pyproject.toml"

#: Section 8: what this implementation claims. The lowest profile of the table,
#: because a case inside a higher one is one it would report unsupported.
PROFILE = PROFILES[0]


def _distribution() -> Dict[str, Any]:
    """``pyproject.toml``, read from beside the package, or a refusal saying so.

    The version is a fact of the release and is written in the distribution
    file; ``scripts/check-python.mjs`` already holds that file and the package
    manifest equal, so reading it here adds no third copy. An installed package
    that does not carry the file cannot prove its version, and an identity with
    an invented version in it is worse than an adapter that says which file it
    could not find.
    """
    path = Path(__file__).resolve().parent.parent.parent / _PROJECT
    try:
        with path.open("rb") as file:
            return tomllib.load(file)["project"]
    except (OSError, KeyError, ValueError) as reason:
        raise Malformed(
            f"{path} could not be read, and section 9 has an adapter answer with the engine's own "
            f"name and version: {reason}"
        ) from None


def describe() -> Dict[str, Any]:
    """The identity section 9's table asks for, and the one flag section 8 adds."""
    project = _distribution()
    return {
        "name": project["name"],
        "version": project["version"],
        "profile": PROFILE,
        "languageVersions": list(LANGUAGE_VERSIONS),
        # The compiled program format this engine implements
        # (``compiled-program.md`` section 9). Section 9 of the conformance page
        # names the field and fixes no meaning for it.
        "schemaVersion": FORMAT,
        # Section 8: an implementation that runs compiled programs and implements
        # no compiler reports engine-only, and its report says so.
        "engineOnly": True,
    }


def _program_from(envelope: Any) -> Any:
    """The compiled program the invocation carried, or what it carried instead."""
    if not isinstance(envelope, dict):
        raise Malformed(
            "this adapter is handed the compiled program on standard input, as one JSON object, "
            "and nothing readable arrived"
        )
    held = envelope.get("program")
    if isinstance(held, str):
        return held
    if "diagnostics" in envelope:
        return None
    raise Malformed(
        f"the invocation carried neither a program nor the diagnostics of a compile: "
        f"{sorted(envelope)}"
    )


def answer_for(directory: str, envelope: Any) -> Dict[str, Any]:
    """``--actual``: what this engine computed, and what it could not compute.

    ``{id, channels, unsupported}``, or ``{id, error}`` for a case that cannot be
    run at all. No comparison is made and no tolerance is read.
    """
    try:
        case = read_case(directory)
    except Malformed as reason:
        return {"id": None, "error": str(reason)}
    try:
        program = _program_from(envelope)
        if program is None:
            return {
                "id": case.identity,
                "channels": {},
                "unsupported": [
                    "the compiler (section 1): the case's script did not compile, this engine "
                    "implements none, and a diagnostic another compiler raised is not this "
                    "engine's to assert"
                ],
            }
        found = run_case(case, program)
    except Malformed as reason:
        return {"id": case.identity, "error": str(reason)}
    return {
        "id": case.identity,
        "channels": found.channels,
        "unsupported": found.unsupported,
        "columnTypes": found.column_types,
    }


def result_for(directory: str, envelope: Any) -> Dict[str, Any]:
    """The plain invocation: the answer above, compared with the case's own files.

    One of section 9's outcomes, with the first difference on a failure. A case
    this engine cannot run is ``unsupported`` with the feature named, which
    section 9 says is neither a pass nor a failure and is counted separately.
    """
    try:
        case = read_case(directory)
    except Malformed as reason:
        return {"id": None, "outcome": "error", "reason": str(reason)}
    answer = answer_for(directory, envelope)
    if "error" in answer:
        return {"id": answer["id"], "outcome": "error", "reason": answer["error"]}
    if answer["unsupported"]:
        return {
            "id": answer["id"],
            "outcome": "unsupported",
            "feature": "; ".join(answer["unsupported"]),
        }
    tolerance, refused = tolerance_from(case.declared.get("tolerance"))
    if tolerance is None:
        return {"id": case.identity, "outcome": "error", "reason": f"case.json: {refused}"}
    expected, missing = expected_channels(case, answer["columnTypes"])
    if expected is None:
        return {"id": case.identity, "outcome": "error", "reason": missing}
    compared = compare_channels(case.asserts, answer["channels"], expected, tolerance)
    return {"id": case.identity, **compared}


def read_envelope(text: str) -> Any:
    """The JSON object the invocation carried, or a refusal naming what arrived."""
    try:
        return json.loads(text) if text.strip() != "" else {}
    except ValueError as reason:
        raise Malformed(f"the invocation's standard input is not JSON: {reason}") from None


def stdin_text() -> str:
    """Everything the caller wrote, as text. Empty when nothing was piped in."""
    if sys.stdin is None or sys.stdin.isatty():
        return ""
    return sys.stdin.read()


def invoke(arguments: Any) -> Optional[Dict[str, Any]]:
    """One of the three invocations, to the one object it writes, or nothing.

    Nothing means the argument list is not one of the three, which
    ``__main__.py`` refuses with a non-zero exit: no object it could write would
    be a case result, and section 9 keeps a non-zero exit meaning a crash.
    """
    if list(arguments) == ["--describe"]:
        return describe()
    if len(arguments) == 2 and arguments[0] == "--actual":
        return answer_for(arguments[1], read_envelope(stdin_text()))
    if len(arguments) == 1 and not arguments[0].startswith("--"):
        return result_for(arguments[0], read_envelope(stdin_text()))
    return None
