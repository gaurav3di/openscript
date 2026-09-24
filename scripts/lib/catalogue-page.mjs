/**
 * The page a reader opens, against the file the compiler is generated from.
 *
 * `errors.md` says of itself that it is the authoritative list and that part 8
 * "is rendered from `errors.json` by the documentation build, so the two cannot
 * disagree". Nothing rendered it and nothing compared it. It is edited by hand,
 * beside a file that is generated into the compiler, which is the exact shape
 * of every drift this repository has had: two copies of one fact, both read as
 * authoritative, neither checked.
 *
 * It was measured before this was written. Changing one word of OS7017's
 * message in `errors.md`, from "was given" to "was handed", passed the whole of
 * `npm test` with exit 0. The reader of the catalogue would have been shown one
 * sentence and the user of the compiler a different one, for as long as nobody
 * happened to diff them.
 *
 * ## What is compared, and what is not
 *
 * Every string a reader acts on, character for character: the heading's title,
 * the first line's severity, stage, language version, specification reference,
 * test pointer and autofix sentence, the deferral, the unexercised sentence,
 * the message template, every placeholder gloss, the cause and the fix. The two
 * worked example blocks and the test pointer sentence are compared by
 * `check-catalogue-tests.mjs` itself and are not repeated here.
 *
 * Two tables outside part 8 are compared as well, because both are the same
 * fact written twice. Part 4's ranges table restates `ranges` and counts the
 * entries in each block: it said 20 for the argument range and a total of 147
 * on the day this was written, against 23 and 150 in the file. Part 6's
 * refinements table is the set of entries carrying `refines`: one entry had
 * been added to the file, given a sentence of its own on its part 8 page that
 * no other entry has, and left out of the table.
 *
 * What is **not** compared is the prose around all of it. Parts 1 to 3, 5 and 7
 * are the design `errors.json` implements rather than a copy of it, and a check
 * that tried to hold them to the file would be a check nobody could keep green.
 * That reach is stated here rather than implied, because a check that overstates
 * what it covers is worse than a small one that says so.
 *
 * ## And now something does render it
 *
 * The documentation site gives every code a page of its own, and the page is
 * `sectionFor`, below: one whole part 8 section written from one entry, out of
 * the same pieces the comparisons above read back. So there is one renderer of a
 * section, and it is this file's, rather than a second one in the site that
 * would drift from the page it imitates.
 *
 * Every section is then compared with that rendering as a whole, once each
 * field has been found equal. That reaches what the field comparisons cannot:
 * the order of the paragraphs, the one sentence the transcript entries print
 * that no field holds, the blank lines, and anything a section says that the
 * file does not. When all of it holds, part 8 is character for character the
 * text the site prints on each code's own page, which is what the introduction
 * to `errors.md` has promised since before anything rendered it.
 */

/** The sentence a section prints where no test names the code. */
const NO_TEST = 'No test in this repository names this code.';

/** The sentence a section prints where an editor can apply the fix. */
const AUTOFIX = 'The editor can apply the fix.';

/**
 * The paragraph a section prints where the example is the host's input.
 *
 * No field holds it, because it is the same for every such entry: the entry
 * says `kind: "transcript"` and the page says what that means to a reader.
 */
const HOST_INPUT =
  '**Host input.** The example below is the input that fails and the input that passes ' +
  'rather than a script, because this code is about what the engine was handed and not ' +
  'about what anybody wrote.';

/**
 * The paragraph a section prints where the example is a script in the source
 * dialect the importer reads, for the same reason: `kind: "import"` says it once
 * per entry and the page says what it means.
 */
const IMPORTED =
  '**Imported source.** The before block below is a script in the source dialect, which ' +
  'the importer reads rather than the compiler, and the after block is the OpenScript that ' +
  'script becomes once the fix is applied.';

/** One section of part 8, from its heading to the next one. */
export function sectionsOf(text) {
  const sections = new Map();
  const heads = [...text.matchAll(/^### (OS\d{4}) (.*)$/gm)];
  for (let i = 0; i < heads.length; i += 1) {
    const start = heads[i].index;
    const end = i + 1 < heads.length ? heads[i + 1].index : text.length;
    sections.set(heads[i][1], {
      title: heads[i][2],
      text: text.slice(start, end),
      line: text.slice(0, start).split('\n').length,
    });
  }
  return sections;
}

/** The first line of a section, which carries everything but the prose. */
const headerOf = (section) => /^Severity .*$/m.exec(section)?.[0];

/** A bolded paragraph of a section: `**Cause.** ...` up to the blank line. */
function paragraph(section, label) {
  const found = new RegExp(`\\*\\*${label}\\.\\*\\* ([\\s\\S]*?)\\n\\n`).exec(section);
  return found === null ? undefined : found[1];
}

/** The line a section prints for one placeholder. */
const glossOf = (key, description) => `- \`{${key}}\` is ${description}.`;

/** The header line an entry's fields say the page should print. */
function headerFor(entry, stageLabels) {
  const test = entry.test === null ? NO_TEST : `Test \`${entry.test}\`.`;
  return (
    `Severity ${entry.severity}. Stage ${stageLabels[entry.stage] ?? entry.stage}. ` +
    `Since language version ${entry.since}. Reference ${entry.spec}. ${test}` +
    (entry.autofix === true ? ` ${AUTOFIX}` : '')
  );
}

/**
 * One whole part 8 section, written from one entry.
 *
 * In the order every section prints: the heading, the first line, the deferral
 * or the unexercised sentence where the entry has one, the host input paragraph
 * where the example is a transcript or the imported source one where it is a
 * script in the source dialect, the message and its placeholders, the
 * cause, the fix, and the two blocks. Markdown, because it is the text of
 * `errors.md` and the site renders it with the same renderer as that page.
 */
export function sectionFor(entry, stageLabels) {
  const parts = [`### ${entry.code} ${entry.title}`, headerFor(entry, stageLabels)];
  if (entry.deferred != null) parts.push(`**Deferred.** ${entry.deferred}`);
  if (entry.unexercised != null) parts.push(`**Not exercised.** ${entry.unexercised}`);
  if (entry.example?.kind === 'transcript') parts.push(HOST_INPUT);
  if (entry.example?.kind === 'import') parts.push(IMPORTED);
  parts.push(`**Message.** \`${entry.message}\``);
  const glosses = Object.entries(entry.placeholders ?? {}).map(([key, text]) => glossOf(key, text));
  if (glosses.length > 0) parts.push(glosses.join('\n'));
  parts.push(`**Cause.** ${entry.cause}`, `**Fix.** ${entry.fix}`);
  for (const [label, block] of [
    ['Before:', entry.example?.before],
    ['After:', entry.example?.after],
  ]) {
    parts.push(label, `\`\`\`\n${block}\n\`\`\``);
  }
  return `${parts.join('\n\n')}\n`;
}

/**
 * A section as it stands on the page, without what follows the last entry of a
 * range: the rule under it and the next range's heading.
 */
function standing(text) {
  const trimmed = text.trimEnd().replace(/\n## [^\n]*$/, '').trimEnd();
  return `${trimmed.replace(/\n---$/, '').trimEnd()}\n`;
}

/**
 * One entry against its page.
 *
 * Returns the ways the two disagree, which is empty where they do not. Each
 * message quotes both sides, because the reader of a failure has to decide
 * which of the two is wrong and cannot do that from a difference alone.
 */
export function entryProblems(entry, sections, stageLabels, where) {
  const { prose = 'spec/errors.md', catalogue = 'spec/errors.json' } = where ?? {};
  const problems = [];
  const section = sections.get(entry.code);
  if (section === undefined) return problems; // The caller reports a missing page.

  const at = `${prose}:${section.line}: ${entry.code}`;
  const differs = (what, page, file) => {
    if (page === file) return;
    problems.push(
      `${at}'s ${what} is not what ${catalogue} holds. Part 8 is a copy of that file, and a copy ` +
        'that disagrees shows one sentence to a reader and another to a user.\n' +
        `    page:      ${JSON.stringify(page)}\n` +
        `    catalogue: ${JSON.stringify(file)}`,
    );
  };

  // A field holding a blank line would be two paragraphs on the page and one
  // capture here, so the comparison would fail with two strings that look alike
  // and no reason beside them. It is refused by name instead. No entry holds
  // one, and this is what says so if one ever does.
  for (const field of ['message', 'cause', 'fix', 'deferred', 'unexercised']) {
    if (typeof entry[field] !== 'string' || !entry[field].includes('\n')) continue;
    problems.push(
      `${catalogue}: ${entry.code}'s "${field}" holds a line break. Part 8 prints each of these ` +
        'as one paragraph and this check reads one paragraph back, so a field that is two cannot ' +
        'be compared. Write it as one paragraph, or teach this rule to read the rest.',
    );
  }

  differs('heading', section.title, entry.title);
  differs('first line', headerOf(section.text), headerFor(entry, stageLabels));
  differs('message', /\*\*Message\.\*\* `([^`]*)`/.exec(section.text)?.[1], entry.message);
  differs('cause', paragraph(section.text, 'Cause'), entry.cause);
  differs('fix', paragraph(section.text, 'Fix'), entry.fix);

  for (const [label, field] of [
    ['Deferred', 'deferred'],
    ['Not exercised', 'unexercised'],
  ]) {
    const printed = paragraph(section.text, label);
    const held = entry[field] ?? undefined;
    if (printed === undefined && held === undefined) continue;
    differs(`"${label}" sentence`, printed, held);
  }

  const glosses = [...section.text.matchAll(/^- `\{[^}]+\}` is .*$/gm)].map((one) => one[0]);
  const wanted = Object.entries(entry.placeholders ?? {}).map(([key, description]) =>
    glossOf(key, description),
  );
  if (glosses.length !== wanted.length) {
    differs('placeholder list', glosses.join(' / '), wanted.join(' / '));
  } else {
    for (let i = 0; i < wanted.length; i += 1) differs('placeholder line', glosses[i], wanted[i]);
  }

  // Every field agrees, so what is left to differ is what no field holds. Run
  // only then, because a changed cause would otherwise be reported twice, once
  // by name above and once here as a line that is not the rendering.
  if (problems.length > 0) return problems;
  const page = standing(section.text).split('\n');
  const rendered = sectionFor(entry, stageLabels).split('\n');
  const lines = Array.from({ length: Math.max(page.length, rendered.length) }, (_, i) => i);
  const first = lines.find((i) => page[i] !== rendered[i]);
  if (first !== undefined) {
    problems.push(
      `${prose}:${section.line + first}: ${entry.code}'s section is not the rendering of its entry ` +
        `in ${catalogue}, though every field compares equal. The site prints that rendering on the ` +
        "code's own page, so part 8 and the page would show a reader two texts. The first line " +
        'that differs:\n' +
        `    page:      ${JSON.stringify(page[first])}\n` +
        `    rendering: ${JSON.stringify(rendered[first])}`,
    );
  }
  return problems;
}

/**
 * Part 4's ranges table, which restates `ranges` and counts the entries.
 *
 * The count is the half that rots without anybody touching the table: an entry
 * is added to the file and the row that says how many there are stays where it
 * was. Both halves are compared.
 */
export function rangeProblems(catalogue, text, where) {
  const { prose = 'spec/errors.md', file = 'spec/errors.json' } = where ?? {};
  const problems = [];
  const block = /## 4\. The ranges\n([\s\S]*?)\n---/.exec(text);
  if (block === null) {
    problems.push(`${prose}: part 4's ranges table was not found, so nothing compared it.`);
    return problems;
  }
  const rows = [...block[1].matchAll(/^\| (OS\d)xxx \| (.*?) \| (.*?) \| (.*?) \| (\d+) \|$/gm)];
  const counts = new Map();
  for (const entry of catalogue.entries) {
    const prefix = entry.code.slice(0, 3);
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }

  if (rows.length !== catalogue.ranges.length) {
    problems.push(
      `${prose}: part 4 prints ${rows.length} ranges and ${file} declares ` +
        `${catalogue.ranges.length}. The table is a copy of that field.`,
    );
    return problems;
  }
  for (let i = 0; i < rows.length; i += 1) {
    const [, prefix, kind, means, severity, printed] = rows[i];
    const declared = catalogue.ranges[i];
    const wanted = [declared.prefix, declared.kind, declared.means, declared.severity];
    const got = [prefix, kind, means, severity];
    for (let part = 0; part < wanted.length; part += 1) {
      if (got[part] === wanted[part]) continue;
      problems.push(
        `${prose}: part 4's ${prefix}xxx row disagrees with ${file}.\n` +
          `    page:      ${JSON.stringify(got[part])}\n` +
          `    catalogue: ${JSON.stringify(wanted[part])}`,
      );
    }
    const held = counts.get(prefix) ?? 0;
    if (Number(printed) !== held) {
      problems.push(
        `${prose}: part 4 says ${prefix}xxx holds ${printed} entries and ${file} holds ${held}. ` +
          'A count nobody recomputes is the half of a table that rots first.',
      );
    }
  }

  const total = /^\| \| \| \| \*\*Total\*\* \| \*\*(\d+)\*\* \|$/m.exec(block[1]);
  if (total === null) {
    problems.push(`${prose}: part 4's table prints no total row.`);
  } else if (Number(total[1]) !== catalogue.entries.length) {
    problems.push(
      `${prose}: part 4's total is ${total[1]} and ${file} holds ${catalogue.entries.length} ` +
        'entries.',
    );
  }
  return problems;
}

/** Part 6's refinements table, which is the set of entries carrying `refines`. */
export function refinementProblems(catalogue, text, where) {
  const { prose = 'spec/errors.md', file = 'spec/errors.json' } = where ?? {};
  const problems = [];
  const block = /\*\*Refinements\.\*\*([\s\S]*?)\*\*Reassignments\.\*\*/.exec(text);
  if (block === null) {
    problems.push(`${prose}: part 6's refinements table was not found, so nothing compared it.`);
    return problems;
  }
  const printed = new Map(
    [...block[1].matchAll(/^\| (OS\d{4}) \| (OS\d{4}) \| .*? \|$/gm)].map((one) => [one[1], one[2]]),
  );
  const held = new Map(
    catalogue.entries.filter((one) => one.refines != null).map((one) => [one.code, one.refines]),
  );

  for (const [code, refines] of held) {
    if (!printed.has(code)) {
      problems.push(
        `${prose}: part 6 does not list ${code}, which ${file} records as refining ${refines}. ` +
          'That table is the whole of what a reader is told about a refinement, and an entry ' +
          'missing from it is a case a reader is never sent from the broader code to.',
      );
    } else if (printed.get(code) !== refines) {
      problems.push(
        `${prose}: part 6 says ${code} refines ${printed.get(code)} and ${file} says ${refines}.`,
      );
    }
  }
  for (const code of printed.keys()) {
    if (held.has(code)) continue;
    problems.push(
      `${prose}: part 6 lists ${code} as a refinement and ${file} records none for it. Set the ` +
        "entry's refines field, or take the row out.",
    );
  }
  return problems;
}

/**
 * Every rule above, given a case each must refuse and one each must accept.
 *
 * A rule whose pattern stops matching reports a clean tree, which is the failure
 * this repository has had five times. The cases are fabricated here rather than
 * taken from the catalogue, so that correcting the catalogue cannot silently
 * disarm the check. The codes are outside every declared range for the same
 * reason the other self tests' are.
 */
export function pageSelfTest() {
  const broken = [];
  const stageLabels = { check: 'checker' };
  const entry = {
    code: 'OS0001',
    title: 'A fabricated entry',
    severity: 'error',
    stage: 'check',
    since: 1,
    spec: 'nowhere.md 1',
    test: null,
    autofix: false,
    message: 'A message.',
    placeholders: { name: 'the name' },
    cause: 'A cause.',
    fix: 'A fix.',
    example: { before: 'a = 1', after: 'b = 1', kind: 'transcript' },
  };
  const blocks = 'Before:\n\n```\na = 1\n```\n\nAfter:\n\n```\nb = 1\n```\n';
  const page = (message, gloss, cause, over = {}) => {
    const reasons = [`**Cause.** ${cause}\n\n`, '**Fix.** A fix.\n\n'];
    if (over.swapped) reasons.reverse();
    return (
      `### OS0001 A fabricated entry\n\n` +
      `Severity error. Stage checker. Since language version 1. Reference nowhere.md 1. ${NO_TEST}\n\n` +
      `${over.host ?? HOST_INPUT}\n\n` +
      `**Message.** \`${message}\`\n\n` +
      `- \`{name}\` is ${gloss}.\n\n` +
      `${reasons.join('')}${blocks}${over.after ?? '\n'}`
    );
  };

  const ran = (text) => entryProblems(entry, sectionsOf(text), stageLabels).length;
  const cases = [
    ['a page that matches', page('A message.', 'the name', 'A cause.'), 0],
    ['a message changed by one word', page('A messages.', 'the name', 'A cause.'), 1],
    ['a placeholder gloss changed', page('A message.', 'the title', 'A cause.'), 1],
    ['a cause changed', page('A message.', 'the name', 'Another cause.'), 1],
    ['the last section of a range', page('A message.', 'the name', 'A cause.', { after: '\n---\n\n## 8.2 Next\n\n' }), 0],
    ['the host input paragraph changed', page('A message.', 'the name', 'A cause.', { host: '**Host input.** A script.' }), 1],
    ['the cause printed after the fix', page('A message.', 'the name', 'A cause.', { swapped: true }), 1],
  ];
  for (const [what, text, wanted] of cases) {
    const found = ran(text);
    if (found !== wanted) broken.push(`${what}: ${found} reported, ${wanted} expected`);
  }
  const imported = { ...entry, example: { ...entry.example, kind: 'import' } };
  const ranImported = (text) => entryProblems(imported, sectionsOf(text), stageLabels).length;
  if (ranImported(page('A message.', 'the name', 'A cause.', { host: IMPORTED })) !== 0) {
    broken.push('an imported source paragraph that matches');
  }
  if (ranImported(page('A message.', 'the name', 'A cause.')) !== 1) {
    broken.push('the host input paragraph printed for an imported example');
  }

  const catalogue = {
    ranges: [{ prefix: 'OS0', kind: 'K', means: 'M', severity: 'error' }],
    entries: [{ code: 'OS0001', refines: 'OS0002' }],
  };
  const table =
    '## 4. The ranges\n\n| OS0xxx | K | M | error | 1 |\n| | | | **Total** | **1** |\n\n---\n';
  if (rangeProblems(catalogue, table).length !== 0) broken.push('a ranges table that matches');
  const wrong = table.replace('| error | 1 |', '| error | 2 |');
  if (rangeProblems(catalogue, wrong).length !== 1) broken.push('a ranges count that does not');

  const refined = '**Refinements.**\n\n| OS0001 | OS0002 | A case |\n\n**Reassignments.**\n';
  if (refinementProblems(catalogue, refined).length !== 0) broken.push('a refinement that matches');
  const missing = '**Refinements.**\n\n| Code | Refines | Case |\n\n**Reassignments.**\n';
  if (refinementProblems(catalogue, missing).length !== 1) broken.push('a refinement left out');

  return broken;
}
