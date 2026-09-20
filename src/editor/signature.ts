/**
 * `signature`: the call being written, and which parameter the cursor is in.
 *
 * The call is found from the brackets rather than from the tree, because a call
 * being written has no finished tree node: `ema(close, ` is the state every call
 * is in while somebody types one, and that is exactly when this is asked.
 * `site.ts` does that part.
 *
 * ## The default shown is the default the compiler applies
 *
 * This is the trap worth naming, because getting it wrong produces a tooltip
 * that is confidently wrong rather than absent. `stdlib.md` states a default for
 * every optional argument, and `scripts/check-defaults.mjs` already holds the
 * compiler to those: a value the surface carries that the specification does not
 * state fails the build, and so does one the specification states that the
 * compiler does not apply.
 *
 * So this reads the same two places that check reads, through `parametersOf`:
 * the library manifest for an ordinary call, and the emitter for the eight
 * declaration calls whose optional arguments become fields of a declaration
 * rather than arguments. A number shown here therefore cannot differ from the
 * number the compiler fills in; if it ever does, the defaults check fails before
 * anybody sees the tooltip.
 *
 * A writer's own function is answered too, from the checker's record of it. Its
 * parameter types are the ones the checker worked out, and a default it declares
 * is quoted from the source text rather than printed from the tree, because the
 * text is what the writer wrote.
 */
import { endOffset, entryFor, fillTemplate, proseFor, typeText } from '../core/index.js';
import type { CheckedScript, Span } from '../core/index.js';
import { entryAt, parametersOf, signatureTextOf } from './manifest.js';
import type { Parameter } from './manifest.js';
import { readChecked } from './reading.js';
import { siteAt } from './site.js';
import type { CallSite } from './site.js';

export interface SignatureHelp {
  /** The callee as written: `ema`, `draw.box`, or a name the file declared. */
  readonly name: string;
  /** Whether the library holds it or the file declares it. */
  readonly of: 'library' | 'declared';
  /** The signature written out, the way the specification's tables write one. */
  readonly signature: string;
  readonly parameters: readonly Parameter[];
  /**
   * Which parameter the cursor is in, or -1 where it is in none.
   *
   * A label decides it where one is written, because `plot(close, color = ` is
   * in `color` whatever position it sits in; otherwise the count of commas
   * decides. It is -1 past the last parameter, which is a call with more
   * arguments than the signature takes and is OS3001 the moment it is compiled.
   */
  readonly active: number;
  /** The line the specification gives the call, where it gives one. */
  readonly summary: string | undefined;
  /** Named in the library and not implemented in this version: OS2020. */
  readonly planned: boolean;
  readonly refusal: string | undefined;
  /** The callee's own name, for a host anchoring a tooltip to the call. */
  readonly span: Span;
}

/** Which parameter a position in the argument list means. */
function activeIn(parameters: readonly Parameter[], call: CallSite): number {
  if (call.label !== undefined) {
    return parameters.findIndex((one) => one.name === call.label);
  }
  return call.argument < parameters.length ? call.argument : -1;
}

/**
 * A function the file declares, as the checker recorded it.
 *
 * `language.md` 11.1 lets a parameter carry a default, and the text of that
 * default is quoted from the source rather than printed back from the tree: the
 * tree holds an expression and printing one would be a second formatter, while
 * the source holds what the writer typed.
 */
function declaredSignature(
  checked: CheckedScript,
  text: string,
  call: CallSite,
): SignatureHelp | undefined {
  const held = checked.functions.find((one) => one.declaration.name.text === call.name);
  if (held === undefined) return undefined;

  const parameters: Parameter[] = held.declaration.parameters.map((one, index) => {
    const value = one.defaultValue;
    const binding = held.parameters[index];
    return {
      name: one.name.text,
      type: binding === undefined ? 'unknown' : typeText(binding.type),
      required: value === undefined,
      defaultText:
        value === undefined ? undefined : text.slice(value.span.offset, endOffset(value.span)),
      values: [],
    };
  });

  const written = parameters.map((one) => {
    const head = `${one.name}${one.required ? '' : '?'}: ${one.type}`;
    return one.defaultText === undefined ? head : `${head} = ${one.defaultText}`;
  });

  return {
    name: call.name,
    of: 'declared',
    signature: `fn ${call.name}(${written.join(', ')})`,
    parameters,
    active: activeIn(parameters, call),
    summary: undefined,
    planned: false,
    refusal: undefined,
    span: call.nameSpan,
  };
}

/**
 * The call the cursor is inside, or nothing where it is inside none.
 *
 * Nothing is the answer for a cursor outside every bracket, and for one inside a
 * bracket whose callee the language does not have: a name that resolves to
 * neither the library nor the file is OS2001, and `diagnose` is what says so.
 * A tooltip that invented a signature for it would be a second opinion about
 * what the file declares.
 */
export function signature(source: string, offset: number): SignatureHelp | undefined {
  const { file, tokens, checked } = readChecked(source);
  const call = siteAt(file, tokens, offset).call;
  if (call === undefined) return undefined;

  const entry = entryAt(call.name, call.argument + 1);
  if (entry === undefined) return declaredSignature(checked, file.text, call);

  const parameters = parametersOf(entry);
  return {
    name: call.name,
    of: 'library',
    signature: signatureTextOf(entry),
    parameters,
    active: activeIn(parameters, call),
    summary: proseFor(call.name)?.summary,
    planned: entry.planned,
    refusal: entry.planned
      ? fillTemplate(entryFor('OS2020').message, { name: call.name })
      : undefined,
    span: call.nameSpan,
  };
}
