import type { Script, TopLevelItem } from '../ast/index.js';
import { makeNode } from '../ast/index.js';
import type { DiagnosticSink } from '../diagnostics/index.js';
import { lex } from '../lex/index.js';
import type { SourceFile } from '../source/index.js';
import type { Token } from '../tokens/index.js';
import { Cursor } from './cursor.js';
import { parseFunctionDeclaration } from './functions.js';
import { parseStatement } from './statements.js';

/**
 * A file, which is a list of statements and function declarations.
 *
 * Section 19 writes a file as a version line, a declaration and a limits line
 * followed by the rest. The prose wins: the declaration being missing is
 * OS2007, two of them is OS2008, and a version line that is not first is
 * OS1021, all of which name a line and suggest a move. So every line here is an
 * item in source order, a file with no declaration still has a tree, and the
 * checker is left holding the questions that are its to answer.
 *
 * Nothing in this file throws and nothing stops early. A statement that could
 * not be read costs its own line and, where it opened one, its block; the next
 * line is read as though nothing had happened, which is what lets a file with
 * three mistakes in it produce three diagnostics from one compile.
 */
export function parse(file: SourceFile, diagnostics: DiagnosticSink): Script {
  return parseTokens(file, lex(file, diagnostics), diagnostics);
}

/** The same, for a host that has already lexed the file and kept the tokens. */
export function parseTokens(
  file: SourceFile,
  tokens: readonly Token[],
  diagnostics: DiagnosticSink,
): Script {
  const cursor = new Cursor(file, tokens, diagnostics);
  const items: TopLevelItem[] = [];

  while (!cursor.at('endOfFile')) {
    const before = cursor.position;

    if (cursor.at('newline') || cursor.at('dedent') || cursor.at('indent')) {
      // Layout with no statement to belong to, which a recovery can leave
      // behind. Taking it here keeps the loop below reading statements only.
      if (cursor.at('indent')) cursor.skipBlockBody();
      else cursor.advance();
      continue;
    }

    if (cursor.at('fn')) {
      cursor.beginStatement();
      const declaration = parseFunctionDeclaration(cursor);
      cursor.noteStatement(declaration.span.line);
      items.push(declaration);
    } else {
      const statement = parseStatement(cursor);
      if (statement !== undefined) items.push(statement);
    }

    if (cursor.position === before) cursor.skipStatement();
  }

  return makeNode('script', file.spanAt(0, file.text.length), { items });
}
