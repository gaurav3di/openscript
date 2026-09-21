"""The second engine: a compiled program, run in Python.

The package is importable as one name, ``openscript``, and this module is its
door. Nothing is exported through it: every caller, inside this package and
outside it, names the module it wants, so the import that reaches a rule says
where that rule lives.

What is where, for somebody reading this engine rather than running it:

- ``__main__.py``     the entry point the conformance adapter starts, as
                      ``python -m openscript``, which is the command line half
                      of the three invocations ``spec/conformance.md`` section
                      9 gives an adapter.
- the modules beside  the machine of ``spec/compiled-program.md`` sections 2 to
  this one            11: the program read as data, the instruction set, the
                      memory regions and their lifetimes, the values, the bars,
                      the inputs, the verification done before the first bar,
                      the execution budget, the canonical encoding, the
                      diagnostics and the two version numbers.
- ``library/``        the functions of ``spec/stdlib.md``, each accumulating in
                      the order that page fixes, in the two halves that page
                      divides them into: the calls that remember nothing and
                      the calls that carry state from bar to bar.
- ``strategy/``       what a strategy decided and what came back: the order
                      calls, the intents a bar leaves behind, the frames a host
                      folds in and the ledger of ``stdlib.md`` section 17.
- ``accounting/``     what those fills came to: the charges, the trades, the
                      equity a report is marked on, and the summary.
- ``adapter/``        one conformance case, read from its files, run, and
                      answered channel by channel.

Two rules that are not this file's to relax, both from ``CLAUDE.md``:

Nothing here builds code out of text. No string evaluator, no statement
executor, no compiler, no import by a name computed at run time, no object
graph loaded out of bytes. The compiled program is data, and an engine that
reads data is why a host can run many people's scripts in one process.

Nothing here imports anything but the standard library.
"""
