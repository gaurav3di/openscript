/**
 * Hover and signature, as the editor's tooltips.
 *
 * This is the one part of the adapter that would put something on screen, and it
 * is the one part that does not: the markup is a parameter, and there is no
 * default for it. So nothing in this package, at any tier, names a browser
 * global, and `scripts/check-layering.mjs` fails the build if anything under
 * `src` does. The same files load in a worker, on a server and inside somebody
 * else's application.
 *
 * It costs a host four lines and it is the whole point of the split. Every
 * platform has a design system and none of them wants to fight a styled panel
 * that arrived with a language package; a default renderer here would be that
 * panel, and it would be the one thing in this adapter a host could not replace
 * without replacing the adapter.
 *
 * What is not a parameter is the content. `hoverLines` and `signatureLines`
 * below are what a tooltip says, in order, and every line of it came from the
 * compiler: the signatures from the library manifest, the sentence and the
 * warmup from the specification's own tables, the type from the checker, and the
 * refusal from the error catalogue.
 *
 * ```ts
 * hoverTooltip(openscriptHoverTooltip((held) => ({ dom: yourPanel(hoverLines(held)) })))
 * ```
 */
import { hover, signature } from '../../editor/index.js';
import type { Hover, SignatureHelp } from '../../editor/index.js';
import type { EditorState, EditorTooltip, EditorTooltipView, EditorView } from './contract.js';
import { documentOf, normalisedOffset } from './positions.js';

/** What a host supplies to draw a tooltip, which is the whole of the markup. */
export interface Renderer<Held> {
  (held: Held): EditorTooltipView;
}

/**
 * The lines a hover shows, in the order it shows them.
 *
 * Every one of them came from the compiler: the signatures from the library
 * manifest, the sentence and the warmup from the specification's own tables, the
 * type from the checker, and the refusal from the error catalogue. Nothing is
 * written here, which is why this function is a join rather than a template.
 */
export function hoverLines(held: Hover): readonly string[] {
  const lines = [...held.signatures];
  if (held.summary !== undefined) lines.push(held.summary);
  if (held.warmup !== undefined) lines.push(`First value: ${held.warmup}`);
  if (held.refusal !== undefined) lines.push(held.refusal);
  if (held.kind === 'keyword') lines.push('A reserved word of the language.');
  return lines;
}

/** The lines a signature tooltip shows, with the active parameter named. */
export function signatureLines(held: SignatureHelp): readonly string[] {
  const lines = [held.signature];
  const active = held.parameters[held.active];
  if (active !== undefined) {
    const value = active.defaultText === undefined ? '' : ` = ${active.defaultText}`;
    const need = active.required ? 'required' : 'optional';
    lines.push(`${active.name}: ${active.type}${value} (${need})`);
    if (active.values.length > 0) lines.push(`One of: ${active.values.join(', ')}`);
  }
  if (held.summary !== undefined) lines.push(held.summary);
  if (held.refusal !== undefined) lines.push(held.refusal);
  return lines;
}

/**
 * A hover tooltip source, which a host wires in one line.
 *
 * ```ts
 * hoverTooltip(openscriptHoverTooltip(render))
 * ```
 */
export function openscriptHoverTooltip(
  render: Renderer<Hover>,
): (view: EditorView, pos: number) => EditorTooltip | null {
  return (view, pos) => {
    const held = documentOf(view.state.doc.toString());
    const found = hover(held.text, normalisedOffset(held, pos));
    if (found === undefined) return null;
    return {
      pos: held.at(found.span.offset),
      end: held.at(found.span.offset + found.span.length),
      create: () => render(found),
    };
  };
}

/**
 * A signature tooltip for wherever the cursor is, or nothing where it is in no
 * call.
 *
 * ```ts
 * showTooltip.compute(["doc", "selection"], openscriptSignatureTooltip(render))
 * ```
 */
export function openscriptSignatureTooltip(
  render: Renderer<SignatureHelp>,
): (state: EditorState) => EditorTooltip | null {
  return (state) => {
    const held = documentOf(state.doc.toString());
    const at = normalisedOffset(held, state.selection.main.head);
    const found = signature(held.text, at);
    if (found === undefined) return null;
    return {
      pos: state.selection.main.head,
      above: true,
      create: () => render(found),
    };
  };
}
