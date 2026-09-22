# openscript

The engine that runs a compiled OpenScript program, in Python.

OpenScript is an open trading language. A script is compiled to a **compiled
program**: plain data, an instruction list, never generated code. This package
runs one.

It exists so that a platform can run a strategy where a JavaScript runtime is
not available, which for a production trading server is the ordinary case. The
compiler and the first engine are the `openalgo-script` package on npm; this is
the second engine, and the two are held to each other by a conformance suite
where any disagreement is a release blocker.

## What it is

- **No compiler.** This package is handed a compiled program and never a script.
  The program arrives as canonical text, which is what a run's hash is taken
  over, so an engine cannot quietly run something other than what was recorded.
- **Nothing builds code out of text.** No string evaluator, no statement
  executor, no import driven by hand, no object graph loaded out of bytes. That
  is what lets a platform run many people's scripts in one process, and it is
  enforced by a check rather than intended.
- **Zero dependencies.** The standard library only, and not the parts of it that
  stop a run being reproducible. Measured on every build against the module
  names the running interpreter says are its own.

## Installing

```
pip install openscript
```

Python 3.12 or newer. Nothing else.

## Using it

```python
from openscript.run import load_text

loaded = load_text(program_text, settings, library)
if loaded.ok:
    result = loaded.run.execute_bar(0, bar)
```

A host loads a program once and pushes bars at it one at a time, keeping a
checkpoint so a bar that is still moving can be executed again and rolled back.
The conformance adapter is the other way in:

```
python -m openscript --describe
python -m openscript <case-directory>
```

## Where the documentation is

The specification and the guides live in the repository:

- `docs/integrating/the-python-engine.md` for what is in this package and what a
  host needs.
- `docs/integrating/running-a-strategy.md` for driving it bar by bar: the load,
  the bar cycle, the rollback a moving bar rests on, and the order boundary.
- `spec/` for the language, the compiled program format, the standard library
  and the conformance suite.

## Licence

Apache-2.0.
