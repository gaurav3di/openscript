import type { Positioned } from '../span/index.js';

/**
 * A name at the place it is written rather than the place it is read.
 *
 * A name used as a value is a `nameReference`, which the checker resolves
 * against a scope. Every other name in the language is this node instead: the
 * left side of an assignment, the name a `var` introduces, a loop variable, a
 * function's name, a parameter's name, the word after a dot, and the label of a
 * named argument.
 *
 * The two are separate kinds because a pass that walks the tree collecting uses
 * of a name must not collect the places that introduce one. With a single kind
 * every such pass has to ask the parent what it is holding, and the pass that
 * forgets reports OS2001 on the very name being declared.
 *
 * The text is not always a legal identifier: a named argument's label may be a
 * reserved word, because a label is matched against a parameter list and is
 * never looked up in a scope (language.md 3.4).
 */
export interface Name extends Positioned {
  readonly kind: 'name';
  readonly text: string;
}
