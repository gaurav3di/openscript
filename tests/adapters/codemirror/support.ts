/**
 * What the editor adapter's tests drive it with.
 *
 * The editor component is a peer dependency and this repository does not install
 * it, so the tests supply the arguments the component passes, spelled the way
 * the component spells them. That is deliberate rather than a fallback: the
 * failure the chart adapter has actually made is a hook that assigns to the
 * library's type and is never called with the library's own argument, and a test
 * driving a hook with an argument of its own invention would repeat it.
 *
 * The line reader below is the component's own: it hands a tokenizer one line,
 * expects `pos` to have moved when `token` returns, and takes the text between
 * the old position and the new one as the token.
 */
import { readFileSync, readdirSync } from 'node:fs';

import type {
  EditorState,
  EditorStringStream,
  EditorText,
  EditorView,
} from '../../../src/adapters/codemirror/index.js';

/** One line, as the component's tokenizer sees it. */
export class Stream implements EditorStringStream {
  pos = 0;
  start = 0;
  readonly string: string;

  constructor(line: string) {
    this.string = line;
  }

  eol(): boolean {
    return this.pos >= this.string.length;
  }

  sol(): boolean {
    return this.pos === 0;
  }
}

export interface Piece {
  readonly from: number;
  readonly to: number;
  readonly style: string | null;
  readonly text: string;
}

/**
 * One line's tokens, driven the way the component drives a tokenizer.
 *
 * A tokenizer that fails to advance would hang the component, so this refuses to
 * loop and says so instead: the whole point of driving it this way is that a
 * defect shows up here rather than in somebody's product.
 */
export function tokensOf(
  parser: {
    startState?(indentUnit: number): unknown;
    token(stream: EditorStringStream, state: never): string | null;
  },
  line: string,
): readonly Piece[] {
  const stream = new Stream(line);
  const state = parser.startState?.(4);
  const pieces: Piece[] = [];

  while (!stream.eol()) {
    stream.start = stream.pos;
    const style = parser.token(stream, state as never);
    if (stream.pos <= stream.start) {
      throw new Error(`the tokenizer did not advance at ${stream.start} of ${JSON.stringify(line)}`);
    }
    pieces.push({
      from: stream.start,
      to: stream.pos,
      style,
      text: line.slice(stream.start, stream.pos),
    });
  }

  return pieces;
}

/** The document, which the component holds as a rope rather than as a string. */
function textOf(source: string): EditorText {
  return { length: source.length, toString: () => source };
}

export function stateOf(source: string, head = source.length): EditorState {
  return {
    doc: textOf(source),
    selection: { main: { head, from: head, to: head } },
  };
}

/** A view that records what it was told to change rather than changing it. */
export interface Recorded extends EditorView {
  readonly changes: {
    from: number;
    to: number;
    insert: string;
    anchor: number | undefined;
  }[];
}

export function viewOf(source: string, head = source.length): Recorded {
  const changes: Recorded['changes'] = [];
  return {
    state: stateOf(source, head),
    changes,
    dispatch(transaction) {
      changes.push({
        from: transaction.changes.from,
        to: transaction.changes.to,
        insert: transaction.changes.insert,
        anchor: transaction.selection?.anchor,
      });
    },
  };
}

const ROOT = new URL('../../../../', import.meta.url);

const DIRECTORIES = ['examples/', 'tests/gate/scripts/', 'tests/gate/studies/scripts/'];

/** Every script in the repository, read from the tree rather than copied here. */
export const CORPUS: readonly { name: string; text: string }[] = DIRECTORIES.flatMap(
  (directory) => {
    const where = new URL(directory, ROOT);
    return readdirSync(where)
      .filter((name) => name.endsWith('.oscript'))
      .sort()
      .map((name) => ({ name, text: readFileSync(new URL(name, where), 'utf8') }));
  },
);
