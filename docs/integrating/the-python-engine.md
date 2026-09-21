# The engine in the other language

For anyone who has to run a compiled program somewhere a JavaScript runtime is
not, and for anyone working on the engine that does it.

By the end of this page you will know what is in `engine/`, what a host needs in
order to run it, how to run its tests and its checks, and what refuses a piece
of Python that would quietly break the two promises the whole design rests on.

---

## Why there is a second engine at all

A production container can be Python only. Not "prefers Python": the front end
is built in a stage that is thrown away, and nothing that speaks another
language survives into the image. A server-side sidecar in a second language is
not a worse option there, it is not an option.

That constraint is what makes the compiled program's shape load bearing rather
than tidy. The program is **data**, so an engine for it can be written in
whatever language the infrastructure already speaks, and this directory is the
first proof of that claim rather than an argument for it.
[`integrating/your-own-engine.md`](./your-own-engine.md) is the same route for
somebody outside this repository, and everything it says applies here.

## What is in engine/

```
engine/
  pyproject.toml     the distribution: its name, the version, and an empty
                     dependency list
  openscript/        the package, importable as one name
    __init__.py      the door
    __main__.py      the entry point an adapter starts
  tests/             the engine's own tests
  tools/             programs about the engine rather than part of it
```

The project file is here rather than at the repository root on purpose. The root
belongs to the JavaScript package, and a second project file beside it would
leave two answers to the question of what an install of this directory ships.
Under `engine/` there is one answer.

Much of the package is not written yet. `__init__.py` says what goes where and
which stage fills it, and a module that is not there yet is absent rather than
stubbed: a stub that answers an invocation with a shape somebody starts
depending on is worse than nothing.

## What a host needs

An interpreter, at the version `pyproject.toml` requires, and nothing else.

There is no install step for the tests and no package to fetch from an index.
The engine imports the standard library and nothing outside it, so a clone runs
as it stands:

```
python engine/tools/run_tests.py
```

A host that wants the package on the import path can install the directory with
its own tooling, or put the directory on the path and import it. Either way the
entry point is the same, which is the reason no console script is declared:

```
python -m openscript
```

The version the distribution carries is the version the package manifest
carries. They are one fact written in two files, because a build backend cannot
read the other one, and `scripts/check-python.mjs` fails the build the day they
disagree rather than leaving a release to discover it.

## Running it from the gate

`npm test` runs both engines. The Python half is one step:

```
npm run check:python
```

That step finds an interpreter, refuses one older than the distribution
requires, reads every import in the tree, and then runs the tests under the same
interpreter it just measured. A missing interpreter fails it. That is
deliberate: a suite that quietly checks one engine is how two engines drift
apart, and the phase this work belongs to is measured by the two agreeing on
every conformance case.

The test runner is the standard library's, with one thing added. A discovery
that found nothing exits zero and prints a passing line, and that failure has
been paid for four times on the other side of this tree, so the count is a
result rather than a line of output: a run that discovered no tests, or ran
fewer than it discovered, is refused.

Nothing a run does writes into the tree. Bytecode caching is turned off before
the first test module is imported, so no cache directory is left behind for the
next check to meet.

## What refuses bad Python

Two checks, and the division between them is the same one the JavaScript side
has had from the start.

**`scripts/check-python.mjs` is about the package a host installs.** Every
import in every Python file is read and compared against the module names the
running interpreter says are its own, so an empty dependency list is a measured
fact rather than a claim about a file. Inside the package a handful of the
interpreter's own modules are refused as well, each with the sentence that
refuses it: the network, threads, randomness and the locale are all ways for two
runs of the same program to differ, and two engines that differ are what this
whole effort exists to prevent.

**`scripts/check-no-eval.mjs` is about every Python file here, shipped or not.**
It reads each one with a masker that removes comments, replaces string literals
with a marker, reads a formatted string's substitutions as code, and normalises
every identifier the way the interpreter normalises it. Then it refuses the
string evaluator, the statement executor, the compiler underneath them, the
import machinery driven by hand, objects loaded out of bytes, function and code
objects built at run time, the namespace the built-in names live in, a namespace
taken as a dictionary, a process, and the modules whose whole purpose is running
text handed to them.

`ast.literal_eval` is safe and is allowed. It reads one literal, builds the
value it denotes, and runs nothing.

Both checks attack themselves before they read a file. Every form in
`scripts/lib/no-eval-python-attacks.mjs` goes through the rules first, every
ordinary line beside it has to be left alone, and every rule has to be the
reason some form is caught: a pattern that can never match looks exactly like a
pattern that works, and this repository has shipped one of those before.

The identifier normalisation is worth one more sentence, because it is the piece
with no counterpart on the other side. An interpreter normalises every
identifier before it resolves it, so a name written in mathematical letters or
in fullwidth letters is a different sequence of characters, the same name to the
interpreter, and invisible to any pattern written against plain letters. Three
such spellings are in the corpus, and each was run under an interpreter before
it was written down.

**What neither check covers**, said plainly so the claim is not read wider than
it is: a scan reads text, and a watched name can be spelled in ways nobody has
thought of yet. What is enforced rather than scanned is narrower and stronger,
and it is the dependency rule above: a module that is not imported is not
reachable, whatever it was spelled.

## Where the numbers come from

The engine is not measured against the other engine's source. It is measured
against the documents and against the vectors:
[`spec/compiled-program.md`](../../spec/compiled-program.md) for the machine,
[`spec/stdlib.md`](../../spec/stdlib.md) for the library and for the order every
accumulation is performed in, and
[`integrating/library-vectors.md`](./library-vectors.md) for the bit patterns a
function has to reproduce, including how to decode one in this language.

Two consequences worth carrying around.

**Order is the whole game.** The specification fixes the order of every
accumulation because binary64 addition is not associative, so the order decides
the last bit. The convenient way to add a column of numbers is not the specified
order, and neither is the accurate one.

**Some calls are not compared at all.** `stdlib.md` section 20.11 records the
gap where no portable reference algorithm exists, and `conformance.md` section 8
scopes it out of every profile. Those calls use the interpreter's own maths
module here, and no case may assert a value that reaches one.
