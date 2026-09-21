"""Run the engine's tests, and refuse a run that proved nothing.

Run: python engine/tools/run_tests.py, from anywhere.

The standard library's own runner is the harness, so the tests need no package
installed and no tool downloaded: an interpreter and this file. What it does not
do on its own is the reason this file exists.

**A discovery that found nothing exits zero.** "Ran 0 tests in 0.000s. OK" is
what a runner prints when a directory was renamed, an import failed in a way
that hid the module, or the start directory was wrong, and a gate that reads the
exit code alone calls that a pass. This repository has paid for that exact
failure four times over on the other side of the tree, written up at the top of
``scripts/lib/files.mjs``: a check that silently inspects nothing produces the
evidence of safety without the safety, and it does it at the moment it was most
needed, which is when new code has just arrived.

So the count is a result here, not a line of output. ``refusal`` is the whole
rule and is a plain function of four numbers, which is what lets a test hold it:
a runner whose guard nothing exercises is the same green tick with nobody behind
it.

**Nothing is written to the tree.** Bytecode caching is turned off before the
first test module is imported, so a run leaves no directory behind for the
no-eval check to meet and refuse. That check reads every file this project
holds and a compiled bytecode file is code nobody can read, so it is refused
rather than listed as data.
"""

import sys
import unittest
from pathlib import Path

ENGINE = Path(__file__).resolve().parent.parent
TESTS = ENGINE / "tests"


def count(suite):
    """How many test cases a suite holds, at any depth of nesting."""
    total = 0
    for item in suite:
        total += count(item) if isinstance(item, unittest.TestSuite) else 1
    return total


def refusal(discovered, ran, failures, errors):
    """The sentence this run is refused with, or None if it stands.

    Four numbers rather than a result object, so that a test can put a run that
    never happened through the same rule a real run goes through.
    """
    if discovered == 0:
        return (
            f"no test was discovered under {TESTS.name}/, so this run proved nothing. "
            "A runner that exits zero here is worse than no runner: it is the "
            "evidence of a passing suite with no suite behind it. Either a test "
            "file is misnamed, or the start directory is wrong."
        )
    if ran != discovered:
        return (
            f"{discovered} tests were discovered and {ran} ran. Every discovered "
            "test runs, or this run does not say what it looks like it says."
        )
    if failures > 0 or errors > 0:
        return (
            f"{failures} failure{'' if failures == 1 else 's'} and "
            f"{errors} error{'' if errors == 1 else 's'}."
        )
    return None


def main():
    # Before discovery imports the first test module, so no cache directory is
    # ever written into the tree.
    sys.dont_write_bytecode = True

    # The package under test is this directory's neighbour, and a run is started
    # from wherever the caller happens to be standing.
    root = str(ENGINE)
    if root not in sys.path:
        sys.path.insert(0, root)

    suite = unittest.TestLoader().discover(start_dir=str(TESTS), top_level_dir=root)
    discovered = count(suite)
    result = unittest.TextTestRunner(stream=sys.stdout, verbosity=1).run(suite)

    wrong = refusal(discovered, result.testsRun, len(result.failures), len(result.errors))
    if wrong is not None:
        print(f"The engine's tests did not pass: {wrong}")
        return 1

    skipped = len(result.skipped)
    print(
        f"The engine's tests passed: {discovered} tests under {TESTS.name}/, "
        f"{skipped} of them skipped, on Python "
        f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}. "
        "The count is checked rather than printed: a discovery that found nothing "
        "fails this run instead of passing it."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
