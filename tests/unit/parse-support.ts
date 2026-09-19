import { DiagnosticBag, childrenOf, parse, sourceFile, walk } from '../../src/core/index.js';
import type { AstNode, Diagnostic, Script, SourceFile, Statement } from '../../src/core/index.js';

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

export function messages(text: string): readonly string[] {
  return parsed(text).diagnostics.map((diagnostic) => diagnostic.message);
}

export function fixes(text: string): readonly string[] {
  return parsed(text).diagnostics.map((diagnostic) => diagnostic.fix);
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
