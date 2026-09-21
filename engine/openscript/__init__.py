"""The second engine: a compiled program, run in Python.

The package is importable as one name, ``openscript``, and this module is its
door. Nothing is exported from it yet.

What goes where, so that two people filling this in at once do not collide:

- ``__main__.py``     the entry point the conformance adapter starts, as
                      ``python -m openscript``. Empty until the adapter stage.
- the interpreter     the machine of ``spec/compiled-program.md`` sections 2 to
                      11: the program, the registers, the opcodes, per-bar
                      execution, state and rollback, warmup and the absent
                      value. Written by the interpreter stage.
- the library         the functions of ``spec/stdlib.md``, each accumulating in
                      the order that page fixes. Written by the library stage.

Two rules that are not this file's to relax, both from ``CLAUDE.md``:

Nothing here builds code out of text. No string evaluator, no statement
executor, no compiler, no import by a name computed at run time, no object
graph loaded out of bytes. The compiled program is data, and an engine that
reads data is why a host can run many people's scripts in one process.

Nothing here imports anything but the standard library.
"""
