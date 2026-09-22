# Releasing

Every release after the first is automated and needs no credential. The first one
cannot be, and this page exists because that is the step every guide skips.

---

## The chicken and the egg

The release workflow publishes with **trusted publishing**: the registry checks
the workflow's own identity instead of a stored token, so there is no long-lived
credential anywhere. That is the right way to publish and it is why the workflow
holds no secret.

It is also not usable until the package exists.

A trusted publisher is configured **on a package**, through that package's
settings page on the registry. A package that has never been published has no
settings page, so there is nothing to configure. The registry's own documentation
does not spell this out; the setup instructions simply begin "navigate to your
package settings", which presupposes the package is there.

So the first publish is manual, from a person's machine, once. After that the
automation takes over permanently.

## The bootstrap, once

Only somebody with publish rights on the account can do this.

**1. Take the package out of private.** `package.json` carries `"private": true`
deliberately, and the release workflow refuses to publish while it does. Remove
it in the same commit that sets the first version.

**2. Publish once, by hand.**

```bash
npm login
npm publish --access public
```

Use a pre-release version. `0.0.1` or `0.1.0-alpha.0` both say clearly that this
is a placeholder rather than something to build on, and a `0.x` version already
means unstable by convention.

Consider publishing it under a tag other than `latest`:

```bash
npm publish --access public --tag alpha
```

so that `npm install` does not hand a stub to somebody who was looking for a
working compiler. Check what the tags actually point at afterwards, because the
first publish of a new package may create `latest` regardless:

```bash
npm dist-tag ls openalgo-script
```

**3. Configure the trusted publisher**, now that there is a settings page for it.
On the package's settings, under Trusted Publisher, name:

| Field | Value |
|---|---|
| Repository | the GitHub repository holding this file |
| Workflow | `release.yml` |
| Environment | `release` |

**Allow npm publish must be enabled.** Without it only staging is permitted and
the workflow's direct publish is refused, which fails late and confusingly.

**4. Confirm the automation before trusting it.** Tag a patch release and dispatch
the workflow. If that publishes with provenance and no token, the bootstrap is
done and nobody needs to log in again.

## Every release after that

1. Update the version in `package.json` and the changelog.
2. `npm test`, which runs the seven checks, the real build and the unit tests.
3. Commit, tag, push the tag.
4. Dispatch the Release workflow manually with that tag.

The tag push alone publishes nothing. A tag is cheap to create by accident and
publishing is not reversible, so the two are kept separate on purpose.

Before it publishes anything the workflow refuses:

- a red suite, because a release is the worst moment to discover one
- a runtime dependency advisory
- a non-empty `dependencies`, since zero of them is a promise this project makes
  and a promise held only in a README lasts until the first convenience
- a package still marked private
- a tag, manifest or built artifact that disagree about the version
- **a compiled format version that the specification does not document**

That last one matters more than it looks. Somebody implementing the compiled
program in another language targets a **format** version, not this package's
version, and the two move at different speeds on purpose: the package can reach
2.0 for an API change while the format stays at 1 and their engine keeps working.
What must never happen is the format version drifting between the document they
implemented from and the compiler that emits it.

## When to do the bootstrap

Two honest options.

**Now.** The name is free today and it is the only thing standing between this
project and somebody else taking it. It also unblocks the trusted publisher
configuration, so the automation can be proved to work long before there is
anything important to publish. The cost is a stub on the registry for a while.

**At the first useful version.** The compiler cannot yet compute a moving
average, so an install today repays nobody. The risk is small but real, and
losing the name after building on it is far worse than an early stub.

The deciding argument is the second one in the first option: automation that has
never run is not automation. Proving the path works while the stakes are a
placeholder is better than discovering a misconfigured publisher on the day a
release matters.

## The Python engine, to PyPI

Two packages ship as one release. `scripts/check-python.mjs` holds their version
numbers equal, so this happens in the same change as the npm publish and never
on its own.

The distribution is `engine/`, and it is built and uploaded from there:

```
cd engine
rm -rf dist build *.egg-info
uv build --out-dir dist .
uvx twine check dist/*
uvx twine upload dist/*
```

**Check the wheel before uploading, not after.** An upload cannot be undone: a
deleted release does not free its version, so the number is spent whatever
happens next. Two things to look at, both of which have been wrong:

- **Every package is in it.** `[tool.setuptools] packages` is a hand-written
  list, and it once named only `openscript`, so the distribution shipped the
  machine and none of the halves it calls. `check-python.mjs` now holds that
  list to the tree, and the wheel can be read directly:
  `python -c "import zipfile; print([n for n in zipfile.ZipFile('dist/openscript-<v>-py3-none-any.whl').namelist() if n.endswith('__init__.py')])"`
- **It installs and imports somewhere else.** A clean interpreter, the built
  wheel, and an import of each half. The tree has every directory present
  whether or not the distribution carries them, so nothing here can tell you
  this: only an install elsewhere can.

**The token is never pasted anywhere it is recorded.** `twine` reads
`TWINE_USERNAME=__token__` and `TWINE_PASSWORD` from the environment. Use a
token scoped to this project rather than the account, so a leak reaches nothing
else.
