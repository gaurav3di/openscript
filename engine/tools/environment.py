"""Say what this interpreter is, as one JSON object on standard output.

Run: python engine/tools/environment.py

``scripts/check-python.mjs`` reads this before it reads a source file. It needs
two facts and neither of them can be known from outside: which version is about
to run the tests, and which module names this interpreter counts as its own.

The second is the point. The zero dependency rule is checked by comparing every
import in the package against the standard library, and a list of standard
library modules written down in this repository would be a copy of somebody
else's fact: right on the day it was typed, wrong the release after, and wrong
in the direction that lets a dependency through. The interpreter knows its own
namespace, so it is asked, exactly as ``scripts/check-layering.mjs`` asks the
JavaScript runtime for its own.
"""

import json
import sys

print(
    json.dumps(
        {
            "executable": sys.executable,
            "version": [sys.version_info.major, sys.version_info.minor, sys.version_info.micro],
            "standardLibrary": sorted(sys.stdlib_module_names),
        }
    )
)
