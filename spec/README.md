# Specification

Three documents make up the specification. All three are being written now, and
the implementation follows them rather than the other way round.

| Document | Holds |
|---|---|
| `language.md` | Syntax, types, scope, the per-bar execution model, the standard library |
| `compiled-program.md` | The versioned schema every engine reads. The contract that lets a second implementation exist |
| `errors.md` | The error catalogue: code, cause, fix, example, for every error the compiler can emit |

A fourth, `conformance.md`, describes how to run the suite and what a passing
result entitles an implementation to claim.
