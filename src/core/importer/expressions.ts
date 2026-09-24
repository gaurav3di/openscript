/**
 * Expressions in the source dialect, read by recursive descent.
 *
 * The precedence ladder is the source dialect's, and it is the same shape as
 * OpenScript's (`language.md` 9.1): the ternary lowest, then `or`, `and`,
 * equality, comparison, the additive and multiplicative operators, and the
 * unary operators with `not` among them. So a tree read here prints back into
 * OpenScript with parentheses only where the tree needs them, and never with a
 * different grouping.
 *
 * What the reader does not accept it reports by throwing `Unreadable` with the
 * place and a few words naming the form, and the statement reader turns that
 * into a statement kept whole. It is the one exception in the importer, and it
 * never leaves this module and the statement reader beside it.
 */
import type { Token } from './lexer.js';
import { joined } from './syntax.js';
import type { Arg, Expr, Place } from './syntax.js';

/** A form the reader does not accept, and where it starts. */
export class Unreadable extends Error {
  readonly at: Place;
  readonly construct: string;

  constructor(at: Place, construct: string) {
    super(construct);
    this.at = at;
    this.construct = construct;
  }
}

/** Words that open a statement form and are never a value. */
const STATEMENT_WORDS: Readonly<Record<string, string>> = {
  if: 'an if used as a value',
  switch: 'a switch used as a value',
  for: 'a for loop used as a value',
  while: 'a while loop used as a value',
};

/** The words the reader takes for a form it does not read, per bad token. */
export function badConstruct(token: Token): string {
  if (token.text.startsWith('"') || token.text.startsWith("'")) return 'a string that is never closed';
  if (token.text.startsWith('#')) return `the colour literal ${token.text}`;
  return `the character ${token.text}`;
}

export const UNREAD = 'a statement in a form its reader does not accept';

export class Cursor {
  index = 0;
  readonly tokens: readonly Token[];

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }

  peek(ahead = 0): Token | undefined {
    return this.tokens[this.index + ahead];
  }

  /** Whether the next token is this operator or word. */
  sees(text: string, ahead = 0): boolean {
    const token = this.peek(ahead);
    return token !== undefined && (token.kind === 'op' || token.kind === 'name') && token.text === text;
  }

  done(): boolean {
    return this.index >= this.tokens.length;
  }

  take(): Token {
    const token = this.tokens[this.index];
    if (token === undefined) throw new Unreadable(this.endPlace(), UNREAD);
    this.index += 1;
    return token;
  }

  expect(text: string): Token {
    if (!this.sees(text)) this.fail();
    return this.take();
  }

  /** Refuse at the next token, or at the end of the line when there is none. */
  fail(): never {
    const token = this.peek();
    if (token === undefined) throw new Unreadable(this.endPlace(), UNREAD);
    if (token.kind === 'bad') throw new Unreadable(placeOf(token), badConstruct(token));
    throw new Unreadable(placeOf(token), UNREAD);
  }

  /** Zero width, just after the last token. */
  endPlace(): Place {
    const last = this.tokens[this.tokens.length - 1];
    return last === undefined ? { offset: 0, length: 0 } : { offset: last.offset + last.length, length: 0 };
  }
}

export function placeOf(token: Token): Place {
  return { offset: token.offset, length: token.length };
}

const COMPARISON = new Set(['<', '<=', '>', '>=']);
const EQUALITY = new Set(['==', '!=']);
const ADDITIVE = new Set(['+', '-']);
const MULTIPLICATIVE = new Set(['*', '/', '%']);

type Level = (c: Cursor) => Expr;

/** One left associative level of binary operators. */
function binaryLevel(operators: ReadonlySet<string>, next: Level, words = false): Level {
  return (c) => {
    let left = next(c);
    for (;;) {
      const token = c.peek();
      if (token === undefined || !operators.has(token.text)) return left;
      if (words ? token.kind !== 'name' : token.kind !== 'op') return left;
      c.take();
      const right = next(c);
      left = { kind: 'binary', op: token.text, left, right, at: joined(left.at, right.at), opAt: placeOf(token) };
    }
  };
}

export function expression(c: Cursor): Expr {
  return ternary(c);
}

function ternary(c: Cursor): Expr {
  const condition = orLevel(c);
  if (!c.sees('?')) return condition;
  c.take();
  const then = ternary(c);
  c.expect(':');
  const otherwise = ternary(c);
  return { kind: 'ternary', condition, then, otherwise, at: joined(condition.at, otherwise.at) };
}

function unary(c: Cursor): Expr {
  const token = c.peek();
  if (token !== undefined) {
    const sign = token.kind === 'op' && (token.text === '-' || token.text === '+');
    const not = token.kind === 'name' && token.text === 'not';
    if (sign || not) {
      c.take();
      const operand = unary(c);
      return { kind: 'unary', op: token.text, operand, at: joined(placeOf(token), operand.at) };
    }
  }
  return postfix(c);
}

const multiplicative = binaryLevel(MULTIPLICATIVE, unary);
const additive = binaryLevel(ADDITIVE, multiplicative);
const comparison = binaryLevel(COMPARISON, additive);
const equality = binaryLevel(EQUALITY, comparison);
const andLevel = binaryLevel(new Set(['and']), equality, true);
const orLevel = binaryLevel(new Set(['or']), andLevel, true);

function argumentsOf(c: Cursor): Arg[] {
  const args: Arg[] = [];
  if (c.sees(')')) return args;
  for (;;) {
    const first = c.peek();
    let label: string | undefined;
    if (first !== undefined && first.kind === 'name' && c.sees('=', 1)) {
      label = first.text;
      c.take();
      c.take();
    }
    const value = expression(c);
    args.push({ label, value, at: first === undefined ? value.at : joined(placeOf(first), value.at) });
    if (!c.sees(',')) return args;
    c.take();
  }
}

function postfix(c: Cursor): Expr {
  let expr = primary(c);
  for (;;) {
    if (c.sees('(')) {
      c.take();
      const args = argumentsOf(c);
      const close = c.expect(')');
      expr = { kind: 'call', callee: expr, args, at: joined(expr.at, placeOf(close)) };
    } else if (c.sees('[')) {
      c.take();
      const index = expression(c);
      const close = c.expect(']');
      expr = { kind: 'index', target: expr, index, at: joined(expr.at, placeOf(close)) };
    } else if (c.sees('.')) {
      c.take();
      const property = c.take();
      if (property.kind !== 'name') throw new Unreadable(placeOf(property), UNREAD);
      expr = { kind: 'member', object: expr, property: property.text, at: joined(expr.at, placeOf(property)) };
    } else {
      return expr;
    }
  }
}

function primary(c: Cursor): Expr {
  const token = c.peek();
  if (token === undefined) c.fail();
  const at = placeOf(token);
  switch (token.kind) {
    case 'number':
      c.take();
      return { kind: 'number', text: token.text, at };
    case 'string':
      c.take();
      return { kind: 'string', value: token.value, at };
    case 'color':
      c.take();
      return { kind: 'color', text: token.text, at };
    case 'bad':
      throw new Unreadable(at, badConstruct(token));
    case 'name': {
      const word = STATEMENT_WORDS[token.text];
      if (word !== undefined) throw new Unreadable(at, word);
      c.take();
      if (token.text === 'true' || token.text === 'false') {
        return { kind: 'bool', value: token.text === 'true', at };
      }
      return { kind: 'name', name: token.text, at };
    }
    case 'op':
      break;
  }
  if (token.text === '(') {
    c.take();
    const inner = expression(c);
    const close = c.expect(')');
    return { kind: 'group', inner, at: joined(at, placeOf(close)) };
  }
  if (token.text === '[') {
    c.take();
    const items: Expr[] = [];
    while (!c.sees(']')) {
      items.push(expression(c));
      if (!c.sees(',')) break;
      c.take();
    }
    const close = c.expect(']');
    return { kind: 'list', items, at: joined(at, placeOf(close)) };
  }
  return c.fail();
}
