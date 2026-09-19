# Working on OpenScript

Conventions for anyone, human or agent, changing this repository.

---

## The rules that are not negotiable

Six checks enforce these. `npm test` runs all of them, and so does every pull
request.

1. **No `eval`, no `Function` constructor, no dynamic code construction.** The
   compiler emits data. This is what lets the language run inside an application
   with a strict content security policy, and it is the reason a platform can run
   many customers' scripts in one process. It is not a preference.
2. **Zero runtime dependencies.** `dependencies` is empty and stays empty. Every
   dependency is something an adopting platform has to accept.
3. **Layering.** A module is a directory and its index is its only door. Nothing
   under `src/core` may import a package or touch a browser global. An adapter is
   the only place allowed to know two worlds at once.
4. **No file over 500 lines.** A file past it is usually two things that were
   never separated.
5. **Name nobody.** No outside product, platform, company, trademark, market index
   or real instrument, anywhere: not in source, comments, documentation, examples,
   test names or commit messages. Describe prior art generically. Examples use
   placeholder symbols.
6. **No fact stated twice.** A value set written out in two files is a fact you
   would have to edit two places to change, and every copy reads as authoritative.

Plain text everywhere: no emoji, and no em dashes or en dashes. Use a comma, a
colon, parentheses or a full stop.

## Diagnostics

Every error carries a catalogue code. Never throw a bare string.

**The message says what is wrong and the fix says what to do, and both must be
true of the actual program.** A fix that would change the meaning of the code is
worse than no fix, because a reader trusts it. An error that cannot suggest a
concrete fix is a badly designed error; redesign the error.

Error codes and their text live in `spec/errors.json` and are generated into the
compiler. Nothing under `src/` retypes a message.

## Tests

Assert the **code and the span**, not the message text. Wording is allowed to
improve; a code is a promise.

A test that cannot fail is documentation with a green tick on it. Before adding
one, write down the wrong implementation it is supposed to catch and check that it
would actually fail.

## Every release

In this order. The changelog check and the release workflow enforce the parts that
can be enforced.

1. **Update `CHANGELOG.md`** with an entry for the new version, written for
   somebody deciding whether to upgrade. A consumer reads the changelog at the one
   moment it matters to them. "Various fixes" answers nothing, and a version with
   no entry tells them to diff two tags, which they will not do: they will simply
   not upgrade. `scripts/check-changelog.mjs` fails the release on a missing or
   empty entry.
2. **Update the documentation that the change makes wrong.** A language change
   almost always touches `docs/`, and the specification wins every disagreement
   between the two. If a behaviour changed, the page that teaches it changed too.
3. **Update the specification** if the change is to the language rather than to
   the implementation. The specification is written first and the implementation
   follows it, not the other way round.
4. **Update `README.md`** if the change alters what the package does today. The
   registry page is the first thing a stranger sees, and it must not overstate.
5. Bump the version in `package.json`.
6. `npm test`.
7. Commit, tag `vX.Y.Z`, push the tag.
8. Dispatch the Release workflow manually with that tag.

A tag push publishes nothing by itself. A tag is cheap to create by accident and
publishing is not reversible, so the two are kept separate.

`RELEASING.md` has the detail, including the one manual step that cannot be
automated.

## Two version numbers, not one

The **package version** and the **compiled program format version** are separate
and move at different speeds.

Somebody implementing the compiled program in another language targets the format.
The package can reach 2.0 for an API change while the format stays at 1 and their
engine keeps working. What must never happen is the format version drifting
between the specification they implemented from and the compiler that emits it.
The release refuses to publish if it has.

## The standing bar

Everything here has to clear two questions, not one: is it correct, and can a
platform that did not build it run production on it. The second is written into
each phase's gate in `ROADMAP.md`.

**Prefer a check to a promise.** A promise in a document is worth exactly as much
as the attention of whoever reads it next. When something has gone wrong twice,
the answer is a script that refuses it, not a firmer intention.
