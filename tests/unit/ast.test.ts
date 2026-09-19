import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AstNode, Expression, NodeKind } from '../../src/core/index.js';
import {
  binaryPrecedence,
  childrenOf,
  isExpression,
  isStatement,
  makeNode,
  makeSpan,
  nodeAtOffset,
  pathAtOffset,
  typeAnnotationText,
  walk,
  withoutGrouping,
} from '../../src/core/index.js';

const anywhere = makeSpan(0, 1, 1, 1);

const name = makeNode('name', anywhere, { text: 'len' });
const one = makeNode('numberLiteral', anywhere, { value: 1 });
const close = makeNode('nameReference', anywhere, { name: 'close' });
const emptyBlock = makeNode('block', anywhere, { statements: [] });
const numberType = makeNode('namedType', anywhere, { name: 'number' });
const positional = makeNode('argument', anywhere, { label: undefined, value: one });
const branch = makeNode('ifBranch', anywhere, { condition: close, body: emptyBlock });

/**
 * One node of every kind, as a record over the kind union, so a kind added to
 * the tree without a sample here does not compile. The kinds below are then the
 * whole of the tree, which is what makes the two tests that read this table a
 * statement about all of it rather than about the fifteen somebody remembered.
 */
const everyKind: Readonly<Record<NodeKind, AstNode>> = {
  script: makeNode('script', anywhere, { items: [] }),
  functionDeclaration: makeNode('functionDeclaration', anywhere, {
    name,
    parameters: [],
    body: one,
  }),
  parameter: makeNode('parameter', anywhere, {
    name,
    annotation: numberType,
    defaultValue: one,
  }),
  versionLine: makeNode('versionLine', anywhere, { version: one }),
  scriptDeclaration: makeNode('scriptDeclaration', anywhere, {
    form: 'study',
    args: [positional],
  }),
  limitsLine: makeNode('limitsLine', anywhere, { args: [positional] }),
  expressionStatement: makeNode('expressionStatement', anywhere, { expression: close }),
  assignment: makeNode('assignment', anywhere, { target: name, operator: '+=', value: one }),
  varDeclaration: makeNode('varDeclaration', anywhere, {
    live: true,
    name,
    annotation: undefined,
    initialiser: one,
  }),
  ifStatement: makeNode('ifStatement', anywhere, { branches: [branch], elseBranch: undefined }),
  ifBranch: branch,
  elseBranch: makeNode('elseBranch', anywhere, { body: emptyBlock }),
  forRangeStatement: makeNode('forRangeStatement', anywhere, {
    variable: name,
    from: one,
    to: one,
    step: undefined,
    body: emptyBlock,
  }),
  forInStatement: makeNode('forInStatement', anywhere, {
    variable: name,
    iterable: close,
    body: emptyBlock,
  }),
  whileStatement: makeNode('whileStatement', anywhere, { condition: close, body: emptyBlock }),
  switchStatement: makeNode('switchStatement', anywhere, {
    subject: undefined,
    cases: [],
    defaultCase: undefined,
  }),
  switchCase: makeNode('switchCase', anywhere, { values: [one], body: emptyBlock }),
  switchDefault: makeNode('switchDefault', anywhere, { body: emptyBlock }),
  breakStatement: makeNode('breakStatement', anywhere, {}),
  continueStatement: makeNode('continueStatement', anywhere, {}),
  returnStatement: makeNode('returnStatement', anywhere, { value: undefined }),
  block: emptyBlock,
  numberLiteral: one,
  stringLiteral: makeNode('stringLiteral', anywhere, { value: 'BUY' }),
  booleanLiteral: makeNode('booleanLiteral', anywhere, { value: true }),
  colorLiteral: makeNode('colorLiteral', anywhere, { text: '#ff8800' }),
  noneLiteral: makeNode('noneLiteral', anywhere, {}),
  arrayLiteral: makeNode('arrayLiteral', anywhere, { elements: [one] }),
  nameReference: close,
  grouping: makeNode('grouping', anywhere, { expression: one }),
  unary: makeNode('unary', anywhere, { operator: 'not', operand: close }),
  binary: makeNode('binary', anywhere, { operator: '+', left: close, right: one }),
  ternary: makeNode('ternary', anywhere, {
    condition: close,
    whenTrue: one,
    whenFalse: one,
  }),
  call: makeNode('call', anywhere, { callee: close, args: [positional] }),
  argument: positional,
  index: makeNode('index', anywhere, { target: close, index: one }),
  member: makeNode('member', anywhere, { object: close, member: name }),
  missingExpression: makeNode('missingExpression', anywhere, {}),
  namedType: numberType,
  seriesType: makeNode('seriesType', anywhere, { element: numberType }),
  arrayType: makeNode('arrayType', anywhere, { element: numberType }),
  name,
};

test('a node carries the kind and the span it was built with', () => {
  const node = makeNode('binary', makeSpan(4, 5, 2, 5), { operator: '*', left: one, right: one });

  assert.equal(node.kind, 'binary');
  assert.deepEqual(node.span, { offset: 4, length: 5, line: 2, column: 5 });
  assert.equal(node.operator, '*');
});

test('every node kind builds a node of that kind', () => {
  for (const [kind, node] of Object.entries(everyKind)) {
    assert.equal(node.kind, kind);
  }
});

test('every node kind has an answer from childrenOf', () => {
  for (const [kind, node] of Object.entries(everyKind)) {
    const children = childrenOf(node);
    assert.ok(Array.isArray(children), `${kind} has no children table`);
    for (const child of children) {
      assert.ok(typeof child.kind === 'string', `${kind} returned something that is not a node`);
    }
  }
});

test('a slot the script left out contributes no child', () => {
  const bare = makeNode('returnStatement', anywhere, { value: undefined });
  const withValue = makeNode('returnStatement', anywhere, { value: one });

  assert.equal(childrenOf(bare).length, 0);
  assert.equal(childrenOf(withValue).length, 1);
});

/** `len = close + 1`, with the spans that text would produce. */
function assignmentTree(): AstNode {
  const target = makeNode('name', makeSpan(0, 3, 1, 1), { text: 'len' });
  const left = makeNode('nameReference', makeSpan(6, 5, 1, 7), { name: 'close' });
  const right = makeNode('numberLiteral', makeSpan(14, 1, 1, 15), { value: 1 });
  const sum = makeNode('binary', makeSpan(6, 9, 1, 7), { operator: '+', left, right });

  return makeNode('assignment', makeSpan(0, 15, 1, 1), {
    target,
    operator: '=',
    value: sum,
  });
}

test('children come back in the order they were written', () => {
  const kinds = childrenOf(assignmentTree()).map((child) => child.kind);

  assert.deepEqual(kinds, ['name', 'binary']);
});

test('walk visits a parent before its children, in source order', () => {
  const seen: NodeKind[] = [];
  walk(assignmentTree(), { enter: (node) => void seen.push(node.kind) });

  assert.deepEqual(seen, ['assignment', 'name', 'binary', 'nameReference', 'numberLiteral']);
});

test('skipping a node leaves its children unvisited and still closes it', () => {
  const entered: NodeKind[] = [];
  const left: NodeKind[] = [];

  walk(assignmentTree(), {
    enter: (node) => {
      entered.push(node.kind);
      return node.kind === 'binary' ? 'skip' : undefined;
    },
    leave: (node) => void left.push(node.kind),
  });

  assert.deepEqual(entered, ['assignment', 'name', 'binary']);
  assert.deepEqual(left, ['name', 'binary', 'assignment']);
});

test('walk hands each node its parent', () => {
  const parents: string[] = [];
  walk(assignmentTree(), {
    enter: (node, parent) => void parents.push(`${parent?.kind ?? 'none'} > ${node.kind}`),
  });

  assert.deepEqual(parents, [
    'none > assignment',
    'assignment > name',
    'assignment > binary',
    'binary > nameReference',
    'binary > numberLiteral',
  ]);
});

test('the path to an offset runs outermost to innermost', () => {
  const kinds = pathAtOffset(assignmentTree(), 14).map((node) => node.kind);

  assert.deepEqual(kinds, ['assignment', 'binary', 'numberLiteral']);
});

test('an offset outside the tree has an empty path and no node', () => {
  assert.deepEqual(pathAtOffset(assignmentTree(), 40), []);
  assert.equal(nodeAtOffset(assignmentTree(), 40), undefined);
});

test('the node at an offset is the smallest one covering it', () => {
  const node = nodeAtOffset(assignmentTree(), 6);

  assert.equal(node?.kind, 'nameReference');
});

test('grouping is kept in the tree and unwrapped on request', () => {
  const inner: Expression = makeNode('binary', anywhere, { operator: '+', left: one, right: one });
  const once = makeNode('grouping', anywhere, { expression: inner });
  const twice = makeNode('grouping', anywhere, { expression: once });

  assert.equal(twice.kind, 'grouping');
  assert.equal(withoutGrouping(twice), inner);
});

test('an annotation reads back the way it was written', () => {
  const nested = makeNode('arrayType', anywhere, {
    element: makeNode('seriesType', anywhere, { element: numberType }),
  });

  assert.equal(typeAnnotationText(nested), 'array<series number>');
});

test('a lower precedence number binds more tightly', () => {
  assert.ok(binaryPrecedence('*') < binaryPrecedence('+'));
  assert.ok(binaryPrecedence('+') < binaryPrecedence('<'));
  assert.ok(binaryPrecedence('<') < binaryPrecedence('=='));
  assert.ok(binaryPrecedence('==') < binaryPrecedence('and'));
  assert.ok(binaryPrecedence('and') < binaryPrecedence('or'));
});

test('a header line is a statement, so a misplaced one has somewhere to sit', () => {
  const declaration = everyKind['scriptDeclaration'];

  assert.equal(isStatement(declaration), true);
  assert.equal(isExpression(declaration), false);
  assert.equal(isExpression(close), true);
  assert.equal(isStatement(close), false);
});
