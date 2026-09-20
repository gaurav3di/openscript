/**
 * What goes between two tokens on a line, and how each rule is decided.
 *
 * A formatter's spacing is where a language tool usually starts guessing. The
 * classic guess is the one every reprinter makes about a minus sign: it looks at
 * the token before it and decides from a list of what can precede a binary
 * operator. That list is a second, smaller grammar, it is wrong in a case
 * nobody thought of, and being wrong means printing `a - -b` as `a--b` or
 * `dir == -1` as `dir == - 1`.
 *
 * Nothing here guesses. Three questions cannot be answered by looking at two
 * tokens, and all three are put to the parser, which has already answered them
 * to build the tree:
 *
 *   - **Is this minus a sign or a subtraction?** A `unary` node begins at its
 *     operator, so the tree names the offset of every sign in the file.
 *   - **Does this bracket open a call or group an expression?** A `grouping`
 *     node begins at its `(` and an `arrayLiteral` at its `[`. Every other
 *     bracket is an argument list, a parameter list or an index, which are the
 *     brackets that touch the name in front of them.
 *   - **Is this colon a ternary's or a type annotation's?** A `ternary` node
 *     carries the span of the arm before the colon, so the colon is the first
 *     one after it. Every other colon introduces a type.
 *
 * The rest is a table of marks, and it is small because the language is small.
 */
import { endOffset, walk } from '../core/index.js';
import type { Script, Token } from '../core/index.js';

/** The three questions the tree answers, as sets of source offsets. */
export interface Shapes {
  /** Where a `+` or a `-` is a sign rather than an operator between two values. */
  readonly signs: ReadonlySet<number>;
  /** Where a `(` groups an expression, or a `[` opens an array literal. */
  readonly grouped: ReadonlySet<number>;
  /** Where a `:` separates the two arms of a ternary. */
  readonly arms: ReadonlySet<number>;
}

/**
 * Reads the three from a tree.
 *
 * A tree from a file that did not parse is not passed here: the formatter
 * refuses such a file before this is reached, because a tree with recovery in it
 * describes a program nobody wrote.
 */
export function shapesOf(script: Script, tokens: readonly Token[]): Shapes {
  const colons = tokens.filter((token) => token.kind === ':').map((token) => token.span.offset);
  const signs = new Set<number>();
  const grouped = new Set<number>();
  const arms = new Set<number>();

  walk(script, {
    enter(node) {
      switch (node.kind) {
        case 'unary':
          signs.add(node.span.offset);
          return;
        case 'grouping':
        case 'arrayLiteral':
          grouped.add(node.span.offset);
          return;
        case 'ternary': {
          const after = endOffset(node.whenTrue.span);
          const colon = colons.find((offset) => offset >= after);
          if (colon !== undefined) arms.add(colon);
          return;
        }
        default:
          return;
      }
    },
  });

  return { signs, grouped, arms };
}

/**
 * Whether the arrow of a single-line `fn` is being written.
 *
 * `=>` is not one token. The punctuation table has `=` and `>` and no arrow, and
 * the lexer reads the pair as one only while the two touch, which is why the
 * form is recognised by the two tokens being adjacent rather than by a mark. A
 * space between them turns a function declaration into an assignment followed by
 * a comparison, so this is the one place a formatter may not insert one.
 */
function isArrow(left: Token, right: Token): boolean {
  return (
    left.kind === '=' &&
    right.kind === '>' &&
    endOffset(left.span) === right.span.offset
  );
}

/**
 * Whether a space goes between two tokens that are printed on one line.
 *
 * The default is a space, and every rule below takes one away. That direction is
 * deliberate: a missing space is almost always harmless to read and never
 * changes what the lexer sees, and an added space between two marks that have to
 * touch is the one mistake that changes a program. The arrow above is the only
 * case where that could happen, and it is refused first.
 */
export function spaceBetween(left: Token, right: Token, shapes: Shapes): boolean {
  if (isArrow(left, right)) return false;

  // A sign belongs to the value it signs. `not` is a word and keeps its space:
  // taking it away would spell a different name.
  if (shapes.signs.has(left.span.offset) && (left.kind === '-' || left.kind === '+')) return false;

  // Inside a bracket, against the bracket.
  if (left.kind === '(' || left.kind === '[') return false;
  if (right.kind === ')' || right.kind === ']') return false;

  // A comma belongs to the item before it.
  if (right.kind === ',') return false;

  // A dotted name is one name to read, so it is printed as one.
  if (left.kind === '.' || right.kind === '.') return false;

  // A bracket that is not grouping an expression is an argument list, a
  // parameter list or an index, and all three touch what they are applied to.
  if ((right.kind === '(' || right.kind === '[') && !shapes.grouped.has(right.span.offset)) {
    return false;
  }

  // A type annotation's colon belongs to the name it follows. A ternary's has a
  // space on both sides, which is what the default already gives it.
  if (right.kind === ':' && !shapes.arms.has(right.span.offset)) return false;

  return true;
}
