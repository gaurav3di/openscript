/**
 * The corpus the no-eval check is attacked with, every time it runs.
 *
 * A guard nobody has attacked is a guard nobody has tested. This repository has
 * already shipped one check whose own pattern was malformed, so it could never
 * match anything and reported a clean tree for a year; and the no-eval check
 * itself was got past seven ways by the first reviewer who tried, and then five
 * more ways by the second, with forms that really do execute code built from
 * text.
 *
 * So the check does not start by reading files. It starts by running every form
 * below through its own rules and refusing to continue unless each one is caught
 * and each innocent form is left alone. A rule that stops matching, a marker
 * that is renamed, a pattern that is edited into uselessness: all of them fail
 * here, loudly, instead of quietly turning the guarantee off.
 *
 * ## What the second round changed, which is the part worth reading
 *
 * The first round answered five bypasses with five patterns. That is why there
 * was a second round: a list of spellings grows one spelling at a time, and the
 * next reviewer only has to think of a sixth. The three things the second set of
 * forms had in common were not spellings at all.
 *
 * **A corpus entry is a string handed to a matcher, so it can only ever test a
 * rule, never the reach of the check.** Which files are opened, which matcher
 * each one is given and which strictness it is read at were decided elsewhere
 * and asserted nowhere. A form in a file the check never opens is invisible
 * however good the rule is, so the check now states its own inventory and
 * refuses a file it cannot classify.
 *
 * **A form can fall between two matchers.** The shell rules were run over
 * workflows and hooks, and the code rules over JavaScript, and a program that
 * writes a command line and hands it to a runtime is both and was neither.
 * A string literal is now read as a command as well as a value.
 *
 * **A rule sees what the masker leaves it.** A watched name spelled `"\x65val"`
 * was an ordinary string by the time any rule ran, and a specifier assembled one
 * line above the load was outside the brackets the rule read. Both are fixed
 * where they broke rather than with another pattern.
 *
 * And the check now asserts that **every rule it has is the reason some form
 * below is caught.** A rule that can no longer match anything is the failure
 * this repository has already paid for once, and it fails here now.
 *
 * ## What the third round changed, which is the part that ends the game
 *
 * Three more forms got past, and all three were the mask rather than the rules:
 * a name spelled with an escape, a division read as a regular expression, and a
 * specifier decoded by a chain of calls. Three rounds of wider patterns had
 * produced three rounds of defeats, which is the answer to whether a wider
 * pattern is the answer.
 *
 * So the scan is no longer the enforcement. The suite runs under a runtime
 * setting that refuses two names however they are spelled. See `lib/runtime.mjs`
 * for what that covers and what it leaves open, which is more than it sounds.
 * The forms below are still every one of them fixed at the mask, because the
 * scan reads files nothing executes and catches a form before anybody runs it,
 * but it is now the first line rather than the only one.
 *
 * ## What the fourth round changed, which is the claim rather than the corpus
 *
 * A live generator was planted in the test runner itself, where it executed on
 * every run while this scan printed that nothing here builds code out of text.
 * It got in through the mask again, behind a word, and it stayed invisible
 * because the guard it should have run into had been turned off in every process
 * by an environment value that merely mentioned the setting's name.
 *
 * Both are forms below now. The larger fix was neither: the sentence these
 * checks printed was bigger than what they enforce, and no corpus catches an
 * overstatement. What is enforced for the package a platform installs is that
 * nothing under `src` may import a module from the runtime's own namespace, so
 * there is no virtual machine, no worker and no child process to reach. That is
 * `check-layering.mjs`, and it is where the strong claim is checkable.
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

  // The global object taken as a value first. One binding, or one pair of
  // brackets, and the spelling the rule above watches for is gone while the
  // reach is exactly as it was.
  'const g = globalThis; const run = g[name]; run(body);',
  'const run = (0, globalThis)["ev" + "al"]; run(body);',

  // The name respelled so that no comparison against `eval` can see it. Both of
  // these build the same four characters the runtime then looks up.
  'const run = api["\\x65val"]; run(body);',
  'const run = api["ev\\u0061l"]; run(body);',

  // The same respelling moved out of the string and into the name itself. An
  // identifier may carry a unicode escape, and the runtime resolves it before it
  // resolves the name, so all three of these call the watched thing directly.
  // Escapes were resolved inside literals and not inside names, so the mask
  // handed every rule the name `u0065val`, which nothing watches.
  '\\u0065val(body);',
  'const f = new \\u0046unction(body);',
  'globalThis.\\u0065val(body);',

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
  'const s = new (runner.Script)(body);',
  'loaded._compile(body, "x.js");',

  // Its module named in a literal, which is the same thing with an import in
  // front of it, and the two other modules whose whole purpose is evaluating
  // text handed to them.
  'import runner from "node:vm";',
  'const runner = await import("vm");',
  'const runner = await import("node:repl");',
  'const session = await import("node:inspector");',

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

  // The same, assembled one line above the load. Nothing exotic: it is how
  // anybody would write it, and for a round it was outside the brackets the
  // rule read.
  'const spec = base + "/plugin.js"; const mod = await import(spec);',
  'const spec = "data:text/" + "javascript," + body; const mod = await import(spec);',

  // A specifier decoded rather than concatenated. The rule listed the shapes
  // that mean assembly, a sum and a template, and a chain of method calls was on
  // neither list while being every bit as assembled. That list has no end, so
  // the question is now asked the other way round: written down, or built.
  'const mod = await import(parts.join(""));',
  'const mod = await import(Buffer.from(encoded, "base64").toString("utf8"));',
  'const mod = await import(specifier.replace("PLUGIN", body));',
  'const spec = parts.join(""); const mod = await import(spec);',
  'const mod = await import(String.fromCharCode(...codes));',

  // A runtime handed source text on a command line this file wrote. The rule for
  // this existed and was only ever run over workflows, so a build step written
  // in JavaScript went through the gap between two matchers.
  'execSync("node -e " + body);',
  'const command = "node --eval " + body; execSync(command);',
  'exec(`node -e ${body}`);',
  'spawnSync(process.execPath, ["-e", body]);',

  // The shell's own way of building a command, written in JavaScript.
  'execSync("sh -c " + body);',

  // And the same inversion for a command: a chain rather than a sum.
  'execSync(pieces.join(" "));',

  // A real division after a closing brace, with a live call behind it.
  //
  // One preceding character cannot tell a regular expression from a division:
  // after `}` a slash divides in an expression and opens a literal in a
  // statement. Reading this one as a literal erased everything up to the next
  // slash, the call and its string together, and the line really does run.
  'const half = { valueOf() { return 8 } } / 2; eval(body); const rest = 4 / 2;',
  'const size = { length: 6 } / 3; setTimeout("tick()", 0); const n = 9 / 3;',

  // The same ambiguity one character further back: an operator that ends an
  // expression, with the division behind it.
  'const step = count++ / total; eval(body); const rest = 1 / 2;',

  // And the same ambiguity in front of a word rather than a punctuation mark.
  // The mask read a slash after any word on a keyword list as opening a
  // literal, and `of` is a legal name, so a variable called `of` erased the
  // rest of the line and the call on it. `yield` and `await` are names too,
  // wherever the code around them does not reserve them.
  'const share = of / total; eval(body); const rest = 1 / 2;',
  'const wait = await / 2; setTimeout("tick()", 0); const rest = 1 / 2;',

  // A word from that list read as a property, which is worse, because every
  // reserved word is a legal property name and no code has to be contrived to
  // reach one. A parser has a `return` and an `in`, and both divide.
  'const share = node.return / total; eval(body); const rest = 1 / 2;',
  'const part = counts.in / counts.all; eval(body); const rest = 1 / 2;',
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

  // A member read on the global object names what it reads, so every other rule
  // can see it. Refusing this one would make the rule above unusable.
  'const label = globalThis.structuredClone;',

  // An ordinary process, with its command written down rather than assembled.
  'const files = execSync("git ls-files --cached --others -z", { encoding: "utf8" });',
  'const child = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });',

  // A flag that carries code only in a file that starts a process. This file
  // starts none, so it is a flag.
  'const flag = "-e";',

  // A name built out of pieces, used as a name and not as a specifier or a key.
  'const message = head + ": " + tail;',
  'const cached = totals[key + suffix];',

  // The method every check here calls, which must not read as starting one.
  'const parsed = PATTERN.exec(text);',

  // A regular expression that really is one, holding a watched name. If the mask
  // stopped reading literals this would be reported, which is the failure in the
  // other direction from the divisions above.
  'const found = /eval/.test(text);',

  // A specifier written down and then used, which is the shape the rule asks
  // for and has to keep allowing.
  'const SPEC = "./plugin.js"; const mod = await import(SPEC);',
  'const mod = await import(node.specifier);',

  // The words that are still keywords, where a slash behind one really does
  // open a literal. Taking one of these off the list would leave the pattern
  // below read as code and reported, which is the failure in the other
  // direction from the divisions above.
  'const ok = typeof /eval/ === "object";',
  'for (const part of parts) if (part.length > 0) return /Function/.test(part);',
];

/**
 * Forms refused in what ships and allowed in the tooling.
 *
 * A module load is the first kind: refused in what ships, because a consumer's
 * bundler has to see the whole graph, and allowed here, where loading a built
 * file is how a test runner and a benchmark work.
 *
 * A runtime global taken as a value is the second. `window`, `self` and `global`
 * are the global object in some runtime and ordinary words everywhere else, and
 * this repository really does have a rolling `window` and a direct `self` call,
 * so the rule is narrowed to the place where none of the three has an innocent
 * reading rather than widened until it is turned off.
 *
 * Both halves of each are asserted: a rule that fired everywhere would make the
 * tooling unwritable, and one that fired nowhere would let the form into the
 * package.
 */
export const SHIPPED_ONLY = [
  'const mod = await import(specifier);',
  'const mod = require(specifier);',
  'const scope = self; const run = scope[name]; run(body);',
  'const g = window; const run = g[name]; run(body);',
];

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

/**
 * Environment values that look like the setting and do not turn it on.
 *
 * A corpus for the other guard, and it belongs beside these because it is the
 * same failure in a different file. The runtime helper asked whether the
 * environment value **contained** the setting's spelling, so one variable whose
 * value merely mentions it, a process title or a path named after it, answered
 * yes. Every program here then believed it was refusing while it was not, and
 * handed that same environment to every child it started. The guarantee was off
 * everywhere and every check still printed that it was on.
 *
 * The last two are the runtime's own way of turning the setting back off, which
 * also contains the spelling, so a search for a substring reports a refusing
 * process where the runtime was told the opposite. Whichever comes last wins, so
 * the order of these matters and is the reason the whole value is read.
 */
export const SETTING_ABSENT = [
  '',
  '   ',
  '--title=x--disallow-code-generation-from-strings',
  '--title="--disallow-code-generation-from-strings"',
  '--require=./--disallow-code-generation-from-strings.js',
  "'--disallow-code-generation-from-strings'",
  '--no-disallow-code-generation-from-strings',
  '--disallow-code-generation-from-strings --no-disallow-code-generation-from-strings',
];

/**
 * Environment values that really do turn it on, so the guard is not simply
 * tightened into always saying no.
 *
 * Each of these was measured against the runtime rather than reasoned about: a
 * double quote groups and is stripped, a single quote and a backslash are
 * ordinary characters, and the last mention of the setting or of its negation
 * decides.
 */
export const SETTING_PRESENT = [
  '--disallow-code-generation-from-strings',
  '  --disallow-code-generation-from-strings  ',
  '"--disallow-code-generation-from-strings"',
  '--max-old-space-size=4096 --disallow-code-generation-from-strings',
  '--no-disallow-code-generation-from-strings --disallow-code-generation-from-strings',
];
