"""Say what this engine's manifest holds, as one JSON list on standard output.

Run: python engine/tools/manifest.py

``scripts/check-manifests.mjs`` reads this beside the first engine's library.
The two engines are held to the same compiled program, and a call one of them
holds and the other does not is a program one runs and the other refuses at load
with OS6004. Issue 0020 found two such families only because a case happened to
reach them; this is asked on every build instead.

The manifest is the one a conformance run uses, with a position book, because
that is the widest this engine serves: a run without one serves no ``pos`` fact
and no order call, which is a narrowing of the host's and not of the engine's.
"""

import json
import sys
from pathlib import Path

ENGINE = Path(__file__).resolve().parent.parent


def main():
    sys.dont_write_bytecode = True
    if str(ENGINE) not in sys.path:
        sys.path.insert(0, str(ENGINE))
    from openscript.adapter.ordering import Desk
    from openscript.adapter.serving import Serving

    held = Serving(Desk(())).manifest()
    print(json.dumps([f"{name}/{arity}" for name, arity in held]))


if __name__ == "__main__":
    main()
