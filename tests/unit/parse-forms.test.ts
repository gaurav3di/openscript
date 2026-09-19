import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DiagnosticBag, RESERVED_WORDS, lex, parseTokens, sourceFile } from '../../src/core/index.js';
import { codes, firstStatement, nodeKinds, parsed, shape } from './parse-support.js';

/**
 * One row per production of the grammar summary in section 19, so that a form
 * the language has and the parser does not is a failure here rather than a
 * surprise in somebody's script.
 *
 * Each row states the source a reader would write and the node the tree is
 * required to hold for it. The node is looked for anywhere in the tree, because
 * some forms can only be written inside another: `break` needs a loop around
 * it, and a `case` needs a `switch`.
 */
const FORMS: readonly (readonly [string, string, string])[] = [
  // The three lines that describe the file rather than compute anything.
  ['version', 'version 1\n', 'versionLine'],
  ['declaration, study', 'study("A")\n', 'scriptDeclaration'],
  ['declaration, strategy', 'strategy("A")\n', 'scriptDeclaration'],
  ['limits', 'limits(loops = 50_000_000)\n', 'limitsLine'],

  // Functions, in both forms of 11.1.
  ['function, one line', 'fn f(x) => x + 1\n', 'functionDeclaration'],
  ['function, block', 'fn f(x) =>\n    x + 1\n', 'functionDeclaration'],
  ['function, no parameters', 'fn f() => 1\n', 'functionDeclaration'],
  ['parameter, bare', 'fn f(x) => x\n', 'parameter'],
  ['parameter, annotated', 'fn f(x: number) => x\n', 'parameter'],
  ['parameter, default', 'fn f(x = 1) => x\n', 'parameter'],
  ['parameter, both', 'fn f(x: number = 1) => x\n', 'parameter'],

  // Statements.
  ['assignment', 'a = 1\n', 'assignment'],
  ['varDecl', 'var a = 1\n', 'varDeclaration'],
  ['varDecl, live', 'live var a = 1\n', 'varDeclaration'],
  ['varDecl, annotated', 'var a: number = 1\n', 'varDeclaration'],
  ['ifStatement', 'if a\n    x = 1\n', 'ifStatement'],
  ['ifStatement, branch', 'if a\n    x = 1\n', 'ifBranch'],
  ['ifStatement, else', 'if a\n    x = 1\nelse\n    x = 2\n', 'elseBranch'],
  ['forStatement, range', 'for i = 0 to 9\n    x = i\n', 'forRangeStatement'],
  ['forStatement, in', 'for v in vs\n    x = v\n', 'forInStatement'],
  ['whileStatement', 'while a\n    x = 1\n', 'whileStatement'],
  ['switchStatement', 'switch a\n    case 1\n        x = 1\n', 'switchStatement'],
  ['switchStatement, case', 'switch a\n    case 1\n        x = 1\n', 'switchCase'],
  ['switchStatement, default', 'switch a\n    default\n        x = 1\n', 'switchDefault'],
  ['break', 'while a\n    break\n', 'breakStatement'],
  ['continue', 'while a\n    continue\n', 'continueStatement'],
  ['return', 'fn f() =>\n    return 1\n', 'returnStatement'],
  ['expression statement', 'plot(a)\n', 'expressionStatement'],
  ['block', 'if a\n    x = 1\n', 'block'],

  // Expressions: every alternative of `primary` and of `postfix`.
  ['primary, number', 'x = 1\n', 'numberLiteral'],
  ['primary, string', 'x = "a"\n', 'stringLiteral'],
  ['primary, true', 'x = true\n', 'booleanLiteral'],
  ['primary, false', 'x = false\n', 'booleanLiteral'],
  ['primary, none', 'x = none\n', 'noneLiteral'],
  ['primary, colour', 'x = #ff8800\n', 'colorLiteral'],
  ['primary, name', 'x = close\n', 'nameReference'],
  ['primary, grouping', 'x = (1)\n', 'grouping'],
  ['arrayLiteral', 'x = [1, 2]\n', 'arrayLiteral'],
  ['arrayLiteral, empty', 'x = []\n', 'arrayLiteral'],
  ['postfix, call', 'x = f(1)\n', 'call'],
  ['postfix, index', 'x = a[1]\n', 'index'],
  ['postfix, member', 'x = a.b\n', 'member'],
  ['unary', 'x = -a\n', 'unary'],
  ['binary', 'x = a + b\n', 'binary'],
  ['ternary', 'x = a ? b : c\n', 'ternary'],

  // Arguments, and the types an annotation can take.
  ['argument, positional', 'f(1)\n', 'argument'],
  ['argument, named', 'f(len = 1)\n', 'argument'],
  ['argument, both', 'f(1, len = 2)\n', 'argument'],
  ['type, value', 'var a: number = 1\n', 'namedType'],
  ['type, object', 'var a: line = none\n', 'namedType'],
  ['type, series', 'var a: series number = none\n', 'seriesType'],
  ['type, array', 'var a: array<number> = []\n', 'arrayType'],
  ['type, array of object', 'var a: array<line> = []\n', 'arrayType'],
];

test('every form of the grammar summary parses, and nothing is reported', () => {
  // Each row is named once, so a row edited into a copy of its neighbour stops
  // being a row that covers something.
  assert.equal(new Set(FORMS.map(([name]) => name)).size, FORMS.length);

  for (const [name, source, kind] of FORMS) {
    assert.deepEqual(codes(source), [], `${name}: ${JSON.stringify(source)}`);
    assert.equal(nodeKinds(source).has(kind), true, `${name} produced no ${kind}`);
  }
});

test('assignment has the six operators of 19 and no others', () => {
  for (const operator of ['=', '+=', '-=', '*=', '/=', '%=']) {
    const source = `total ${operator} 1\n`;
    assert.deepEqual(codes(source), [], source);
    assert.equal(shape(firstStatement(source)), `(${operator} total 1)`);
  }
});

test('a return may be bare, and a case may list several values', () => {
  assert.equal(shape(firstStatement('fn f() =>\n    return\n')), '(functionDeclaration f (block returnStatement))');
  assert.equal(
    shape(firstStatement('switch m\n    case 1, 2, 3\n        x = 1\n')),
    '(switchStatement m (switchCase 1 2 3 (block (= x 1))))',
  );
});

test('a for header takes an optional step, and both ends are expressions', () => {
  assert.equal(
    shape(firstStatement('for i = a to b step c\n    x = 1\n')),
    '(forRangeStatement i a b c (block (= x 1)))',
  );
  // Without one the slot is genuinely absent rather than a node nobody wrote.
  assert.equal(
    shape(firstStatement('for i = a to b\n    x = 1\n')),
    '(forRangeStatement i a b (block (= x 1)))',
  );
});

/**
 * The words that begin a statement form of their own, which is why they are
 * never read as the name being assigned to. Every other reserved word reaches
 * the assignment rule and is OS1019 there.
 */
const STATEMENT_WORDS: ReadonlySet<string> = new Set([
  'break',
  'case',
  'continue',
  'default',
  'else',
  'fn',
  'for',
  'if',
  'return',
  'strategy',
  'study',
  'switch',
  'var',
  'while',
]);

test('every reserved word is legal as a named argument label', () => {
  // 3.4: a label is matched against the callee's parameter list and is never
  // looked up in a scope, so it lives in a namespace of its own.
  for (const word of RESERVED_WORDS) {
    const source = `f(${word} = 1)\n`;
    assert.deepEqual(codes(source), [], source);
    assert.equal(shape(firstStatement(source)), `(expressionStatement (call f (argument ${word} 1)))`);
  }
});

test('every reserved word is legal as the word after a dot', () => {
  // A member is matched against the namespace or the object type it was read
  // from, which is the same kind of published list a label is matched against.
  for (const word of RESERVED_WORDS) {
    const source = `x = a.${word}\n`;
    assert.deepEqual(codes(source), [], source);
    assert.equal(shape(firstStatement(source)), `(= x (member a ${word}))`);
  }
});

test('every reserved word is OS1019 as a parameter, because a body refers to one', () => {
  for (const word of RESERVED_WORDS) {
    const source = `fn g(${word} = 1) => 1\n`;
    assert.deepEqual(codes(source), ['OS1019'], source);
  }
});

test('a reserved word that begins no statement of its own is OS1019 as a name', () => {
  for (const word of RESERVED_WORDS) {
    if (STATEMENT_WORDS.has(word)) continue;
    const source = `${word} = 1\n`;
    assert.deepEqual(codes(source), ['OS1019'], source);
    // The word is taken as the name all the same, so every later diagnostic
    // about it is one the reader can act on.
    assert.equal(shape(firstStatement(source)), `(= ${word} 1)`);
  }
});

test('a host that has already lexed reads the same tree from the tokens it kept', () => {
  // The module has two doors for one reason: an editor lexes on every keystroke
  // and has no reason to lex twice, and both doors have to agree.
  const source = 'version 1\nstudy("A")\nif a\n    x = 1 +\nelse\n    y = f(1\n';

  const file = sourceFile('test.oscript', source);
  const bag = new DiagnosticBag();
  const fromTokens = parseTokens(file, lex(file, bag), bag);

  const whole = parsed(source);
  assert.deepEqual(
    bag.ordered().map((one) => one.code),
    whole.diagnostics.map((one) => one.code),
  );
  assert.deepEqual(fromTokens.items.map(shape), whole.script.items.map(shape));
});

test('a word the grammar reads by position is not reserved and may be a name', () => {
  // `version` and `limits` are recognised where they stand and are ordinary
  // identifiers everywhere else, so a script written before either existed
  // keeps compiling.
  assert.deepEqual(codes('version = 1\nlimits = 2\nx = limits + version\n'), []);
  assert.equal(shape(firstStatement('version = 1\n')), '(= version 1)');
});
