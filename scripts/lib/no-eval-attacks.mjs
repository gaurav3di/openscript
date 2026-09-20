/**
 * The corpus the no-eval check is attacked with, every time it runs.
 *
 * A guard nobody has attacked is a guard nobody has tested. This repository has
 * already shipped one check whose own pattern was malformed, so it could never
 * match anything and reported a clean tree for a year; and the no-eval check
 * itself was got past seven ways by the first reviewer who tried, with forms
 * that really do execute code built from text.
 *
 * So the check does not start by reading files. It starts by running every form
 * below through its own rules and refusing to continue unless each one is caught
 * and each innocent form is left alone. A rule that stops matching, a marker
 * that is renamed, a pattern that is edited into uselessness: all of them fail
 * here, loudly, instead of quietly turning the guarantee off.
 *
 * ## Why these are strings and not files
 *
 * Every entry is one JavaScript string literal. `lib/javascript.mjs` masks a
 * string literal before anything is matched, so this file holds the whole attack
 * set and is still clean by its own rules, with no file exempted from the check.
 * That is the same property the masker was written for, used on purpose.
 *
 * An entry is inspected as if it were a file, so it must be written as code. Keep
 * each one to a line or two: what it demonstrates should be readable without
 * running anything.
 */

/**
 * Forms that execute code built from text, and must be refused everywhere.
 *
 * The comment on each names the door it goes through, because the point of the
 * list is the doors rather than the count.
 */
export const ATTACKS = [
  // The plain spellings, which were never the interesting part.
  'eval(body);',
  'const f = new Function(body);',

  // Evaluating in the global scope rather than here. Indirect eval is the oldest
  // spelling of it and reads as an ordinary call.
  '(0, eval)(body);',
  'const run = globalThis.eval; run(body);',

  // The function builder reached without ever writing `new Function`.
  'const f = Reflect.construct(Function, [body]);',
  'const f = Function.call(null, body);',
  'const f = Function.apply(null, [body]);',
  'const f = Function.bind(null)(body);',
  'const F = Function; const f = F(body);',

  // The same builder through a constructor property. Every object hands it back,
  // so forbidding the plain spelling alone forbids nothing.
  'const C = {}.constructor; const f = C(body);',
  'const D = Object.getPrototypeOf(async function () {}).constructor;',
  'const { constructor: F } = {}; const f = F(body);',
  'const F = api["constructor"];',

  // A watched name assembled out of pieces and looked up on the global object,
  // which no pattern written against the spelling can see.
  'const run = globalThis["ev" + "al"]; run(body);',
  'const run = globalThis[name]; run(body);',
  'const run = window[name]; run(body);',
  'const key = "eval"; const run = api[key];',

  // A string handed to a timer, which the runtime compiles and runs.
  'setTimeout("tick()", 0);',
  'setInterval("tick()", 0);',
  'setTimeout("tick(" + n + ")", 0);',

  // The runtime's own compiler, reached through a binding rather than by naming
  // its module in a literal.
  'runner.runInThisContext(body);',
  'runner.runInNewContext(body);',
  'runner.compileFunction(body);',
  'const s = new runner.Script(body);',
  'loaded._compile(body, "x.js");',

  // Its module named in a literal, which is the same thing with an import in
  // front of it.
  'import runner from "node:vm";',
  'const runner = await import("vm");',

  // Code assembled out of bytes instead of out of characters.
  'const mod = new WebAssembly.Module(bytes);',
  'const mod = await WebAssembly.compile(bytes);',

  // Text put into a document, where a script element inside it runs.
  'el.innerHTML = markup;',
  'el.outerHTML = markup;',
  'el.insertAdjacentHTML("beforeend", markup);',
  'document.write(markup);',

  // A script URL built at run time, which the content security policy this
  // language is meant to run under refuses.
  'const worker = new Worker(URL.createObjectURL(blob));',
  'self.importScripts(path);',
  'const u = "javascript:void 0";',
  'const u = "blob:https://example.invalid/x";',
  'const mod = await import("data:text/javascript,export default 1");',

  // A module specifier built out of text: a path a review cannot read, and the
  // step that turns a value into source.
  'const mod = await import(base + "/plugin.js");',
  'const mod = await import(`${base}/plugin.js`);',
  'const mod = require(dir + "/plugin.cjs");',
];

/**
 * Forms that are not any of the above and must pass.
 *
 * This half is the one that keeps the rules honest in the other direction. A
 * pattern loose enough to match everything passes the attacks and fails here, so
 * the answer to a form that got past is never a pattern that matches any file
 * containing the letters.
 */
export const INNOCENT = [
  'class Frame { constructor(depth) { this.depth = depth; } }',
  'const label = "evaluation of the plan";',
  '// eval is refused here, and so is the function builder',
  '/* A comment naming Function, eval and constructor. */',
  'const ratio = a / b / c;',
  'setTimeout(tick, 0);',
  'const u = new URL("./harness.js", import.meta.url);',
  'const mod = await import(HARNESS);',
  'const mod = await import("node:fs");',
  'const name = constructorName(node);',
  'const where = `${file}:${line}`;',
];

/**
 * Forms that are a module load and nothing worse.
 *
 * They are refused in what ships, because a consumer's bundler has to see the
 * whole graph, and allowed in the tooling, where loading a built file is how a
 * test runner and a benchmark work. Both halves are asserted: a rule that fired
 * everywhere would make the tooling unwritable, and one that fired nowhere would
 * let a run-time path into the package.
 */
export const SHIPPED_ONLY = ['const mod = await import(specifier);', 'const mod = require(specifier);'];

/** Build steps that turn a value into source text, or hand code to a runtime. */
export const SHELL_ATTACKS = [
  'node -e "console.log(1)"',
  'npm run generate && node -e "console.log(1)"',
  'node --eval="console.log(1)"',
  'node -p "1 + 1"',
  'eval "$COMMAND"',
  'if true; then eval "$COMMAND"; fi',
];

/** Build steps that are ordinary commands. */
export const SHELL_INNOCENT = [
  'node scripts/check-no-eval.mjs',
  'node scripts/clean-output.mjs tsconfig.json && tsc -p tsconfig.json',
  'npm run check:no-eval',
  'node --test dist-test/tests/unit/lex-tokens.test.js',
  'git config core.hooksPath .githooks',
];
