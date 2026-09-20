/**
 * `date.format(t, pattern, zone)`: the closed placeholder set of `stdlib.md`
 * section 12.3 and nothing else.
 *
 * The set is small and closed on purpose, so that two engines cannot differ
 * about what a pattern means. Every character that is not one of the eight
 * placeholders is copied through exactly as written, including a letter that
 * looks like part of one: the scan below takes the longest placeholder that
 * starts at each position and moves past it, so `MMM` is the month name and the
 * `MM` inside it is never read a second time.
 *
 * Month and weekday abbreviations are English and invariant, for the same
 * determinism reason `str.upper` is: a name that followed the reader's locale
 * would make one chart's label depend on who opened it.
 */
import type { Civil } from './civil.js';
import { dayNumber, weekdayOfDay } from './civil.js';

const MONTHS: readonly string[] = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const WEEKDAYS: readonly string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The placeholders, longest first, which is the order the scan tries them in. */
const PLACEHOLDERS: readonly string[] = ['yyyy', 'MMM', 'EEE', 'MM', 'dd', 'HH', 'mm', 'ss'];

function pad(value: number, width: number): string {
  const digits = Math.abs(Math.trunc(value)).toString();
  const padded = digits.length >= width ? digits : '0'.repeat(width - digits.length) + digits;
  return value < 0 ? `-${padded}` : padded;
}

function substitution(token: string, fields: Civil): string {
  switch (token) {
    case 'yyyy':
      return pad(fields.year, 4);
    case 'MMM':
      return MONTHS[fields.month - 1] ?? '';
    case 'EEE':
      return WEEKDAYS[weekdayOfDay(dayNumber(fields.year, fields.month, fields.day)) - 1] ?? '';
    case 'MM':
      return pad(fields.month, 2);
    case 'dd':
      return pad(fields.day, 2);
    case 'HH':
      return pad(fields.hour, 2);
    case 'mm':
      return pad(fields.minute, 2);
    default:
      return pad(fields.second, 2);
  }
}

/** A pattern rendered against one civil reading, or nothing when there is none. */
export function renderPattern(pattern: string | null, fields: Civil | null): string | null {
  if (pattern === null || fields === null) return null;
  let out = '';
  let at = 0;
  while (at < pattern.length) {
    const token = PLACEHOLDERS.find((one) => pattern.startsWith(one, at));
    if (token === undefined) {
      out += pattern[at];
      at += 1;
      continue;
    }
    out += substitution(token, fields);
    at += token.length;
  }
  return out;
}
