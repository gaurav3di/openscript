/**
 * The editor component's own shapes, as this adapter targets them.
 *
 * **Why they are declared here rather than imported.** The editor component is a
 * peer dependency: a host that wants a text area installs it, and a host that
 * wants only the language must not be made to. This repository therefore does
 * not install it, cannot type check against it, and would fail its own layering
 * check the moment a file here imported it. It is the same decision the chart
 * adapter took, for the same reason, and `src/adapters/charts/contract.ts` says
 * it at length.
 *
 * So the shapes this produces values for are declared below and the host's own
 * build is where the two meet. Each one is a one line check that costs a host
 * nothing and fails to compile if this file has drifted:
 *
 * ```ts
 * import type { StreamParser } from "<the editor's language package>";
 * import type { CompletionSource } from "<the editor's completion package>";
 * import type { Diagnostic } from "<the editor's lint package>";
 *
 * const parser: StreamParser<unknown> = openscriptStream;
 * const source: CompletionSource = openscriptCompletion;
 * const linter: (view: EditorView) => Diagnostic[] = openscriptLint;
 * ```
 *
 * **That line catches a value of the wrong shape and not an argument of the
 * wrong shape.** A method's parameters are compared in both directions, so a
 * hook declared here as taking something the editor never passes still assigns.
 * That is the failure the chart adapter has actually made, so every member below
 * takes the editor's own argument, spelled as the editor spells it, and every
 * test drives each one with the argument the editor passes rather than with one
 * of its own.
 *
 * **A style name is not checked by any of those lines.** The names this adapter
 * returns from `token` are looked up by the editor in its own table of
 * highlighting tags at run time, and an unknown one is a warning on a console
 * rather than a compile error. That is why the whole mapping is one exported
 * record a host can replace in a line, and why it is recorded in
 * `spec/editor-narrowings.json` as the one thing here a type cannot hold.
 */

/**
 * One line of the document, as the editor's tokenizer sees it.
 *
 * The editor hands a tokenizer a line at a time and expects `pos` to have moved
 * forward when `token` returns. Only the members this adapter reads are
 * declared: a narrower shape is still assignable from the editor's wider one.
 */
export interface EditorStringStream {
  /** The line's text, without its line ending. */
  readonly string: string;
  /** Where the tokenizer has got to, which this adapter moves. */
  pos: number;
  /** Where the current token began. */
  readonly start: number;
  /** Whether `pos` is at the end of the line. */
  eol(): boolean;
  /** Whether `pos` is at the start of the line. */
  sol(): boolean;
}

/**
 * A tokenizer the editor drives one line at a time.
 *
 * `token` returns a style name, or null for text with no style of its own. The
 * state is the tokenizer's to define, and the editor copies it at line
 * boundaries so that it can restart mid document, which is why `copyState` is
 * here.
 */
export interface EditorStreamParser<State> {
  readonly name?: string;
  startState?(indentUnit: number): State;
  token(stream: EditorStringStream, state: State): string | null;
  copyState?(state: State): State;
  blankLine?(state: State, indentUnit: number): void;
  readonly languageData?: Readonly<Record<string, unknown>>;
}

/** The document, which the editor holds as a rope rather than as a string. */
export interface EditorText {
  readonly length: number;
  toString(): string;
}

/** The part of the editor's state this adapter reads. */
export interface EditorState {
  readonly doc: EditorText;
  readonly selection: {
    readonly main: { readonly head: number; readonly from: number; readonly to: number };
  };
}

/** The part of the editor's view this adapter reads and dispatches to. */
export interface EditorView {
  readonly state: EditorState;
  dispatch(transaction: {
    readonly changes: { readonly from: number; readonly to: number; readonly insert: string };
    readonly selection?: { readonly anchor: number };
    readonly scrollIntoView?: boolean;
  }): void;
}

/** What the editor hands a completion source. */
export interface EditorCompletionContext {
  readonly state: EditorState;
  readonly pos: number;
  /** Whether the writer asked for completions rather than merely typing. */
  readonly explicit: boolean;
}

/** One row of the editor's completion list. */
export interface EditorCompletion {
  readonly label: string;
  /** The editor's own name for the icon beside a row. */
  readonly type?: string;
  readonly detail?: string;
  readonly info?: string;
  /** The text to insert, where it differs from the label. */
  readonly apply?: string;
  /** Moves a row up or down the list, from -99 to 99. */
  readonly boost?: number;
}

export interface EditorCompletionResult {
  readonly from: number;
  readonly to?: number;
  readonly options: readonly EditorCompletion[];
  /** False when the list is already filtered, which this adapter's is. */
  readonly filter?: boolean;
}

/** One squiggle in the editor's lint panel and gutter. */
export interface EditorDiagnostic {
  readonly from: number;
  readonly to: number;
  readonly severity: 'hint' | 'info' | 'warning' | 'error';
  readonly message: string;
  /** Where the diagnostic came from, shown beside the message. */
  readonly source?: string;
  readonly actions?: readonly {
    readonly name: string;
    apply(view: EditorView, from: number, to: number): void;
  }[];
}

/** What the editor shows over the text, and the element it shows. */
export interface EditorTooltipView {
  readonly dom: unknown;
}

export interface EditorTooltip {
  readonly pos: number;
  readonly end?: number;
  readonly above?: boolean;
  create(view: EditorView): EditorTooltipView;
}
