/**
 * Catalogue example check: the fix a reader is handed compiles, and the mistake
 * it is about really raises the code it is filed under.
 *
 * `spec/errors.json` carries a worked example per entry: a `before` block
 * holding the mistake and an `after` block holding the fix. The after block is
 * read at the one moment a reader is stuck, and it is read as authoritative
 * because everything around it is. They paste it.
 *
 * Nothing in this repository ever put one through the compiler. That is how
 * OS7009's fix came to call a function the language does not have, be cited in
 * five documents, and sit there being read; and how OS7012's fix came to name
 * `session.isOpen`, which is planned. Neither was a typo. They were sentences
 * that no machine had an opinion about, which is the same shape as every other
 * defect this repository has had.
 *
 * ## What it proves, in three sizes
 *
 * **Every after block compiles.** The fix goes through the whole front end, to
 * the program a host is handed, and any diagnostic fails the build: an error
 * because the reader's paste would be refused, a warning because the reader's
 * paste would be complained about by the compiler that just told them what to
 * do. Two warnings are the exception and they are the ones that say the block
 * stopped rather than that it is wrong: OS8010, a name the fragment declares
 * and does not go on to read, and OS8018, an input it does not go on to use. A
 * fragment always ends one line before the line that would use its last value.
 * Neither is tolerated for the entry that is about it.
 *
 * **Every before block raises its own code, where the code can be reached.** A
 * compile settles a lex, parse or check code. A runtime code needs a run, so
 * the program is loaded on a host and driven over a dataset, on two venues. The
 * step `scripts/check-raises.mjs` describes in its own header and does not take
 * is this one: it holds an entry to the case its own example names rather than
 * to the directory its stage lives in.
 *
 * **What it cannot reach, it says and counts.** Three states, each declared on
 * the entry where a reader meets it and never in a list here:
 *
 *   - `deferred`, which already means nothing raises the code yet.
 *   - `unexercised`, a sentence saying why this code cannot be reached from its
 *     own example: a ceiling of a million elements is not a run, it is a
 *     fortnight. Both of those expire by themselves, because an entry that
 *     carries one and is then proved fails the build.
 *   - `example.kind` of `"transcript"`, for the entries whose example is the
 *     host input that fails and the host input that passes rather than source,
 *     which `errors.md` section 1 has always allowed. A transcript is held to
 *     the opposite rule: a block declared not to be source that compiles fails,
 *     so the field cannot be used to take an example out of this check.
 *
 * **Every fix names something a script may write, and shows its worked forms.**
 * The blocks are what a reader looks at and the fix is what they act on, and the
 * sentence was the half nothing read: OS7009's told a reader to call a planned
 * function, and OS3003's handed out a form its own block had been edited away
 * from. Two rules, both narrow, both answered by the compiler rather than by a
 * list, and `lib/fix-sentence.mjs` says at length what they do not cover.
 *
 * And a fourth that is not declared anywhere because it follows from the
 * entry's own `stage`: a host code is the host's answer to the engine, and this
 * harness drives one host. Those are counted and listed, every run, and the
 * summary says how many entries were proved and how many were only compiled. A
 * check that silently skips what it cannot do is the failure this repository
 * has already had four times: a check that inspected zero files while printing
 * that it passed.
 *
 * Run: node scripts/check-examples-compile.mjs [--list]
 * Needs `npm run build` and `npm run build:test` first: it runs the compiler and
 * the engine rather than reading them.
 */
import { existsSync, readFileSync } from 'node:fs';
import { CORE_MODULE, EMITTER_MODULE, TEST_HOSTS_MODULE, fromRoot } from './lib/built.mjs';
import { isConventional, programFor } from './lib/example-context.mjs';
import { fixProblems, fixSelfTest } from './lib/fix-sentence.mjs';
import { BAR_COUNT, VENUES, harnessWith } from './lib/example-run.mjs';

const CATALOGUE = 'spec/errors.json';

/**
 * The two warnings a fragment produces by being a fragment.
 *
 * Both say the same thing: the block stops before the line that would use what
 * it just made. A reader's own script goes on; the catalogue's cannot, because
 * the next line would be about something other than the code they are stuck on.
 * Neither is tolerated for the entry it is about, so OS8010's own after block
 * still has to be a block that reads what it declares.
 */
const FRAGMENT_WARNINGS = new Set(['OS8010', 'OS8018']);

/** How many passes of binding a block gets before the harness gives up. */
const BINDING_PASSES = 4;

/**
 * Shorter than this is a flag rather than a reason, whatever it says.
 *
 * The same length `check-raises.mjs` holds a deferral to, and for the same
 * reason: a field that can be filled with "n/a" is the exemption list this
 * check refuses to have, moved into the specification where it looks official.
 */
const REASON_LENGTH = 40;
const isReason = (text) =>
  typeof text === 'string' && text.trim().length >= REASON_LENGTH && text.trim().endsWith('.');

const problems = [];
const fail = (message) => problems.push(message);

// ---------------------------------------------------------------- the modules

const CORE = fromRoot(CORE_MODULE);
const HOSTS = fromRoot(TEST_HOSTS_MODULE);

if (!existsSync(CORE) || !existsSync(HOSTS)) {
  console.error(
    `${existsSync(CORE) ? HOSTS : CORE} is not built, so this check would inspect nothing.\n` +
      'Run `npm run build` and `npm run build:test` first. This check runs the compiler and the\n' +
      'engine rather than reading them, because what it is about is what a reader is handed.',
  );
  process.exit(1);
}

const core = await import(CORE_MODULE);
const emitter = await import(EMITTER_MODULE);
const hosts = await import(TEST_HOSTS_MODULE);
const surface = await import('../dist/core/check/surface.js');

const { compile, runEverywhere } = harnessWith(core, emitter, hosts);

// ------------------------------------------------------------- one block, built

/**
 * A block, compiled inside the program a fragment is a fragment of.
 *
 * The free names are discovered rather than declared: the block is compiled,
 * every name the checker reported as undefined that the fixture knows is bound,
 * and the whole thing is compiled again until the set stops growing. A name the
 * fixture does not know stays undefined, which is what reports it.
 */
function built(block) {
  const options = {
    free: [],
    orderNames: surface.ORDER_NAMES,
    strategyNamespaces: surface.STRATEGY_NAMESPACES,
  };
  let program = programFor(block, options);
  let out = compile('example.oscript', program.text);

  for (let pass = 0; pass < BINDING_PASSES; pass += 1) {
    const undefinedNames = out.diagnostics
      .filter((one) => one.code === 'OS2001')
      .map((one) => String(one.values.name))
      .filter(isConventional);
    const free = [...new Set([...options.free, ...undefinedNames])];
    if (free.length === options.free.length) break;
    options.free = free;
    program = programFor(block, options);
    out = compile('example.oscript', program.text);
  }
  return { program, out };
}

/**
 * One block compiled inside the fragment program, for the fix rules to read.
 *
 * The same `programFor` the two block rules use, so a name is asked about in the
 * file a fragment is a fragment of: an order function needs a strategy header
 * around it, and asking without one would answer OS7001 for every one of them.
 */
function ask(block) {
  const program = programFor(block, {
    free: [],
    orderNames: surface.ORDER_NAMES,
    strategyNamespaces: surface.STRATEGY_NAMESPACES,
  });
  return compile('probe.oscript', program.text).diagnostics;
}

const FIX_RULES = { ask, namespaces: surface.NAMESPACES, cache: new Map() };

/** A diagnostic as the report names it, with the line inside the block. */
function at(diagnostic, offset) {
  const line = diagnostic.span.line - offset;
  const where = line > 0 ? `line ${line} of the block` : 'a line the harness added';
  return `${diagnostic.code} at ${where}, column ${diagnostic.span.column}: ${diagnostic.message}`;
}

// ------------------------------------------------------------------- the rules

/**
 * Rule 1. The fix compiles.
 *
 * Returns what is wrong with one after block, and the warnings it was allowed,
 * so the summary can say how many blocks ended one line short of using what
 * they declared rather than pretending every one of them was spotless.
 */
function afterProblems(entry) {
  const { program, out } = built(entry.example.after);
  const kept = [];
  const tolerated = [];
  for (const diagnostic of out.diagnostics) {
    if (FRAGMENT_WARNINGS.has(diagnostic.code) && diagnostic.code !== entry.code) {
      tolerated.push(diagnostic.code);
      continue;
    }
    kept.push(at(diagnostic, program.offset));
  }
  if (kept.length === 0 && out.program === undefined) {
    kept.push('the emitter produced no program and said nothing, which is a defect in it');
  }
  return { kept, tolerated };
}

/**
 * Rule 2. The mistake raises the code it is filed under.
 *
 * The block is compiled as written first. Several entries are about a line the
 * file is missing, and this harness supplies that line to a block that has
 * none, so wrapping OS2007's example in a declaration would report the entry
 * that is about a missing declaration as raising nothing. Both forms are honest
 * readings of the fragment, and the report says which one proved it.
 */
function proofFor(entry) {
  const saw = new Set();
  const asWritten = compile('example.oscript', entry.example.before);
  for (const one of asWritten.diagnostics) saw.add(one.code);
  if (saw.has(entry.code)) return { how: 'compiled as written', saw };

  const { out } = built(entry.example.before);
  for (const one of out.diagnostics) saw.add(one.code);
  if (saw.has(entry.code)) return { how: 'compiled in a program', saw };

  if (out.program === undefined) return { how: null, saw };

  let found;
  try {
    found = runEverywhere(out.program);
  } catch (error) {
    fail(
      `${CATALOGUE}: running ${entry.code}'s before block threw ${String(error && error.message)}. ` +
        'The engine returns a refusal as a value and throws nothing, so an exception out of a run ' +
        'is a defect in the engine rather than in the example.',
    );
    return { how: null, saw };
  }
  for (const one of found) saw.add(one.code);
  const hit = found.find((one) => one.code === entry.code);
  return hit === undefined ? { how: null, saw } : { how: `run on ${VENUES[hit.venue]}`, saw };
}

/** What a before block did instead of what it claims, for a failure message. */
function instead(saw, code) {
  const others = [...saw].filter((one) => one !== code);
  return others.length === 0
    ? 'It raises nothing at all, on either venue'
    : `It raises ${others.join(', ')} and not ${code}`;
}

// -------------------------------------------------------------- the self test

/**
 * Both rules, attacked before they are trusted.
 *
 * Each rule is given a case it must refuse and a case it must accept, every
 * run. A rule that can no longer match anything reports a clean tree, and this
 * repository has already shipped a pattern that could never match and reported
 * success for a year. The cases are written here rather than taken from the
 * catalogue so that fixing the catalogue cannot silently disarm the check.
 */
function selfTest() {
  const broken = [];

  const refused = afterProblems({
    code: 'OS0000',
    example: { after: 'plot(nosuchCall(close), "X", aqua)' },
  });
  if (refused.kept.length === 0) {
    broken.push('the after rule accepted a block calling a name the library does not have');
  }
  const accepted = afterProblems({
    code: 'OS0000',
    example: { after: 'plot(ema(close, 9), "Fast", aqua)' },
  });
  if (accepted.kept.length !== 0) {
    broken.push(`the after rule refused a block that compiles: ${accepted.kept.join('; ')}`);
  }

  const proved = proofFor({ code: 'OS1001', stage: 'lex', example: { before: 'if !ready\n    x = 1' } });
  if (proved.how === null) broken.push('the before rule could not prove OS1001 from a stray !');
  const unproved = proofFor({
    code: 'OS1001',
    stage: 'lex',
    example: { before: 'plot(close, "Close", aqua)' },
  });
  if (unproved.how !== null) {
    broken.push('the before rule proved OS1001 from a block that has no such character in it');
  }

  for (const one of fixSelfTest(FIX_RULES)) broken.push(one);

  if (broken.length === 0) return;
  console.error(
    'The rules in this file no longer do what they say:\n\n' +
      broken.map((line) => `  ${line}`).join('\n') +
      '\n\nA rule that can no longer fail is indistinguishable from a clean catalogue.',
  );
  process.exit(1);
}

selfTest();

// ------------------------------------------------------------------- the run

const catalogue = JSON.parse(readFileSync(CATALOGUE, 'utf8'));
const entries = catalogue.entries ?? [];
if (entries.length === 0) {
  console.error(`${CATALOGUE} holds no entries. Run this from the repository root.`);
  process.exit(1);
}

const counted = {
  compiled: 0,
  tolerated: 0,
  byCompile: 0,
  byRun: 0,
  deferred: 0,
  unexercised: 0,
  transcript: 0,
  host: [],
  fixNames: 0,
  fixWorked: 0,
  fixUncompared: [],
};
const listing = [];

for (const entry of entries) {
  const example = entry.example ?? {};
  const isTranscript = example.kind === 'transcript';

  // The fix rules run over every entry, a transcript included: a transcript's
  // example is host input rather than source and its fix is still a fix.
  const sentence = fixProblems(entry, FIX_RULES);
  counted.fixNames += sentence.named;
  if (sentence.uncompared) counted.fixUncompared.push(entry.code);
  else if (sentence.worked > 0) counted.fixWorked += 1;
  for (const one of sentence.problems) fail(`${CATALOGUE}: ${one}`);

  if (isTranscript) {
    counted.transcript += 1;
    listing.push(`transcript  ${entry.code}  ${entry.stage}`);
    // The one thing a transcript is held to, so that the field cannot be used
    // to take a compiling example out of this check: it must really not be
    // source. The after block is the one to ask, because an after block is the
    // one block that is supposed to compile. Asking the before block would
    // prove nothing: a before block holds a mistake, so it is refused whether
    // it is a script or a page of host input.
    if (afterProblems(entry).kept.length === 0) {
      fail(
        `${CATALOGUE}: ${entry.code}'s example declares kind "transcript", and its after block ` +
          'compiles. A transcript is the host input that fails and the host input that passes, ' +
          'not a script, and this field is not a way out of this check. Drop the kind, and the ' +
          'example is compiled and proved like every other.',
      );
    }
    continue;
  }

  const after = afterProblems(entry);
  counted.compiled += 1;
  counted.tolerated += after.tolerated.length;
  for (const one of after.kept) {
    fail(
      `${CATALOGUE}: ${entry.code}'s after block does not compile clean: ${one}\n  The after block ` +
        'is the fix a reader is handed at the moment they are stuck, and they paste it. Correct ' +
        'the example, or correct the compiler if the example is what the specification allows.',
    );
  }

  const proof = proofFor(entry);
  const deferred = entry.deferred !== undefined && entry.deferred !== null;
  const unexercised = entry.unexercised !== undefined && entry.unexercised !== null;

  if (deferred && unexercised) {
    fail(
      `${CATALOGUE}: ${entry.code} carries both "deferred" and "unexercised". They are different ` +
        'sentences: the first says nothing raises the code yet, the second says nothing an example ' +
        'can hold reaches it. One of the two is the reason, and carrying both leaves a reader ' +
        'guessing which.',
    );
  }

  if (unexercised && !isReason(entry.unexercised)) {
    fail(
      `${CATALOGUE}: ${entry.code}'s "unexercised" is not a reason. It has to be a sentence of at ` +
        `least ${REASON_LENGTH} characters ending in a full stop, saying what the code needs that ` +
        'an example cannot carry. A field nobody can act on is the exemption list this check ' +
        'refuses to have, moved into the specification.',
    );
  }

  if (deferred || unexercised) {
    const field = deferred ? 'deferred' : 'unexercised';
    if (proof.how === null) {
      counted[deferred ? 'deferred' : 'unexercised'] += 1;
      listing.push(`${field.padEnd(11)} ${entry.code}  ${entry.stage}`);
      continue;
    }
    fail(
      `${CATALOGUE}: ${entry.code} carries "${field}" and its before block raises the code ` +
        `(${proof.how}). The field says a reader cannot meet this refusal, and they can. Remove ` +
        'it: the entry is now an entry like any other, and this check proves it every run.',
    );
    continue;
  }

  if (proof.how !== null) {
    if (proof.how.startsWith('run')) counted.byRun += 1;
    else counted.byCompile += 1;
    listing.push(`proved      ${entry.code}  ${entry.stage.padEnd(7)} ${proof.how}`);
    continue;
  }

  if (entry.stage === 'host') {
    counted.host.push(entry.code);
    listing.push(`host        ${entry.code}  ${entry.stage}`);
    continue;
  }

  fail(
    `${CATALOGUE}: ${entry.code}'s before block does not raise ${entry.code}. ` +
      `${instead(proof.saw, entry.code)}, so the example teaches a refusal under the wrong ` +
      'number and a reader who reproduces it meets a different diagnostic. Correct the example, ' +
      'the implementation, or say in an "unexercised" sentence why the code cannot be reached ' +
      'from an example at all.',
  );
}

if (process.argv.includes('--list')) for (const line of listing) console.log(line);

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(
    `\n${problems.length} problem${problems.length === 1 ? '' : 's'}. A worked example nothing ` +
      'compiles is a promise nothing keeps, and it is read at the one moment a reader has no way ' +
      'to check it.',
  );
  process.exit(1);
}

const proved = counted.byCompile + counted.byRun;
console.log(
  `Fix sentence check passed: ${counted.fixNames} names written across ${entries.length} fix ` +
    'sentences are names a script may write today and is not planned, each asked of the ' +
    `compiler rather than of a list; and ${counted.fixWorked} of those sentences write a call ` +
    "out with a reader's own values in it, every one of which is a call its own after block " +
    'shows.',
);
if (counted.fixUncompared.length > 0) {
  console.log(
    `
${counted.fixUncompared.length} more write one out and were not compared, because the ` +
      "entry's after block writes no call at all for it to be compared against: " +
      `${counted.fixUncompared.join(', ')}. Each of those offers a reader two remedies and ` +
      'demonstrates the one that is not a call.',
  );
}

console.log(
  `Example compile check passed: ${counted.compiled} after blocks compile with no diagnostic ` +
    `(${counted.tolerated} ended one line short of reading what they declared, which is OS8010 ` +
    `and OS8018 and is what a fragment does), ${proved} before blocks raise their own code ` +
    `(${counted.byCompile} settled by a compile, ${counted.byRun} by a run over ${BAR_COUNT} bars ` +
    `on ${VENUES.length} venues), ${counted.deferred} are deferred, ${counted.unexercised} say in ` +
    `an "unexercised" sentence why their code cannot be reached from an example, and ` +
    `${counted.transcript} are host input rather than source and compile as none.`,
);

if (counted.host.length > 0) {
  console.log(
    `\n${counted.host.length} entries were compiled and run and did not raise their own code, ` +
      `and all ${counted.host.length} are host stage: ${counted.host.join(', ')}.\n` +
      'A host code is the host\'s answer to the engine, not the script\'s mistake: a read it ' +
      'refuses, a budget it will not spend, an instrument fact it does not hold, a venue that ' +
      'rejects. This harness drives one host that answers everything the ordinary way, so it ' +
      'compiles these examples and cannot make them fail. They are not proved, and counting them ' +
      'as proved is the one thing this check must never do.',
  );
}
