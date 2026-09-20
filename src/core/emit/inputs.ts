/**
 * `inputs[]`, one entry per `input()` call, in source order.
 *
 * Each input owns a slot in the top-level frame and the engine writes the
 * effective value into that slot at the start of every bar
 * (`compiled-program.md` 2.6 and 5.1 step 5). There is no instruction for an
 * `input()` anywhere in the program, which is why this runs before a single
 * statement is emitted: the slots have to exist first, and the two instructions
 * that keep a register in step with one have to be the first thing the bar does.
 *
 * A `"source"` input's default names a series rather than holding one, written
 * `["s", "<field>"]` in the same form as every other default. The `kind` field
 * is what says the string names a series, so the constant pool needs no tag of
 * its own for one.
 */
import type { Argument } from '../ast/index.js';
import { withoutGrouping } from '../ast/index.js';
import type { CheckedInput } from '../check/index.js';
import type { Span } from '../span/index.js';
import type { Emitter, Frame } from './context.js';
import { argumentAt, inputKey } from './context.js';
import { INPUT_DEFAULTS } from './defaults.js';
import type { CompiledInput, Constant } from './program.js';
import { constantOf } from './pool.js';
import { placementOf } from './registers.js';
import { fieldOf } from './values.js';
import type { Value } from './values.js';

export function buildInputs(e: Emitter, f: Frame): void {
  const shadows: { readonly slot: number; readonly register: number; readonly span: Span }[] = [];

  for (const input of e.checked.inputs) {
    const binding = e.checked.bindings.find((one) => one.input === input.id);
    const slot = binding === undefined ? f.layout.slot(input.name) : f.layout.slotFor(binding);
    e.inputs.push(entryFor(e, input, slot));

    if (binding === undefined) continue;
    const register = e.layout.registerFor(binding);
    if (register === undefined) continue;
    if (placementOf(e, binding) === 'slot' && !e.shadowed.has(binding.id)) continue;
    shadows.push({ slot, register, span: input.span });
  }

  // An input read through `[]`, or read from inside a `fn`, needs a register as
  // well as its slot; the engine fills the slot and this fills the register
  // from it, once, before anything reads either.
  for (const shadow of shadows) {
    f.builder.at(shadow.span);
    f.builder.push('LOAD', shadow.slot);
    f.builder.push('SSTORE', shadow.register);
  }
}

function entryFor(e: Emitter, input: CheckedInput, slot: number): CompiledInput {
  const checked = e.callAt(input.call);
  const entry = checked?.entry;
  const argument = (name: string): Argument | undefined =>
    checked === undefined || entry === undefined ? undefined : argumentAt(checked, entry, name);

  const numberOption = (name: string): number | null => {
    const written = argument(name);
    if (written === undefined) return null;
    const value = e.fold(written.value);
    return value !== undefined && value.kind === 'number' ? value.value : null;
  };

  const stringOption = (name: string, fallback: string | null): string | null => {
    const written = argument(name);
    if (written === undefined) return fallback;
    const value = e.fold(written.value);
    return value !== undefined && value.kind === 'string' ? value.value : fallback;
  };

  return {
    key: inputKey(input),
    kind: input.kind,
    label: input.title,
    default: defaultOf(e, input, argument('value')),
    min: numberOption('min'),
    max: numberOption('max'),
    step: numberOption('step'),
    options: optionsOf(e, argument('options')),
    group: stringOption('group', stringValue(INPUT_DEFAULTS['group'])) ?? '',
    // The worked example of section 12.2 writes null for an input that named no
    // tooltip, which is the one place the effective value is an absence.
    tooltip: stringOption('tooltip', null),
    slot,
  };
}

function defaultOf(e: Emitter, input: CheckedInput, written: Argument | undefined): Constant {
  if (written === undefined) return ['z', null];
  if (input.kind === 'source') {
    const inner = withoutGrouping(written.value);
    return ['s', inner.kind === 'nameReference' ? inner.name : ''];
  }
  const value = e.fold(written.value);
  if (value === undefined) return ['z', null];
  return constantOf(value) ?? ['z', null];
}

function optionsOf(e: Emitter, written: Argument | undefined): readonly Constant[] | null {
  if (written === undefined) return null;
  const value = e.fold(written.value);
  if (value === undefined || value.kind !== 'array') return null;
  const entries: Constant[] = [];
  for (const one of value.values) {
    const constant = constantOf(one);
    if (constant === undefined) return null;
    entries.push(constant);
  }
  return entries;
}

function stringValue(value: Value | undefined): string {
  const field = fieldOf(value);
  return typeof field === 'string' ? field : '';
}
