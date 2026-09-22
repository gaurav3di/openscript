/**
 * The Python arm of the gate: an interpreter, a package that depends on
 * nothing, and the engine's own tests.
 *
 * This is to the second engine what `check-layering.mjs` is to the first, and
 * it answers the same question in the same shape. That check says the shipped
 * JavaScript cannot reach a virtual machine, a worker or a child process,
 * because it cannot import one. This one says the shipped Python imports
 * nothing but the standard library, and not the parts of the standard library
 * that would make a run stop being a run anybody else can reproduce.
 *
 * ## Why a check and not a line in a document
 *
 * `engine/pyproject.toml` states an empty dependency list. That is a claim
 * about a file, not about the code: a package can import whatever happens to be
 * installed on the machine that ran it and the list stays empty and true. On a
 * developer's machine the import succeeds, because the developer installed the
 * thing; on the host it fails, and the host is a trading platform that accepted
 * an engine on the promise that it brought nothing with it.
 *
 * So the imports are read. Every one of them, in every Python file this project
 * holds, against the module names **the running interpreter says are its own**.
 * A list of standard library names written down here would be a copy of
 * somebody else's fact: right the day it was typed and wrong the release after,
 * wrong in the direction that lets a dependency through. `tools/environment.py`
 * asks the interpreter, exactly as `check-layering.mjs` asks the JavaScript
 * runtime for its own namespace.
 *
 * ## The four doors that are in the standard library and still refused
 *
 * A module can be the interpreter's own and still be the wrong thing for an
 * engine whose whole value is that two of them agree. Each group below is
 * refused with the sentence that refuses it, and the sentences are not this
 * file's opinion: they are what the specification already says.
 *
 * ## What this does not cover
 *
 * The string evaluator, the statement executor, the compiler, the import
 * machinery, the object loaders and the process starters are next door, in
 * `check-no-eval.mjs`, which reads every Python file in the tree and not only
 * the package. The division is the same one as on the JavaScript side: this
 * file is about what the engine a host installs can reach, and that one is
 * about what any file here can do.
 *
 * Run: node scripts/check-python.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, relative, sep } from 'node:path';
import { filesMatching } from './lib/files.mjs';
import { imports, maskPython } from './lib/python-source.mjs';

/** The package a host installs, and the directory the whole engine lives in. */
const PACKAGE = 'engine/openscript';
const ENGINE = 'engine';

/** The name the package is imported by, which is its own to use. */
const SELF = 'openscript';

/** What may be imported outside the package, and is not installed with it. */
const BESIDE = ['tools', 'tests'];

/** The first host requires this, and `pyproject.toml` states it. */
const LOWEST = [3, 12];

/**
 * The spellings an interpreter answers to, tried in this order.
 *
 * Both are written down rather than taken from the environment: a command this
 * file computed is a command a reader cannot check, which is the rule
 * `check-no-eval.mjs` holds every launch in this repository to.
 */
const CANDIDATES = ['python3', 'python'];

const ENVIRONMENT = `${ENGINE}/tools/environment.py`;
const RUNNER = `${ENGINE}/tools/run_tests.py`;
const PROJECT = `${ENGINE}/pyproject.toml`;

/**
 * Modules of the standard library that the shipped package may not import.
 *
 * Every sentence here is the specification's rather than this file's, which is
 * what keeps the list from growing by preference.
 */
const DOORS = [
  {
    modules: ['socket', 'ssl', 'http', 'urllib', 'ftplib', 'smtplib', 'asyncio', 'selectors', 'webbrowser'],
    why: 'an engine is handed its data by its host and reaches for nothing. A network read inside a run is a run that cannot be reproduced, and a host that finds one has an engine it cannot put in front of a customer',
  },
  {
    modules: ['threading', '_thread', 'concurrent'],
    why: 'a run is one sequence of bars in one order. Two threads make the order a property of the machine, and the first host runs a cooperatively scheduled worker where a thread is not what it looks like anyway',
  },
  {
    modules: ['random', 'secrets'],
    why: "stdlib.md section 8.2: there is no random number function, in that namespace or anywhere else, because a script that could produce a different answer on a second run could not be part of a conformance suite",
  },
  {
    modules: ['locale', 'gettext'],
    why: 'compiled-program.md section 8.4: there is no locale. Number formatting, string comparison and case conversion are defined by the manifest and by Unicode, never by a machine setting, or two engines in two places produce two answers',
  },
];

const doorFor = (module) => DOORS.find((door) => door.modules.includes(module));

function refuse(message) {
  console.error(message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The interpreter
// ---------------------------------------------------------------------------

/**
 * The first candidate that answers, with what it said about itself.
 *
 * Bytecode caching is turned off for every call, so nothing this check does
 * leaves a directory of compiled files behind. `check-no-eval.mjs` reads every
 * file this project holds and refuses one it cannot place, and a compiled
 * bytecode file is code nobody can read, so leaving one would fail the build in
 * a way that looks like somebody else's fault.
 */
const ask = (command, program) =>
  spawnSync(command, [program], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });

function findInterpreter() {
  const tried = [];
  for (const candidate of CANDIDATES) {
    const result = ask(candidate, ENVIRONMENT);
    if (result.error || result.status !== 0) {
      tried.push(`  ${candidate}: ${result.error ? result.error.code : result.stderr.trim().split('\n').pop()}`);
      continue;
    }
    const said = JSON.parse(result.stdout);
    const [major, minor] = said.version;
    if (major < LOWEST[0] || (major === LOWEST[0] && minor < LOWEST[1])) {
      tried.push(`  ${candidate}: Python ${said.version.join('.')}, older than ${LOWEST.join('.')}`);
      continue;
    }
    return { command: candidate, said };
  }
  refuse(
    `No interpreter answered, so the second engine was not checked and its tests did not\n` +
      `run:\n\n${tried.join('\n')}\n\n` +
      `The gate covers both engines, so a missing interpreter fails it rather than\n` +
      `skipping it: a suite that quietly checks one engine is how two engines drift\n` +
      `apart. Install Python ${LOWEST.join('.')} or later, or put it on the path under one of ` +
      `${CANDIDATES.join(' or ')}.`,
  );
}

// ---------------------------------------------------------------------------
// The rule, and the corpus it is attacked with
// ---------------------------------------------------------------------------

/**
 * What one file is allowed to import, given what the interpreter provides.
 *
 * The package may reach the standard library, minus the doors above, and
 * itself. Everything else here, the tests and the tools, may reach each other
 * as well, and nothing may reach anything that has to be installed first: a
 * test that needs a framework downloaded from an index is a test the host
 * cannot run, and the host running the tests is how a platform decides whether
 * to trust this engine at all.
 */
function offences(file, text, standardLibrary) {
  const shipped = file === PACKAGE || file.startsWith(PACKAGE + '/');
  const found = [];
  for (const one of imports(maskPython(text).code)) {
    if (one.relative) continue;
    const where = `${file}:${one.line}`;
    if (one.module === SELF || (!shipped && BESIDE.includes(one.module))) continue;
    if (!standardLibrary.has(one.module)) {
      found.push(
        `${where}: imports "${one.module}", which is not the interpreter's own. The package ` +
          `brings nothing with it: every dependency is something an adopting platform has to ` +
          `accept, audit and upgrade, and pyproject.toml's empty list is what a host reads.`,
      );
      continue;
    }
    if (!shipped) continue;
    const door = doorFor(one.module);
    if (door !== undefined) {
      found.push(`${where}: imports "${one.module}" in the package a host installs. ${door.why}.`);
    }
  }
  return found;
}

/** Forms the rule must refuse, in the package, and forms it must leave alone. */
const MUST_REFUSE = [
  'import numeric_library',
  'from dataframes import Frame',
  'import requests.sessions',
  'import random',
  'import threading',
  'from locale import setlocale',
  'import socket',
  'import urllib.request',
];

const MUST_ALLOW = [
  'import json',
  'import struct',
  'from pathlib import Path',
  'from datetime import datetime, timezone',
  'import zoneinfo',
  'from decimal import Decimal',
  'from . import library',
  'from .machine import step',
  'from openscript.machine import step',
  'import openscript',
];

/**
 * Both halves, before a file is read.
 *
 * For the reason written at the top of `lib/no-eval-attacks.mjs`: a rule that
 * can no longer match anything looks exactly like a rule that works, and this
 * repository has shipped one. The innocent half is as load bearing as the
 * other, because a rule that refused an ordinary standard library import would
 * be turned off inside a week.
 */
function selfTest(standardLibrary) {
  const wrong = [];
  for (const form of MUST_REFUSE) {
    if (offences(`${PACKAGE}/<corpus>.py`, form, standardLibrary).length === 0) {
      wrong.push(`not refused: ${form}`);
    }
  }
  for (const form of MUST_ALLOW) {
    const found = offences(`${PACKAGE}/<corpus>.py`, form, standardLibrary);
    if (found.length > 0) wrong.push(`refused wrongly: ${form}`);
  }
  if (wrong.length > 0) {
    refuse(
      'The rule that carries the zero dependency promise no longer does what it says:\n\n' +
        wrong.map((line) => `  ${line}`).join('\n') +
        '\n\nEvery form above really is something a host would have to install first, or\n' +
        'really is not. Fix the rule rather than the corpus: this is the check an adopter\n' +
        'is told to trust when they read that the engine brings nothing with it.',
    );
  }
  return MUST_REFUSE.length + MUST_ALLOW.length;
}

// ---------------------------------------------------------------------------
// The two version numbers that have to be one
// ---------------------------------------------------------------------------

const VERSION = /^version\s*=\s*"([^"]+)"\s*$/m;

/**
 * The distribution states a version and so does the package manifest, and a
 * build backend cannot read the manifest, so the one fact is written twice and
 * held equal here rather than by intention. A release bumps one of them and
 * this is what says the other was not bumped.
 */
function versionsAgree() {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const project = VERSION.exec(readFileSync(PROJECT, 'utf8'));
  if (project === null) {
    refuse(`${PROJECT} states no version. A distribution has to carry one, and it has to be the one package.json carries.`);
  }
  if (project[1] !== manifest) {
    refuse(
      `${PROJECT} is at ${project[1]} and package.json is at ${manifest}.\n\n` +
        'The two engines ship as one release and the version is one fact. A release bumps\n' +
        'package.json, so this line is what says the Python distribution was left behind.',
    );
  }
  return manifest;
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

const { command, said } = findInterpreter();
const standardLibrary = new Set(said.standardLibrary);
const forms = selfTest(standardLibrary);
// ---------------------------------------------------------------------------
// Every package the tree holds is a package the distribution ships
// ---------------------------------------------------------------------------

/**
 * The package list a build backend is given, held to the packages that exist.
 *
 * `[tool.setuptools] packages` is written by hand and names each one, so a new
 * subpackage is shipped only if somebody remembered to add a line. Nobody did:
 * the list said `["openscript"]` while the tree held six, and the distribution
 * that came out carried the machine and none of the halves it calls. `import
 * openscript` worked and `from openscript.adapter.serving import Serving` did
 * not, so a host that followed the integration page installed an engine that
 * could not run anything, and the failure appeared at their first import rather
 * than at our build.
 *
 * A package is a directory holding `__init__.py`, which is the same thing the
 * backend means by one, so this compares the tree with the list rather than
 * trusting either.
 */
function packagesShip() {
  const declared = new Set();
  const block = /\[tool\.setuptools\][\s\S]*?packages\s*=\s*\[([\s\S]*?)\]/.exec(
    readFileSync(PROJECT, 'utf8'),
  );
  if (block === null) {
    refuse(`${PROJECT} states no package list, so what the distribution ships is whatever the backend guesses.`);
  }
  for (const quoted of block[1].matchAll(/"([^"]+)"/g)) declared.add(quoted[1]);

  const present = new Set(
    filesMatching(/(^|\/)__init__\.py$/, ['engine'])
      .map((file) => relative('engine', dirname(file)).split(sep).join('.'))
      .filter((name) => name === 'openscript' || name.startsWith('openscript.')),
  );

  const missing = [...present].filter((name) => !declared.has(name)).sort();
  if (missing.length > 0) {
    refuse(
      `${PROJECT} does not ship ${missing.join(', ')}.\n\n` +
        'Every directory under engine/openscript holding an __init__.py is a package, and a\n' +
        'package left out of that list is absent from the installed distribution. An import\n' +
        'of it fails in the host and nowhere here, which is how this was found: by installing\n' +
        'the engine into a platform and watching the adapter go missing.',
    );
  }

  const absent = [...declared].filter((name) => !present.has(name)).sort();
  if (absent.length > 0) {
    refuse(`${PROJECT} ships ${absent.join(', ')}, which is not a package in this tree.`);
  }

  return present.size;
}

const version = versionsAgree();
const packageCount = packagesShip();

// Every Python file the project holds, rather than the ones under engine/. The
// engine is there today and a tool or a fixture in the same language tomorrow is
// somewhere else, and whatever is not in the list is enforced by nothing: the
// top of lib/files.mjs is four write-ups of that one failure.
const files = filesMatching(/\.py$/);

// A check that inspected nothing reports success, which is the most expensive
// green there is.
if (files.length === 0) {
  refuse(
    'No Python file matched, so this check inspected nothing. It is what says the second\n' +
      'engine brings no dependency with it, so it refuses to report a guarantee about a\n' +
      'tree it never read.',
  );
}

const shipped = files.filter((file) => file.startsWith(PACKAGE + '/'));
if (shipped.length === 0) {
  refuse(
    `No Python file under ${PACKAGE}/ matched. That directory is the package a host\n` +
      'installs, and a dependency rule that read only the tests would be checking the one\n' +
      'copy nobody ships.',
  );
}

let hits = 0;
let read = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  read += imports(maskPython(text).code).length;
  for (const line of offences(file, text, standardLibrary)) {
    hits += 1;
    console.error(line);
  }
}

if (hits > 0) {
  console.error(
    `\n${hits} import${hits === 1 ? '' : 's'} the second engine may not have. ` +
      'Zero runtime dependencies is not a preference: it is what lets a platform take this ' +
      'engine without taking a numeric stack, a release cadence and somebody else\'s security ' +
      'advisories with it.',
  );
  process.exit(1);
}

console.log(
  `Python check passed: ${command} is Python ${said.version.join('.')}, at or past ` +
    `${LOWEST.join('.')}, and ${files.length} Python files in this tree (${shipped.length} of ` +
    `them the package a host installs) hold ${read} imports, every one of them relative, the ` +
    `package's own name, or one of the ${standardLibrary.size} module names this interpreter ` +
    `says are its own. ${forms} forms were put through that rule before a file was read, and ` +
    `the distribution and the package manifest are both at ${version}. What builds code out of ` +
    `text is checked next door, in scripts/check-no-eval.mjs, which reads every Python file ` +
    `here rather than only the ones that ship.`,
);

// The engine's own tests, under the interpreter this check just measured, so
// the suite covers both engines rather than the one this runtime can start.
const tests = spawnSync(command, [RUNNER], {
  stdio: 'inherit',
  env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
});
if (tests.status !== 0) process.exit(tests.status ?? 1);
