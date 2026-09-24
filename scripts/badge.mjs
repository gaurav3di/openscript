/**
 * A conformance badge from a result document, `conformance.md` section 12.
 *
 *     node scripts/badge.mjs <result.json> --link <where the document is published> [--out <badge.svg>] [--cases <dir>]
 *
 * Reads a result document the runner wrote (`scripts/run-suite.mjs --out`),
 * refuses it unless it is a passing run of the profile it claims and names all
 * four things a badge must carry, and writes the badge as an SVG. The line a
 * page embeds it with goes to standard output, linking to the result document,
 * because a badge whose link does not reach the document is decoration.
 *
 * **The revision is recomputed, not trusted.** The suite under `--cases`, by
 * default the one in this checkout, is digested the way section 11 spells a
 * revision, and a document made against any other suite is refused: a badge
 * names a revision, and one naming a revision the published suite does not
 * have is a claim nobody can check. Pass `--cases` pointing at the copy of the
 * suite the run was actually made against.
 *
 * **This project does not show a badge of its own yet.** ROADMAP.md Phase 7:
 * a badge names a suite revision, and it is not shown for a revision no engine
 * written from the specification alone, by somebody who has not read this
 * implementation, has passed. The tool is for that engine, and for any other.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { badgeMarkdown, badgeRefusal, badgeSvg } from './lib/badge.mjs';
import { conformancePage, profileOrder } from './lib/conformance-page.mjs';
import { suiteRevision } from './lib/suite-revision.mjs';

const USAGE =
  'Usage: node scripts/badge.mjs <result.json> --link <where the document is published> ' +
  '[--out <badge.svg>] [--cases <dir>]';

function refuse(message) {
  console.error(message);
  process.exit(1);
}

function readArguments(argv) {
  const options = { document: null, link: null, out: 'badge.svg', cases: 'cases' };
  for (let at = 0; at < argv.length; at += 1) {
    const flag = argv[at];
    if (!flag.startsWith('--')) {
      if (options.document !== null) refuse(`Only one result document is read.\n${USAGE}`);
      options.document = flag;
      continue;
    }
    const value = argv[at + 1];
    if (value === undefined) refuse(`${flag} needs a value.\n${USAGE}`);
    at += 1;
    if (flag === '--link') options.link = value;
    else if (flag === '--out') options.out = value;
    else if (flag === '--cases') options.cases = value;
    else refuse(`${flag} is not an argument this command takes.\n${USAGE}`);
  }
  if (options.document === null) refuse(`Name the result document to make a badge from.\n${USAGE}`);
  return options;
}

const options = readArguments(process.argv.slice(2));
const profiles = profileOrder(conformancePage());
if (profiles === null) refuse('spec/conformance.md no longer prints the profiles of section 8 in the form this reads.');

let document;
try {
  document = JSON.parse(readFileSync(options.document, 'utf8'));
} catch (error) {
  refuse(`${options.document} could not be read as a result document: ${error.message}`);
}
if (!existsSync(options.cases)) refuse(`There is no suite at ${options.cases} to recompute the revision from.\n${USAGE}`);

const revision = suiteRevision(options.cases, JSON.parse(readFileSync('package.json', 'utf8')).version);
const refusal = badgeRefusal(document, options.link, profiles, revision);
if (refusal !== null) refuse(`No badge: ${refusal}.`);

writeFileSync(options.out, badgeSvg(document, options.link), 'utf8');
process.stdout.write(`${badgeMarkdown(document, options.out, options.link)}\n`);
console.error(
  `Badge written to ${options.out} for ${document.engine.name} ${document.engine.version}, profile ` +
    `${document.engine.profile}, suite ${document.suiteRevision}, linking to ${options.link}. What it does not ` +
    'say: that the run happened as the document reports, which only a published document beside a build ' +
    'anybody can rerun makes credible (conformance.md section 12).',
);
