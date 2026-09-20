# Working on OpenScript

Conventions for anyone, human or agent, changing this repository.

---

## The rules that are not negotiable

Eleven checks enforce these, and each one of them is a rule somebody broke once.
`npm test` runs all of them, and so does every pull request. The count is here to
be corrected when it changes, not to be trusted: `package.json`'s `test` script
is the list.

1. **No `eval`, no `Function` constructor, no dynamic code construction.** The
   compiler emits data. This is what lets the language run inside an application
   with a strict content security policy, and it is the reason a platform can run
   many customers' scripts in one process. It is not a preference.
2. **Zero runtime dependencies.** `dependencies` is empty and stays empty. Every
   dependency is something an adopting platform has to accept.
3. **Layering.** A module is a directory and its index is its only door. Nothing
   under `src/core` may import a package or touch a browser global. An adapter is
   the only place allowed to know two worlds at once.
4. **No code file over 500 lines**, wherever it sits: source, tooling or test. A
   file past it is usually two things that were never separated. A document is
   prose and is not counted. One already over it is recorded in
   `spec/modularity-exceptions.json` with the length it was recorded at, which is
   a ceiling it cannot grow past and a row that has to go the moment it is
   earned out.
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

**A documented refusal is a refusal something raises.** A code in the catalogue
is raised by some code path, or the entry carries a `deferred` sentence saying
what happens instead today and what has to exist first. There is no third case:
a code taught as current behaviour that nothing can produce is a promise nothing
keeps, and `scripts/check-raises.mjs` fails the build on one. The deferral goes
in the catalogue, never in the checker, because a list of exemptions inside a
check is read by nobody and grows by a line whenever somebody is in a hurry.

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

## What the first host can and cannot change

The language stays neutral and its specification names no platform. These are
constraints on the **integration work**, not on the language, and they are here
because breaking one of them is expensive in a way that is not obvious from
inside this repository.

**The deployment's nginx configuration is fixed.** It is in production for a large
user base, and changing it means every hosted upgrade carries a config migration
that can take people offline. So the integration adds no location block, no port
and no directive. This is achievable because `location /` already proxies
everything to the application, and only the websocket and socket paths have
blocks of their own. Every route and asset is already routed.

Three limits that block sets, which decide the shape of the work:

- **Five minute request timeout.** Anything longer is a job that returns an id,
  not a request that returns a result. A backtest over years of minute bars would
  be killed partway through, and the user would see a gateway error with a run
  still executing behind it.
- **One megabyte request body** on the smallest deployment, where the limit is
  left at the default. Scripts and compiled programs are kilobytes and fine.
  Nothing that grows with history may travel in a body.
- **Responses are buffered** on the main path. A progress stream there arrives in
  one lump at the end. Progress rides the socket channel that is already open and
  already unbuffered.

**The production container has no runtime for JavaScript.** It is Python only: the
frontend is built in a discarded stage. A server-side sidecar in any other
language is not a worse option, it is not an option. This is why the second engine
is Python, and why the compiled program being plain data rather than generated
code is load bearing rather than tidy.

**A worker must be a served file, not a blob.** The content security policy allows
scripts from the application's own origin and nothing else, so a worker built from
a blob URL is refused. Same conclusion as the no-eval rule, reached from a
different direction.

**Nothing may assume an origin.** The application is served from a local port, a
domain, a subdomain and a container, and people move between them with a script
written for that purpose. Every URL is relative or comes from configuration. An
absolute URL baked into a bundle works perfectly for whoever wrote it and breaks
every hosted install.

**A trader's files live on a mounted volume**, never inside the image, so they
survive a container rebuild.

**Nothing new is started, and nothing computes in the request process.** The
integration adds routes and services to an application that already runs, so the
existing start command brings up everything. But that application is a single
cooperatively scheduled worker, where ordinary threads and thread pools are green
rather than real, so anything that occupies the worker stops it for every user
until it returns. A backtest over fifty thousand bars is pure computation with no
yield points: it runs in a subprocess, the route returns an id, and progress goes
over the socket that is already open. The development server uses real threading,
so this exact mistake works perfectly on a developer's machine and only fails in
production.

The rule underneath all of these: **the smallest deployment sets the budget.** A
limit that is generous on one install and default on another is the default one.

## The standing bar

Everything here has to clear two questions, not one: is it correct, and can a
platform that did not build it run production on it. The second is written into
each phase's gate in `ROADMAP.md`.

**Prefer a check to a promise.** A promise in a document is worth exactly as much
as the attention of whoever reads it next. When something has gone wrong twice,
the answer is a script that refuses it, not a firmer intention.
