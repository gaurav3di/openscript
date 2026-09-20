/**
 * The performance gate.
 *
 * Performance regresses silently. Nobody writes a commit that says "and this
 * makes every bar twenty percent dearer", and a platform that finds it in
 * production does not adopt the next version. So this is a gate and not a
 * report: every measurement has a budget, exceeding one fails the build, and the
 * failure names the measurement and how far it moved.
 *
 * What is measured, how a number is taken and which number is allowed all live
 * in `tests/bench`, behind its index, where they are typed and tested. This file
 * spawns, collects, prints and sets an exit code, and knows nothing else.
 *
 * ## One process per measurement, which is not tidiness
 *
 * The first draft ran all six in one process and the heavy history measurement
 * came out at 1.2 seconds, then 1.8, then 3.9, on identical work. It was
 * collecting the garbage of the measurements before it. Measured alone it is
 * 1.2 seconds every time. A benchmark whose number depends on what ran before it
 * cannot be compared against a number recorded last month, so each measurement
 * gets its own process and its own heap.
 *
 * ## What is done about a noisy runner
 *
 * A shared runner is descheduled by whatever else is on the box. Three things
 * answer that, and the first two are in `tests/bench/timing.ts`: warm-up
 * repetitions are discarded, and the reported number is the median of several
 * rather than one timing, so a single stall moves it by nothing. The third is
 * here: a measurement that exceeds its budget is run again from a new process,
 * and the build is failed on the better of the two rounds. Two independent
 * medians both landing three times over is not a runner having a bad second, and
 * a genuine regression is over the line in both.
 *
 * Run: node scripts/bench.mjs             the gate
 *      node scripts/bench.mjs --record    the same numbers, nothing failed
 *      node scripts/bench.mjs --only NAME one measurement
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { insistOnRefusing, refusingArgs, refusingEnv } from './lib/runtime.mjs';

insistOnRefusing();

/**
 * The harness, written down once and loaded by that name.
 *
 * A module specifier is a literal or a name holding one, and nothing else: see
 * the note on written down against built in `lib/no-eval-rules.mjs`. It resolves
 * against this file either way, which is why the path here and the path the
 * existence check uses are the same fact rather than two.
 */
const HARNESS = '../dist-test/tests/bench/index.js';
const HARNESS_PATH = fileURLToPath(new URL(HARNESS, import.meta.url));
const SELF = fileURLToPath(import.meta.url);

if (!existsSync(HARNESS_PATH)) {
  console.error(
    'The benchmark has not been built. It is TypeScript in tests/bench, compiled with\n' +
      'the rest of the tests, so run `npm run test:unit` or `npm test` first.\n' +
      'Refusing to report numbers for a build that is not there.',
  );
  process.exit(1);
}

const harness = await import(HARNESS);
const { MEASUREMENTS, breachLine, measurementNamed, quote, sample, spread, suggestBudget, verdictFor } =
  harness;

const args = process.argv.slice(2);

/** The child: one measurement, one line of JSON, nothing else on stdout. */
function measureOne(name) {
  const measurement = measurementNamed(name);
  if (measurement === undefined) {
    console.error(`No measurement is called ${name}.`);
    process.exit(1);
  }
  const reading = sample(measurement);
  process.stdout.write(
    `${JSON.stringify({
      name: reading.name,
      unit: reading.unit,
      median: reading.median,
      low: reading.low,
      high: reading.high,
      spread: spread(reading),
      work: reading.work,
      proof: reading.proof,
    })}\n`,
  );
}

const measureAt = args.indexOf('--measure');
if (measureAt !== -1) {
  measureOne(args[measureAt + 1]);
  process.exit(0);
}

/** The parent: one child per measurement, so no heap is shared. */
function readingFor(name) {
  const child = spawnSync(process.execPath, refusingArgs([SELF, '--measure', name]), {
    encoding: 'utf8',
    env: refusingEnv(),
    maxBuffer: 8 * 1024 * 1024,
  });
  if (child.status !== 0) {
    console.error(`\n${name} could not be measured.`);
    if (child.stderr) console.error(child.stderr.trim());
    if (child.stdout) console.error(child.stdout.trim());
    process.exit(1);
  }
  const lines = child.stdout.trim().split('\n');
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    console.error(`\n${name} produced something that is not a reading:\n${child.stdout}`);
    process.exit(1);
  }
}

/** A verdict, with a readable message when a measurement has no budget yet. */
function verdictOrExit(name, measured) {
  try {
    return verdictFor(name, measured);
  } catch (thrown) {
    console.error(`\n${thrown instanceof Error ? thrown.message : String(thrown)}`);
    console.error('Take its number with `node scripts/bench.mjs --record` and add the entry.');
    process.exit(1);
  }
}

const record = args.includes('--record');
const onlyAt = args.indexOf('--only');
const wanted =
  onlyAt === -1 ? MEASUREMENTS : MEASUREMENTS.filter((one) => one.name === args[onlyAt + 1]);

if (wanted.length === 0) {
  console.error(`No measurement is called ${args[onlyAt + 1]}.`);
  process.exit(1);
}

/** Pads a column so the table lines up without a dependency to do it. */
const pad = (text, width) => String(text).padEnd(width);
const padLeft = (text, width) => String(text).padStart(width);

const nameWidth = Math.max(...wanted.map((one) => one.name.length), 13);

/**
 * Recording prints no verdict, and not only to keep the output short.
 *
 * A measurement being added for the first time has no budget yet, and asking
 * for one is an error rather than a shrug, by design. So recording asks nothing
 * about budgets: it takes the numbers and suggests what each one earns, and the
 * person adding it writes the entry with the reason beside it.
 */
console.log('');
console.log(
  record
    ? `${pad('measurement', nameWidth)}  ${padLeft('median', 12)}  ${padLeft('spread', 8)}  ` +
        `${padLeft('suggested', 12)}   what one repetition did`
    : `${pad('measurement', nameWidth)}  ${padLeft('median', 12)}  ${padLeft('budget', 12)}  ` +
        `${padLeft('of budget', 10)}  ${padLeft('of recorded', 12)}  ${padLeft('spread', 8)}`,
);
console.log('-'.repeat(nameWidth + (record ? 52 : 62)));

const breached = [];
const readings = [];

for (const measurement of wanted) {
  const reading = readingFor(measurement.name);
  readings.push(reading);

  if (record) {
    console.log(
      `${pad(measurement.name, nameWidth)}  ${padLeft(quote(reading.median, reading.unit), 12)}  ` +
        `${padLeft(`${(reading.spread * 100).toFixed(0)}%`, 8)}  ` +
        `${padLeft(quote(suggestBudget(reading.median), reading.unit), 12)}   ` +
        `${reading.work} ${reading.proof}`,
    );
    continue;
  }

  const verdict = verdictOrExit(measurement.name, reading.median);

  // A breach is measured again, in a new process, and the build is failed on the
  // better of the two rounds. One median landing three times over is a runner
  // having a bad second; two independent ones are not. Taking the better one
  // rather than the later one is not generosity: the confirmation round is as
  // able to be the noisy one, and this measurement was seen at twice its usual
  // figure in a confirmation round while an unrelated build was running on the
  // same machine. A code path that is genuinely over budget is over in both.
  const confirmed = verdict.over
    ? verdictOrExit(measurement.name, readingFor(measurement.name).median)
    : undefined;
  const settled =
    confirmed === undefined || confirmed.measured > verdict.measured ? verdict : confirmed;

  console.log(
    `${pad(measurement.name, nameWidth)}  ${padLeft(quote(reading.median, reading.unit), 12)}  ` +
      `${padLeft(quote(verdict.budget.budget, reading.unit), 12)}  ` +
      `${padLeft(`${verdict.used.toFixed(2)}x`, 10)}  ` +
      `${padLeft(`${verdict.against.toFixed(2)}x`, 12)}  ` +
      `${padLeft(`${(reading.spread * 100).toFixed(0)}%`, 8)}` +
      (confirmed === undefined ? '' : `  second round ${quote(confirmed.measured, reading.unit)}`),
  );

  if (settled.over) breached.push(settled);
  else if (confirmed !== undefined) {
    console.log(
      `  ${measurement.name} was over on one round and inside its budget on the other, ` +
        'so this is the runner rather than the code.',
    );
  }
}

console.log('');
console.log(
  wanted.length === 1
    ? 'Taken in a process of its own: the median of the kept repetitions, warm-ups discarded.'
    : `Taken in ${wanted.length} separate processes, each the median of its kept repetitions, ` +
        'warm-ups discarded.',
);

if (record) {
  console.log('');
  console.log(
    'Recorded, not gated. Each of these goes into tests/bench/budgets.ts as a recorded\n' +
      'median and a budget, with the reason that number is the right one to protect.',
  );
  for (const taken of readings) {
    console.log(
      `  ${taken.name}: recorded ${Number(taken.median.toPrecision(3))}, ` +
        `budget ${suggestBudget(taken.median)}`,
    );
  }
  process.exit(0);
}

if (breached.length > 0) {
  const many = breached.length !== 1;
  console.error('');
  console.error(
    `${breached.length} measurement${many ? 's' : ''} exceeded ${many ? 'their budgets' : 'its budget'}, twice.`,
  );
  for (const verdict of breached) console.error(`\n  ${breachLine(verdict)}`);
  console.error(
    '\nIf the cost is intended, re-record the baseline with `node scripts/bench.mjs --record`\n' +
      'and say in the change what got dearer and why. Raising a budget on its own hides the size of it.',
  );
  process.exit(1);
}

console.log('Every measurement is inside its budget.');
