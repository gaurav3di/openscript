# Specification

These are the documents that make up the specification. All of them are being
written now, and the implementation follows them rather than the other way
round.

| Document | Holds |
|---|---|
| [`language.md`](./language.md) | Syntax, types, scope, the per-bar execution model, the shape of the library |
| [`stdlib.md`](./stdlib.md) | The library catalogue: every name a script can call, its signature, its warmup, where it lands in the chart contract |
| [`compiled-program.md`](./compiled-program.md) | The versioned schema and machine every engine reads. The contract that lets a second implementation exist |
| [`errors.md`](./errors.md) | The error catalogue: code, cause, fix, example, for every error a compiler or an engine can emit |
| [`host-interface.md`](./host-interface.md) | Everything a platform supplies so an engine can run, and everything the engine hands back: the boundary |
| [`conformance.md`](./conformance.md) | How the suite is run, and what a passing result entitles an implementation to claim |

Six documents, and the list above is the whole of it. Two more files sit beside
them and are not the specification:

| File | Holds |
|---|---|
| [`decisions.md`](./decisions.md) | The minutes of every settled cross-document question, and the home register that says which document owns each fact |
| [`feature-matrix.md`](./feature-matrix.md) | One row per feature: whether it is specified, implemented or planned, the section that defines it, and the test that proves it |

`errors.json` is `errors.md` in machine form, generated from the same entries.
It is not a document of its own, and a change to one is the same change to the
other.

## Which document wins

Two documents that disagree are a defect, and until it is fixed a reader still
needs an answer. These are the answers.

| The disagreement is about | The document that wins |
|---|---|
| The text of a code: its message, its cause, its fix | `errors.md` |
| A rule of the language | `language.md` |
| A function: its arguments, its result, its warmup | `stdlib.md` |
| A representation: a field name, a wire value, an encoding | `compiled-program.md` |
| The boundary: what a host supplies and what it is handed | `host-interface.md` |
| The suite: a case, a runner, a profile, a claim | `conformance.md` |

Where none of those settles it, the home register in `decisions.md` names the
document that owns the fact, and every other document cites that one rather than
restating it.
