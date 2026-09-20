/**
 * The eleven kinds, as the editor's own highlighting tags.
 *
 * This is the translation an adapter exists to do: the language has eleven
 * kinds, closed, and the editor has a vocabulary of tags its themes are written
 * against. Neither knows about the other, and this file is the only place that
 * knows both.
 *
 * **It is one record rather than a switch on purpose.** A style name is the one
 * thing in this adapter that no type can hold: the editor looks a name up in its
 * own tag table at run time and warns on a console about one it does not know,
 * so a name that is wrong here is invisible to every check in this repository
 * and shows up as an unpainted keyword in somebody's product. A host that
 * disagrees with any of these, or whose theme is written against different
 * names, replaces the row in one line:
 *
 * ```ts
 * const tokens = { ...HIGHLIGHT_TOKENS, unknown: "invalid" };
 * ```
 *
 * Two of the eleven are deliberately unstyled. `whitespace` has nothing to
 * paint. `unknown` is the honest name for source the lexer took no token from,
 * which is a character the language does not have, a region somebody wrote as a
 * block comment, or a line continuation backslash: the first is a mistake and
 * the last is not, so painting all three as invalid would paint a correct line
 * red. `diagnose` is what says which of them is wrong, and the linter below is
 * how a host shows that.
 */
import type { HighlightKind } from '../../editor/index.js';

/**
 * A style name per kind, or null for one the editor should leave alone.
 *
 * `builtin` uses the editor's modifier syntax for a name the environment
 * supplies rather than the file, which is what a library name is.
 */
export const HIGHLIGHT_TOKENS: Readonly<Record<HighlightKind, string | null>> = {
  keyword: 'keyword',
  builtin: 'variableName.standard',
  name: 'variableName',
  number: 'number',
  string: 'string',
  color: 'color',
  comment: 'comment',
  operator: 'operator',
  punctuation: 'punctuation',
  whitespace: null,
  unknown: null,
};

/**
 * The editor's name for the icon beside a completion row, per kind.
 *
 * The editor ships icons for a fixed set of names and shows none for a name it
 * does not know, which is a missing icon rather than a missing row.
 */
export const COMPLETION_TYPES: Readonly<Record<string, string>> = {
  function: 'function',
  value: 'constant',
  namespace: 'namespace',
  member: 'property',
  variable: 'variable',
  argument: 'property',
};
