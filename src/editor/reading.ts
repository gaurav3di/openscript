/**
 * The first step of every function in this tier: text becomes a file, and the
 * file becomes tokens.
 *
 * It is one place rather than four because all four begin identically and
 * because one of them beginning differently is a bug nobody would look for.
 *
 * The bag is created and, for `highlight`, thrown away. That is not waste: the
 * lexer reports rather than throws, so handing it somewhere to report is how it
 * is told to carry on, and a highlighter has nothing to say about a character
 * the language does not have. `diagnose` is what says it.
 */
import { DiagnosticBag, check, lex, parseTokens, sourceFile } from '../core/index.js';
import type { CheckedScript, Script, SourceFile, Token } from '../core/index.js';

/**
 * The name the file is read under, and why none of these functions takes one.
 *
 * A `SourceFile` carries a name, and the renderer in the core puts it on the
 * first line of a rendered diagnostic. Nothing this tier returns carries it: a
 * diagnostic holds a span, and a highlighted piece holds a span, and neither
 * holds a file. So a name parameter here would be a parameter a caller can only
 * get wrong, with nothing anywhere able to notice that they had. A host that
 * renders a diagnostic with its own file name on it builds the `SourceFile`
 * itself, from the core, which is where the renderer lives.
 */
const UNNAMED = 'script.oscript';

export interface Read {
  readonly file: SourceFile;
  readonly bag: DiagnosticBag;
  readonly tokens: readonly Token[];
}

export interface ReadTree extends Read {
  readonly script: Script;
}

export interface ReadChecked extends ReadTree {
  readonly checked: CheckedScript;
}

/** Text to a file and its tokens. */
export function read(source: string): Read {
  const file = sourceFile(UNNAMED, source);
  const bag = new DiagnosticBag();
  return { file, bag, tokens: lex(file, bag) };
}

/** The same, with the tree, for the functions that need one. */
export function readTree(source: string): ReadTree {
  const held = read(source);
  return { ...held, script: parseTokens(held.file, held.tokens, held.bag) };
}

/**
 * The same again, checked, for the two that ask what a name means.
 *
 * `complete` and `hover` both need the checker's answers: which names the file
 * has declared, where each was declared, and what type each one holds. Nothing
 * here is a lighter version of the checker. It is the checker, run on a file
 * that is halfway through being typed, which it is built to survive: a name
 * that does not resolve becomes `unknown` and the lines around it are still
 * checked, so the names above the cursor are still names.
 */
export function readChecked(source: string): ReadChecked {
  const held = readTree(source);
  return { ...held, checked: check(held.file, held.script, held.bag) };
}
