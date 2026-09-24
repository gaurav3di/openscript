/**
 * The worked examples of the importer's codes, proved by the importer.
 *
 * Every other entry's before block is OpenScript, so the compiler is the thing
 * that can say whether it raises its code. An OS9xxx entry is about a script in
 * another chart language, and the compiler has nothing to say about one: put
 * through it, a before block of that language raises a page of unrelated names,
 * and none of them is the code the entry is filed under. So the example says
 * what it is, `kind` of `"import"`, and its before block is proved by the one
 * thing that reads that language, the importer, which has to report the code.
 * Its after block is the OpenScript that script becomes once the fix is applied,
 * and it is compiled like every other after block.
 *
 * This is the third kind an example can be, beside source and `transcript`, and
 * it is held to both directions so that it cannot become a way out of the
 * check. An entry of the import stage must declare the kind, so an importer
 * code cannot be quietly proved against the compiler instead. And the kind is
 * refused on any other stage, so an OpenScript example cannot be declared
 * foreign to skip the compile.
 */

export const IMPORT_KIND = 'import';
export const IMPORT_STAGE = 'import';

/** Whether an entry is the importer's, by either of the two fields that say so. */
export function isImported(entry) {
  return entry.stage === IMPORT_STAGE || entry.example?.kind === IMPORT_KIND;
}

/**
 * What is wrong with one importer entry's example, as sentences.
 *
 * `importScript` is the built package's importer, handed in rather than loaded
 * here for the reason `example-run.mjs` gives: a dynamic load resolves against
 * the file doing the loading.
 */
export function importProblems(entry, importScript) {
  const problems = [];
  const example = entry.example ?? {};
  if (entry.stage !== IMPORT_STAGE || example.kind !== IMPORT_KIND) {
    problems.push(
      `${entry.code} has stage "${entry.stage}" and example kind "${example.kind}". An importer ` +
        `code's example is a script in another chart language and says so with kind ` +
        `"${IMPORT_KIND}", and no other stage's example may: the kind decides whether the importer ` +
        'or the compiler proves the before block, and a mismatch proves it with the wrong one.',
    );
    return problems;
  }
  const { findings } = importScript(example.before ?? '');
  if (!findings.some((one) => one.code === entry.code)) {
    const saw = [...new Set(findings.map((one) => one.code))];
    problems.push(
      `${entry.code}'s before block, put through the importer, raises ` +
        `${saw.length === 0 ? 'nothing' : saw.join(', ')} and not ${entry.code}. The example ` +
        'teaches a finding under the wrong number. Correct the example or the importer.',
    );
  }
  return problems;
}

/** The rule above, given a block it must prove and one it must not, every run. */
export function importSelfTest(importScript) {
  const broken = [];
  const entry = (before) => ({
    code: 'OS9003',
    stage: IMPORT_STAGE,
    example: { kind: IMPORT_KIND, before, after: '' },
  });
  const unmapped = '//@version=5\nindicator("X")\nplot(ta.nosuchcall(close))\n';
  const mapped = '//@version=5\nindicator("X")\nplot(close)\n';
  if (importProblems(entry(unmapped), importScript).length !== 0) {
    broken.push('the import rule refused a before block that raises its code');
  }
  if (importProblems(entry(mapped), importScript).length === 0) {
    broken.push('the import rule accepted a before block that raises nothing');
  }
  const compiled = { code: 'OS1001', stage: 'lex', example: { kind: IMPORT_KIND, before: '', after: '' } };
  if (importProblems(compiled, importScript).length === 0) {
    broken.push('the import rule accepted the import kind on an entry of another stage');
  }
  return broken;
}
