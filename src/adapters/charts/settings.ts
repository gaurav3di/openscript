/**
 * The declared inputs, in both directions.
 *
 * Out: one settings row per `input()` call, which is the whole of the generated
 * settings dialog. The program already carries the label, the group, the help
 * text, the bounds and the choices, because a settings dialog and a legend have
 * to exist before the first bar runs, so nothing here decides anything. It
 * translates a `kind` into the control a chart renders.
 *
 * Back in: what a dialog stored, turned into the values the engine validates.
 * Two kinds need work and the rest pass through untouched. A colour arrives as a
 * CSS string and has to become four numbers. A choice arrives as a string even
 * when the script wrote numbers, because a select control has string values, so
 * the stored string is matched against the declared options and the option's own
 * value is what the engine is given.
 *
 * **A value the host stored and this module cannot convert is passed through
 * rather than replaced.** The engine refuses it with OS6019, naming the key and
 * the rule it broke. Substituting the default here would be a settings dialog
 * that silently ignores what a user typed, which is the failure `2.6` is written
 * to prevent, and it would hide it one layer further down than the engine does.
 */
import type { CompiledInput, CompiledProgram, Constant } from '../../core/emit/index.js';
import { constantValue } from '../../core/engine/index.js';
import type { Value } from '../../core/engine/index.js';
import { cssColour, isColourValue, parseColour } from './colours.js';
import type { ChartInput, ChartSettings, ChartSource } from './contract.js';
import type { InputLookup } from './fields.js';

/** The eight series a `"source"` input may select, in the order 2.6 lists them. */
const SOURCES: readonly string[] = [
  'open',
  'high',
  'low',
  'close',
  'hl2',
  'hlc3',
  'ohlc4',
  'volume',
];

/** One settings row per declared input, in source order. */
export function inputRows(program: CompiledProgram): readonly ChartInput[] {
  const rows: ChartInput[] = [];
  for (const declared of program.inputs) rows.push(rowFor(declared));
  return rows;
}

/**
 * What the engine is handed as the host's settings.
 *
 * Only the declared keys travel. A chart's settings object also carries the
 * generated per-plot appearance keys and the chart's timezone, and an engine
 * given those would have nothing to do with them; leaving them out keeps the
 * two vocabularies from having to agree on anything but the input keys.
 */
export function engineSettings(
  program: CompiledProgram,
  settings: ChartSettings,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const declared of program.inputs) {
    const supplied = storedValue(declared, settings);
    if (supplied !== undefined) out[declared.key] = supplied;
  }
  return out;
}

/** The value each declared input currently holds, for a declaration field. */
export function lookupFor(program: CompiledProgram, settings: ChartSettings): InputLookup {
  return (key: string): Value => {
    const declared = program.inputs.find((one) => one.key === key);
    if (declared === undefined) return null;
    return effectiveValue(declared, settings);
  };
}

/**
 * A comparable spelling of every declared input's value.
 *
 * The incremental path is only valid while the engine it holds was loaded from
 * the same settings, and comparing the two spellings is cheaper and safer than
 * trusting a chart to have told us that a settings change happened.
 */
export function signatureOf(program: CompiledProgram, settings: ChartSettings): string {
  const parts: string[] = [];
  for (const declared of program.inputs) {
    parts.push(`${declared.key}=${spell(effectiveValue(declared, settings))}`);
  }
  return parts.join('\u0000');
}

/** The declared default, as the value model holds it. */
export function defaultValue(declared: CompiledInput): Value {
  return constantValue(declared.default);
}

function rowFor(declared: CompiledInput): ChartInput {
  const held = defaultValue(declared);
  const label = declared.label;
  const key = declared.key;
  const extra = {
    ...(declared.group === '' ? {} : { group: declared.group }),
    ...(declared.tooltip === null ? {} : { tooltip: declared.tooltip }),
  };

  // A choice is a choice whatever the type of its members. The compiled kind is
  // `"select"` only where the values are strings, so a script that constrained a
  // length to two numbers arrives as a number carrying options, and a spinner
  // would offer every value between them: the engine validates a number against
  // its bounds and not against its options, so nothing downstream would refuse
  // the third value a user typed. The declared choices are the control.
  const options = declared.options ?? [];
  if (options.length > 0) {
    return {
      key,
      type: 'select',
      label,
      default: spell(held),
      options: options.map((one) => {
        const text = spell(constantValue(one));
        return { label: text, value: text };
      }),
      ...extra,
    };
  }

  switch (declared.kind) {
    case 'number':
      return {
        key,
        type: 'number',
        label,
        default: typeof held === 'number' ? held : 0,
        ...(declared.min === null ? {} : { min: declared.min }),
        ...(declared.max === null ? {} : { max: declared.max }),
        ...(declared.step === null ? {} : { step: declared.step }),
        ...extra,
      };
    case 'bool':
      return { key, type: 'boolean', label, default: held === true, ...extra };
    case 'color':
      return {
        key,
        type: 'color',
        label,
        default: isColourValue(held) ? cssColour(held) : 'rgba(0, 0, 0, 1)',
        ...extra,
      };
    case 'source':
      return {
        key,
        type: 'source',
        label,
        default: typeof held === 'string' && SOURCES.includes(held) ? (held as ChartSource) : 'close',
        ...extra,
      };
    case 'interval':
      return { key, type: 'interval', label, default: typeof held === 'string' ? held : '', ...extra };
    case 'time':
      return { key, type: 'time', label, default: typeof held === 'string' ? held : '', ...extra };
    default:
      return { key, type: 'text', label, default: typeof held === 'string' ? held : '', ...extra };
  }
}

/** What the host stored for this input, converted, or nothing when it stored none. */
function storedValue(declared: CompiledInput, settings: ChartSettings): unknown {
  if (!Object.prototype.hasOwnProperty.call(settings, declared.key)) return undefined;
  const supplied = settings[declared.key];
  if (supplied === undefined) return undefined;

  if (declared.kind === 'color' && typeof supplied === 'string') {
    // A swatch has no alpha channel, so a stored colour that states none keeps
    // the alpha the script declared. See `colours.ts`.
    const held = defaultValue(declared);
    const parsed = parseColour(supplied, isColourValue(held) ? held.a : 1);
    return parsed ?? supplied;
  }

  if (declared.options !== null && typeof supplied === 'string') {
    // The control's values are strings even where the declared choices are not,
    // so a stored choice is matched on its own spelling and the engine is given
    // the option the script wrote rather than the text of it.
    const chosen = optionFor(declared.options, supplied);
    return chosen === undefined ? supplied : chosen;
  }

  return supplied;
}

/** The effective value: the host's when it is one this adapter can read. */
function effectiveValue(declared: CompiledInput, settings: ChartSettings): Value {
  const stored = storedValue(declared, settings);
  if (stored === undefined || stored === null) return defaultValue(declared);
  if (typeof stored === 'number' || typeof stored === 'boolean' || typeof stored === 'string') {
    return stored;
  }
  return isColourValue(stored as Value) ? (stored as Value) : defaultValue(declared);
}

/** The declared option a stored string names, matched on its own spelling. */
function optionFor(options: readonly Constant[], supplied: string): Value | undefined {
  for (const option of options) {
    const value = constantValue(option);
    if (spell(value) === supplied) return value;
  }
  return undefined;
}

/** A value as a settings control spells it. */
function spell(value: Value): string {
  if (value === null) return '';
  if (isColourValue(value)) return cssColour(value);
  if (typeof value === 'object') return '';
  return String(value);
}
