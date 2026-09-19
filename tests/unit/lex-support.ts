import { DiagnosticBag, lex, sourceFile } from '../../src/core/index.js';
import type { Diagnostic, SourceFile, Token } from '../../src/core/index.js';

export interface Lexed {
  readonly file: SourceFile;
  readonly tokens: readonly Token[];
  readonly diagnostics: readonly Diagnostic[];
}

/** Lexes a script the way a compile does, collecting rather than throwing. */
export function lexed(text: string): Lexed {
  const bag = new DiagnosticBag();
  const file = sourceFile('test.oscript', text);
  const tokens = lex(file, bag);
  return { file, tokens, diagnostics: bag.ordered() };
}

/** The token kinds, with the end of file dropped: every stream ends with one. */
export function kinds(text: string): readonly string[] {
  return lexed(text)
    .tokens.map((token) => token.kind)
    .filter((kind) => kind !== 'endOfFile');
}

export function codes(text: string): readonly string[] {
  return lexed(text).diagnostics.map((diagnostic) => diagnostic.code);
}

/** The layout of a script, which is all a block structure test is about. */
export function layout(text: string): readonly string[] {
  return kinds(text).filter((kind) => ['newline', 'indent', 'dedent'].includes(kind));
}

/** The tokens a parser reads, so a test can state a stream without its layout. */
export function words(text: string): readonly string[] {
  return lexed(text)
    .tokens.filter((token) => !['newline', 'indent', 'dedent', 'endOfFile'].includes(token.kind))
    .map((token) => token.text);
}
