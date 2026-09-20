/**
 * The checker, from a syntax tree to a checked one.
 *
 * The order the passes run in is the order the language asks for. The header is
 * read first, because whether a file is a strategy and whether it acts on a
 * moving bar are facts every later rule consults, including about lines above
 * the declaration. Declarations of `fn` are collected next, because a function
 * may be called before the line it is written on. Then the file runs top to
 * bottom, which is the order a bar runs in and the order a name has to be
 * assigned before it is read.
 *
 * What is left over is the small set of things that can only be known once
 * everything has been seen: whether a name was ever read, whether an empty
 * array literal ever received an element, whether two columns were given one
 * title, whether a tag a `close` names is one this file can place, and which
 * names need a series register rather than a slot.
 */
import type { Script } from '../ast/index.js';
import type { DiagnosticSink } from '../diagnostics/index.js';
import type { SourceFile } from '../source/index.js';
import { Checker, TOP_LEVEL, finaliseStorage } from './checker.js';
import type { CheckedScript } from './checked.js';
import { checkDeclaration, checkLimits, readHeader } from './declaration.js';
import { checkFunctionDeclarations, checkRemainingFunctions } from './functions.js';
import { reportRepeatedAlertIds } from './outputs.js';
import { checkStatement } from './statements.js';
import { reportUnplaceableTags } from './tags.js';
import { elementOf } from './types.js';

export function check(file: SourceFile, script: Script, sink: DiagnosticSink): CheckedScript {
  const checker = new Checker(file, script, sink);

  readHeader(checker, script);
  checkFunctionDeclarations(checker, script);

  let limits = false;
  for (const item of script.items) {
    switch (item.kind) {
      case 'functionDeclaration':
        continue;
      case 'scriptDeclaration':
        checkDeclaration(checker, item);
        continue;
      case 'limitsLine':
        checkLimits(checker, item, script, limits);
        limits = true;
        continue;
      default:
        checkStatement(checker, item, TOP_LEVEL);
    }
  }

  checkRemainingFunctions(checker);
  finaliseStorage(checker);
  reportUnknownElementTypes(checker);
  reportNamesNeverRead(checker);
  reportRepeatedTitles(checker);
  reportRepeatedAlertIds(checker);
  reportUnplaceableTags(checker);

  return checker.finish();
}

/**
 * OS2015: an empty array literal that never learned what it holds.
 *
 * `language.md` 14.1 gives one its element type from an annotation or from the
 * first `push`, `unshift`, `insert` or `set` in the file. With neither, there
 * is no type, and the moment to say so is now rather than at the literal, where
 * the insertion three lines below had not been read yet.
 */
function reportUnknownElementTypes(checker: Checker): void {
  for (const binding of checker.bindings) {
    const type = elementOf(binding.type);
    if (type.kind !== 'array' || type.element.kind !== 'unknown') continue;
    checker.report('OS2015', binding.declaredAt, {});
  }
}

/** OS8010 and OS8018: a name, or an input, that nothing in the file reads. */
function reportNamesNeverRead(checker: Checker): void {
  for (const binding of checker.bindings) {
    if (binding.isRead) continue;
    if (binding.kind === 'library' || binding.kind === 'function') continue;
    if (binding.kind === 'parameter' || binding.kind === 'loop') continue;

    if (binding.input !== undefined) {
      const input = checker.inputs[binding.input];
      checker.report('OS8018', binding.declaredAt, {
        title: `"${input?.title ?? binding.name}"`,
        line: binding.declaredAt.line,
      });
      continue;
    }
    checker.report('OS8010', binding.declaredAt, {
      name: binding.name,
      line: binding.declaredAt.line,
    });
  }
}

/**
 * OS3017: two things in one file given the same name.
 *
 * A title is what every later stage keys on, from a legend entry to a saved
 * alert subscription, so two of them is not a cosmetic problem: one of the two
 * would have to lose, and nothing anywhere decides which.
 */
function reportRepeatedTitles(checker: Checker): void {
  const seen = new Map<string, number>();

  for (const output of checker.outputs) {
    if (output.form === 'fill' || output.title === '') continue;
    const key = `${output.form}:${output.title}`;
    const first = seen.get(key);
    if (first === undefined) seen.set(key, output.span.line);
    else {
      checker.report('OS3017', output.span, {
        kind: output.form,
        name: `"${output.title}"`,
        line: first,
      });
    }
  }

  const inputs = new Map<string, number>();
  for (const input of checker.inputs) {
    if (input.title === '') continue;
    const first = inputs.get(input.title);
    if (first === undefined) inputs.set(input.title, input.span.line);
    else {
      checker.report('OS3017', input.span, {
        kind: 'input',
        name: `"${input.title}"`,
        line: first,
      });
    }
  }
}
