/**
 * A conformance badge, `conformance.md` section 12, from a result document.
 *
 * **A badge carries four things and is not valid without all four**: the
 * implementation and its version, the suite revision, the profile, and a link
 * to the result document. So this refuses a document that lacks any of them,
 * and it refuses a document that is not a passing run of the profile it
 * claims, because a badge is the claim and section 12 says what a passing
 * result may claim. Nothing here vouches for the run: section 12 says the
 * project runs no certification, and a badge is credible exactly to the extent
 * that the document it links to is published beside a build anybody can rerun.
 *
 * **What makes a run passing is read off the document, by section 9's rules.**
 * No `fail`, `nonFinite`, `error` or `unsupported` outcome, at least one pass,
 * and every skipped case outside the claimed profile, except for an
 * implementation reporting engine-only, which section 8 lets skip the
 * compiler-diagnostic categories and whose badge then says so. A document
 * comparing two engines is refused: section 10's mode proves they agree, not
 * that either passes.
 *
 * Pure: text in, text out. `scripts/badge.mjs` reads and writes the files.
 */
import { insideProfile } from './conformance-page.mjs';
import { REVISION_PATTERN } from './suite-revision.mjs';

/** The outcomes of section 9 that make a run not a passing one. */
const NOT_PASSING = ['fail', 'nonFinite', 'error', 'unsupported'];

/** Pixels one character takes in the badge's monospaced face, and the padding either side. */
const CHARACTER = 7;
const PADDING = 10;

/**
 * Whether a document may carry a badge, and why not when it may not.
 *
 * `profiles` is section 8's order, read from the page by the caller, and
 * `revision` is the revision of the suite the caller holds, or null when the
 * caller holds none to compare with.
 */
export function badgeRefusal(document, link, profiles, revision) {
  if (document === null || typeof document !== 'object') return 'the result document is not a JSON object';
  const engine = document.engine;
  const named = (value) => typeof value === 'string' && value.trim() !== '';
  if (engine === null || typeof engine !== 'object' || !named(engine.name) || !named(engine.version)) {
    return 'the document does not name the implementation and its version, which a badge must carry';
  }
  if (!profiles.includes(engine.profile)) {
    return `the document claims the profile ${JSON.stringify(engine.profile)}, which section 8 does not list`;
  }
  if (typeof document.suiteRevision !== 'string' || !REVISION_PATTERN.test(document.suiteRevision)) {
    return `the document's suite revision ${JSON.stringify(document.suiteRevision)} is not spelled as section 11 spells one`;
  }
  if (revision !== null && document.suiteRevision !== revision) {
    return `the document was made against suite revision ${document.suiteRevision} and the suite here is ${revision}`;
  }
  if (!named(link)) return 'no link to the published result document was given, and a badge must carry one';
  if (document.against !== undefined) {
    return 'the document compares two engines (section 10), which proves they agree and not that either passes';
  }
  const summary = document.summary ?? {};
  for (const outcome of NOT_PASSING) {
    if ((summary[outcome] ?? 0) !== 0) return `the run has ${summary[outcome]} ${outcome} outcome(s), so it is not a passing run`;
  }
  const cases = Array.isArray(document.cases) ? document.cases : [];
  if (!cases.some((row) => row.outcome === 'pass')) return 'the run passed no case, which claims nothing';
  const engineOnly = engine.engineOnly === true;
  const inside = cases.filter(
    (row) => row.outcome === 'skipped' && insideProfile(profiles, engine.profile, row.profile),
  );
  if (inside.length > 0 && !engineOnly) {
    return `${inside.length} case(s) inside the claimed profile were skipped, the first ${inside[0].id}`;
  }
  return null;
}

/** Text safe inside an attribute or an element of an SVG document. */
function escaped(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** The two halves of the badge's text, which between them carry three of the four things. */
export function badgeText(document) {
  const engine = document.engine;
  const scope = engine.engineOnly === true ? `${engine.profile}, engine only` : engine.profile;
  return {
    left: `OpenScript ${scope}`,
    right: `${engine.name} ${engine.version}, suite ${document.suiteRevision}`,
  };
}

/** The badge, an SVG linking to the result document, which is the fourth. */
export function badgeSvg(document, link) {
  const { left, right } = badgeText(document);
  const leftWidth = left.length * CHARACTER + 2 * PADDING;
  const rightWidth = right.length * CHARACTER + 2 * PADDING;
  const width = leftWidth + rightWidth;
  const label = escaped(`${left}: ${right}`);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${label}">`,
    `<title>${label}</title>`,
    `<a href="${escaped(link)}">`,
    `<rect width="${leftWidth}" height="20" fill="#555555"/>`,
    `<rect x="${leftWidth}" width="${rightWidth}" height="20" fill="#2e7d32"/>`,
    '<g fill="#ffffff" font-family="monospace" font-size="11">',
    `<text x="${PADDING}" y="14">${escaped(left)}</text>`,
    `<text x="${leftWidth + PADDING}" y="14">${escaped(right)}</text>`,
    '</g>',
    '</a>',
    '</svg>',
    '',
  ].join('\n');
}

/** The line a page embeds the badge with, linking to the result document. */
export function badgeMarkdown(document, imagePath, link) {
  const { left, right } = badgeText(document);
  return `[![${left}: ${right}](${imagePath})](${link})`;
}
