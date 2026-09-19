/**
 * The file's fixed shape, recorded as the calls that declare it are met.
 *
 * `plot`, `plotCandles`, `fill`, `level` and `table` each reserve a field of
 * the chart descriptor (`compiled-program.md` 2.8), and the order they are
 * written in is the order that descriptor carries and a legend shows. So they
 * are collected in source order and nothing sorts them afterwards: the script
 * already decided, and a second decision here would be a second answer.
 *
 * The two warnings below belong to one particular call rather than to calls in
 * general, which is why they are here and not in the argument checking.
 */
import type { Argument } from '../ast/index.js';
import type { Checker } from './checker.js';
import type { CheckedCall } from './checked.js';
import type { LibraryEntry } from './library.js';
import { literalString } from './literals.js';

const OUTPUT_FORMS = new Set(['plot', 'plotCandles', 'fill', 'level', 'table']);

export function recordOutput(
  checker: Checker,
  entry: LibraryEntry,
  checked: CheckedCall,
): void {
  if (!OUTPUT_FORMS.has(entry.name)) return;
  const form = entry.name as 'plot' | 'plotCandles' | 'fill' | 'level' | 'table';
  const title = literalString(argumentFor(entry, checked, 'title')?.value) ?? '';
  const value = argumentFor(entry, checked, 'value') ?? argumentFor(entry, checked, 'price');
  const warmup = value === undefined ? checked.warmup : checker.warmupOf(value.value);

  checker.outputs.push({
    id: checker.outputs.length,
    form,
    title,
    call: checked.call,
    warmup,
    span: checked.call.span,
  });

  // A column whose value is absent on every bar draws nothing at all, and a
  // reader deserves to know that before they run the study and wonder why.
  if ((form === 'plot' || form === 'plotCandles') && warmup.kind === 'never') {
    checker.report('OS8009', checked.call.span, { title: quoted(title) });
  }
}

export function reportCallWarnings(
  checker: Checker,
  entry: LibraryEntry,
  checked: CheckedCall,
): void {
  if (entry.name === 'alert') {
    reportAlertWarnings(checker, entry, checked);
    return;
  }

  // precision and format on a plot set the formatting of the price scale the
  // plot maps to, so setting them over the price pane reformats the
  // instrument's own axis, which is almost never what was wanted.
  if (entry.name !== 'plot' || checker.declaration?.overlay !== true) return;
  const title = quoted(literalString(argumentFor(entry, checked, 'title')?.value) ?? '');
  for (const option of ['precision', 'format']) {
    if (argumentFor(entry, checked, option) === undefined) continue;
    checker.report('OS8007', checked.call.span, { title, option });
  }
}

function reportAlertWarnings(
  checker: Checker,
  entry: LibraryEntry,
  checked: CheckedCall,
): void {
  // With no id the compiler derives one from the call's position, which changes
  // the moment a line is inserted above it and breaks a subscription with it.
  if (argumentFor(entry, checked, 'id') === undefined) {
    checker.report('OS8008', checked.call.span, { line: checked.call.span.line });
  }

  // An alert on every execution of the bar can only fire in a file that acts on
  // a bar that is still moving (stdlib.md 16.2).
  const frequency = argumentFor(entry, checked, 'frequency');
  const written = literalString(frequency?.value);
  if (written !== 'everyUpdate' || checker.declaration?.onUnconfirmed === true) return;
  checker.report('OS3009', frequency?.span ?? checked.call.span, {
    option: 'frequency',
    value: written,
    required: 'onUnconfirmed = true',
  });
}

function argumentFor(
  entry: LibraryEntry,
  checked: CheckedCall,
  name: string,
): Argument | undefined {
  const index = entry.parameters.findIndex((one) => one.name === name);
  return index < 0 ? undefined : checked.arguments[index];
}

function quoted(text: string): string {
  return `"${text}"`;
}
