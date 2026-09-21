"""The entry point the conformance adapter starts: ``python -m openscript``.

Empty on purpose. The adapter stage fills it, and until then running it does
nothing and says nothing, which is better than a stub that answers an
invocation with a shape somebody might start depending on.

What it will answer is already fixed by ``spec/conformance.md`` section 9 and by
``docs/integrating/running-the-suite.md``: the three invocations an adapter
takes, each one JSON object on standard output. The adapter itself is a small
JavaScript file, because the suite's runner starts every adapter with the
runtime it runs on itself; that file starts this module and relays what it
writes.
"""
