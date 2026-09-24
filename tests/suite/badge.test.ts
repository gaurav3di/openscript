/**
 * The suite revision of `conformance.md` section 11 and the badge of section 12,
 * which are the tests `unit:conf/suite-versioning` and `unit:conf/claim` name
 * in `spec/feature-matrix.md`.
 *
 * Each test names the wrong implementation it catches. The revision is tested
 * over a suite built for the purpose, because the claim worth testing is that a
 * one byte change anywhere in a suite moves it, and the repository's own suite
 * is not a thing a test may edit (section 10).
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const REVISION_MODULE = '../../../scripts/lib/suite-revision.mjs';
const BADGE_MODULE = '../../../scripts/lib/badge.mjs';

interface RevisionModule {
  readonly REVISION_PATTERN: RegExp;
  suiteRevision(root: string, version: string): string;
}

interface BadgeModule {
  badgeRefusal(document: unknown, link: string | null, profiles: readonly string[], revision: string | null): string | null;
  badgeSvg(document: unknown, link: string): string;
}

const PROFILES = ['core', 'chart', 'strategy'];
const REVISION = '1.0.0+4f0c2a9d1e7b';
const LINK = 'results/an-engine.json';

/** A suite of two cases in a directory of its own. */
function suite(): string {
  const root = mkdtempSync(join(tmpdir(), 'openscript-revision-'));
  for (const id of ['a/one', 'b/two']) {
    mkdirSync(join(root, ...id.split('/')), { recursive: true });
    writeFileSync(join(root, ...id.split('/'), 'case.json'), `{"id":"${id}"}\n`);
    writeFileSync(join(root, ...id.split('/'), 'bars.csv'), 'time,close\n1,2\n');
  }
  return root;
}

/** A passing run of the chart profile, which a test changes one thing about. */
function passing(changed: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    suiteRevision: REVISION,
    engine: { name: 'an-engine', version: '2.1.0', profile: 'chart' },
    summary: { total: 3, pass: 2, fail: 0, nonFinite: 0, error: 0, unsupported: 0, skipped: 1 },
    cases: [
      { id: 'a/one', outcome: 'pass', durationMs: 1 },
      { id: 'b/two', outcome: 'pass', durationMs: 1 },
      { id: 'c/three', outcome: 'skipped', profile: 'strategy', durationMs: 0 },
    ],
    ...changed,
  };
}

test('a revision is the version and twelve digits, and moves with one byte of one file', async () => {
  // Catches a revision that is the version alone, one that reads only case.json,
  // and one that depends on the order a directory happens to list in.
  const { REVISION_PATTERN, suiteRevision } = (await import(REVISION_MODULE)) as RevisionModule;
  const root = suite();
  try {
    const first = suiteRevision(root, '1.0.0');
    assert.match(first, REVISION_PATTERN);
    assert.ok(first.startsWith('1.0.0+'));
    assert.equal(suiteRevision(root, '1.0.0'), first, 'the same suite twice');
    writeFileSync(join(root, 'b', 'two', 'bars.csv'), 'time,close\n1,3\n');
    assert.notEqual(suiteRevision(root, '1.0.0'), first, 'one byte of a bars file');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a file moved to another path is another suite, with the same bytes', async () => {
  // Catches a digest over contents alone, where a case renamed under another id
  // would keep the revision of the suite it no longer is.
  const { suiteRevision } = (await import(REVISION_MODULE)) as RevisionModule;
  const root = suite();
  try {
    // The renamed file still sorts last, so the bytes are digested in the same
    // order and only the path differs.
    const before = suiteRevision(root, '1.0.0');
    writeFileSync(join(root, 'b', 'two', 'copy.json'), '{"id":"b/two"}\n');
    rmSync(join(root, 'b', 'two', 'case.json'));
    assert.notEqual(suiteRevision(root, '1.0.0'), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a passing run of its profile gets a badge, and one skipped case outside it does not stop one', async () => {
  const { badgeRefusal } = (await import(BADGE_MODULE)) as BadgeModule;
  assert.equal(badgeRefusal(passing(), LINK, PROFILES, REVISION), null);
});

test('each of the four things a badge carries is required', async () => {
  // Catches a badge made with a blank field, which section 12 says is not a claim.
  const { badgeRefusal } = (await import(BADGE_MODULE)) as BadgeModule;
  const unnamed = passing({ engine: { name: '', version: '2.1.0', profile: 'chart' } });
  assert.notEqual(badgeRefusal(unnamed, LINK, PROFILES, REVISION), null, 'no name');
  const unversioned = passing({ engine: { name: 'an-engine', profile: 'chart' } });
  assert.notEqual(badgeRefusal(unversioned, LINK, PROFILES, REVISION), null, 'no version');
  const unprofiled = passing({ engine: { name: 'an-engine', version: '2.1.0', profile: 'everything' } });
  assert.notEqual(badgeRefusal(unprofiled, LINK, PROFILES, REVISION), null, 'a profile section 8 lacks');
  assert.notEqual(badgeRefusal(passing({ suiteRevision: '2026.1' }), LINK, PROFILES, null), null, 'a revision in another spelling');
  assert.notEqual(badgeRefusal(passing(), '', PROFILES, REVISION), null, 'no link');
});

test('a run that is not a pass of its profile gets no badge', async () => {
  // Catches a badge for a run with a failing, erroring or unsupported case, for
  // one that skipped a case its own profile covers, and for a two engine run.
  const { badgeRefusal } = (await import(BADGE_MODULE)) as BadgeModule;
  for (const outcome of ['fail', 'nonFinite', 'error', 'unsupported']) {
    const summary = { total: 3, pass: 2, fail: 0, nonFinite: 0, error: 0, unsupported: 0, skipped: 0, [outcome]: 1 };
    assert.notEqual(badgeRefusal(passing({ summary }), LINK, PROFILES, REVISION), null, outcome);
  }
  const skippedInside = passing({
    cases: [{ id: 'a/one', outcome: 'pass' }, { id: 'b/two', outcome: 'skipped', profile: 'core' }],
  });
  assert.notEqual(badgeRefusal(skippedInside, LINK, PROFILES, REVISION), null, 'skipped inside');
  const compared = passing({ against: { name: 'other', version: '1', profile: 'chart' } });
  assert.notEqual(badgeRefusal(compared, LINK, PROFILES, REVISION), null, 'two engines');
  const nothing = passing({ cases: [{ id: 'c/three', outcome: 'skipped', profile: 'strategy' }] });
  assert.notEqual(badgeRefusal(nothing, LINK, PROFILES, REVISION), null, 'no pass at all');
});

test('an engine-only run may skip inside its profile, and its badge says it is engine only', async () => {
  // Catches a badge that hides the engine-only report section 8 requires.
  const { badgeRefusal, badgeSvg } = (await import(BADGE_MODULE)) as BadgeModule;
  const engineOnly = passing({
    engine: { name: 'an-engine', version: '2.1.0', profile: 'chart', engineOnly: true },
    cases: [{ id: 'a/one', outcome: 'pass' }, { id: 'b/two', outcome: 'skipped', profile: 'core' }],
  });
  assert.equal(badgeRefusal(engineOnly, LINK, PROFILES, REVISION), null);
  assert.match(badgeSvg(engineOnly, LINK), /engine only/);
});

test('a document made against another suite is refused', async () => {
  // Catches a badge naming a revision the suite here does not have.
  const { badgeRefusal } = (await import(BADGE_MODULE)) as BadgeModule;
  assert.notEqual(badgeRefusal(passing(), LINK, PROFILES, '1.0.0+000000000000'), null);
});

test('the badge escapes what it is given and links to the document', async () => {
  // Catches a name or a link written into the markup unescaped.
  const { badgeSvg } = (await import(BADGE_MODULE)) as BadgeModule;
  const svg = badgeSvg(passing({ engine: { name: 'a<b>&c', version: '1"2', profile: 'chart' } }), 'r?a=1&b=2');
  assert.ok(!svg.includes('a<b>'));
  assert.ok(svg.includes('a&lt;b&gt;&amp;c'));
  assert.ok(svg.includes('href="r?a=1&amp;b=2"'));
  assert.ok(svg.includes(`suite ${REVISION}`));
});
