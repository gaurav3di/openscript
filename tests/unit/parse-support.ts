import { readFileSync, readdirSync } from 'node:fs';

import { DiagnosticBag, childrenOf, parse, sourceFile, walk } from '../../src/core/index.js';
import type {
  AstNode,
  Diagnostic,
  PlaceholderValue,
  Script,
  SourceFile,
  Statement,
} from '../../src/core/index.js';

export interface Parsed {
  readonly file: SourceFile;
  readonly script: Script;
  readonly diagnostics: readonly Diagnostic[];
}

/** Parses a script the way a compile does, collecting rather than throwing. */
export function parsed(text: string): Parsed {
  const bag = new DiagnosticBag();
  const file = sourceFile('test.oscript', text);
  const script = parse(file, bag);
  return { file, script, diagnostics: bag.ordered() };
}

export function codes(text: string): readonly string[] {
  return parsed(text).diagnostics.map((diagnostic) => diagnostic.code);
}

export function fixes(text: string): readonly string[] {
  return parsed(text).diagnostics.map((diagnostic) => diagnostic.fix);
}

/**
 * The values a diagnostic filled its slots from.
 *
 * A test asserts these rather than the sentence they were put into. The code is
 * the promise and the wording may improve, but the name a message points at is
 * part of what the diagnostic claims, and it is what an editor reads to offer a
 * fix. Asserting the sentence instead makes a second copy of the catalogue's
 * wording, which is the one thing the catalogue exists to prevent.
 */
export function values(text: string): readonly Readonly<Record<string, PlaceholderValue>>[] {
  return parsed(text).diagnostics.map((diagnostic) => diagnostic.values);
}

/** Each diagnostic as `line:column+length`, the part a caret is drawn from. */
export function spans(text: string): readonly string[] {
  return parsed(text).diagnostics.map(
    (one) => `${one.span.line}:${one.span.column}+${one.span.length}`,
  );
}

/** Where the parser's own source lives, named from the repository root. */
const PARSE_DIRECTORY = new URL('../../../src/core/parse/', import.meta.url);

/**
 * `cursor.report('OS1024', ...)`, which is the one shape a parse diagnostic is
 * raised in. A code written in a comment is not a call and is not matched, and
 * the sink's own `report(code, ...)` takes a variable rather than a literal.
 */
const RAISED = /\breport\(\s*'(OS\d{4})'/g;

/**
 * Every code the parser's source raises, read out of the source.
 *
 * A list of codes kept by hand says what somebody believed on the day they
 * wrote it. Reading the calls says what the parser does, so a code added to a
 * rule and forgotten everywhere else has somewhere to show up.
 */
export function codesTheParserRaises(): readonly string[] {
  const found = new Set<string>();

  for (const name of readdirSync(PARSE_DIRECTORY).sort()) {
    if (!name.endsWith('.ts')) continue;
    const source = readFileSync(new URL(name, PARSE_DIRECTORY), 'utf8');
    for (const match of source.matchAll(RAISED)) {
      const code = match[1];
      if (code !== undefined) found.add(code);
    }
  }

  return [...found].sort();
}

/**
 * Every node kind the tree of a file holds.
 *
 * A test about one form of the grammar asks whether that form reached the tree,
 * wherever the form has to be written: `break` is a statement of its own and
 * can only be written inside a loop.
 */
export function nodeKinds(text: string): ReadonlySet<string> {
  const found = new Set<string>();
  walk(parsed(text).script, {
    enter(node) {
      found.add(node.kind);
    },
  });
  return found;
}

/** The statements of a file, so a test can name the one it is about. */
export function items(text: string): readonly AstNode[] {
  return parsed(text).script.items;
}

export function firstStatement(text: string): AstNode {
  const first = parsed(text).script.items[0];
  if (first === undefined) throw new Error(`nothing parsed from: ${text}`);
  return first;
}

/** The expression of a file whose one statement is an expression. */
export function expression(text: string): AstNode {
  const statement = firstStatement(text) as Statement;
  if (statement.kind !== 'expressionStatement') {
    throw new Error(`not an expression statement: ${statement.kind}`);
  }
  return statement.expression;
}

/**
 * A tree as one line, so a test can state the shape it expects and a reader can
 * see precedence and associativity in the assertion itself.
 */
export function shape(node: AstNode): string {
  const children = childrenOf(node);
  const head = label(node);
  return children.length === 0 ? head : `(${head} ${children.map(shape).join(' ')})`;
}

function label(node: AstNode): string {
  switch (node.kind) {
    case 'binary':
      return node.operator;
    case 'unary':
      return `unary${node.operator}`;
    case 'assignment':
      return node.operator;
    case 'nameReference':
      return node.name;
    case 'name':
      return node.text === '' ? 'anonymous' : node.text;
    case 'numberLiteral':
      return String(node.value);
    case 'stringLiteral':
      return JSON.stringify(node.value);
    case 'booleanLiteral':
      return String(node.value);
    case 'noneLiteral':
      return 'none';
    case 'colorLiteral':
      return node.text;
    case 'namedType':
      return `type:${node.name}`;
    case 'ternary':
      return 'if-else';
    case 'varDeclaration':
      return node.live ? 'live-var' : 'var';
    case 'scriptDeclaration':
      return node.form;
    default:
      return node.kind;
  }
}
