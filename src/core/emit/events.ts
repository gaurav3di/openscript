/**
 * The four calls that draw something for one bar: a marker, an alert, a bar
 * colour and a pane background.
 *
 * All four are `EMIT` and a declared channel, and none of them is a library
 * call an engine performs. One instruction covers every drawing surface
 * (`compiled-program.md` 4.11); an instruction per surface would have added six
 * opcodes that all do the same thing and would have made every new surface a
 * format change.
 *
 * The alert is the one worth reading. `stdlib.md` 16.1 says the compiler lifts
 * each call into a watched condition whose predicate is the chain of guards
 * that reaches it. Nothing has to be lifted: the call site is only reached when
 * those guards passed, so writing `true` into the condition channel there is
 * the predicate, exactly. On a bar the guards refused, nothing writes the
 * channel and a channel nothing wrote is absent, which is no alert.
 */
import type { Call } from '../ast/index.js';
import type { Emitter, Frame } from './context.js';
import { ALERT_DEFAULTS, MARKER_DEFAULTS } from './defaults.js';
import { emitExpression } from './expressions.js';
import { argumentFor, fieldFor } from './outputs.js';

export function emitEventCall(e: Emitter, f: Frame, call: Call, name: string): void {
  switch (name) {
    case 'signal':
      emitMarker(e, f, call);
      return;
    case 'alert':
      emitAlert(e, f, call);
      return;
    case 'barColor':
      e.barColor = { channel: emitPaint(e, f, call, e.barColor?.channel, 'bar colour') };
      return;
    case 'background':
      e.background = { channel: emitPaint(e, f, call, e.background?.channel, 'background') };
      return;
    default:
      return;
  }
}

/**
 * One entry per `signal()` call site, and a channel that is held back on a bar
 * that is still moving.
 *
 * A marker is emitted when its channel holds a string for the bar and not
 * otherwise, so a call site inside an `if` produces a marker on the bars the
 * branch was taken and nothing anywhere else. The channel is not declared
 * `once` for that reason: a signal may sit under a condition, which is the
 * whole point of one.
 */
function emitMarker(e: Emitter, f: Frame, call: Call): void {
  const text = argumentFor(e, call, 'text');
  // A marker's channel is named after the text it carries when that is a
  // literal, which is what 12.2's `debug.names.channels` shows.
  const literal = text === undefined ? undefined : e.fold(text.value);
  const name = literal?.kind === 'string' ? literal.value : `marker ${e.markers.length}`;
  const channel = e.layout.channel('string', true, false, name);
  if (text === undefined) {
    f.builder.at(call.span);
    f.builder.push('CONST', e.pool.absent());
  } else {
    emitExpression(e, f, text.value);
  }
  f.builder.at(call.span);
  f.builder.push('EMIT', channel);

  e.markers.push({
    key: `m${e.markers.length}`,
    channel,
    position: fieldFor(e, call, 'at', MARKER_DEFAULTS),
    shape: fieldFor(e, call, 'shape', MARKER_DEFAULTS),
    color: fieldFor(e, call, 'color', MARKER_DEFAULTS),
    // `markers[].textColor` has no argument in the library: `signal` takes one
    // colour and it is the plate's. Null is the effective value of a field no
    // script can express, which is 2.8's own reading of a table's text size.
    textColor: null,
  });
}

function emitAlert(e: Emitter, f: Frame, call: Call): void {
  const index = e.alerts.length;
  const condChannel = e.layout.channel('bool', true, false, `alert ${index}`);
  const messageChannel = e.layout.channel('string', true, false, `alert ${index} message`);

  f.builder.at(call.span);
  f.builder.push('CONST', e.pool.bool(true));
  f.builder.push('EMIT', condChannel);

  const message = argumentFor(e, call, 'message');
  if (message === undefined) {
    f.builder.at(call.span);
    f.builder.push('CONST', e.pool.absent());
  } else {
    emitExpression(e, f, message.value);
  }
  f.builder.at(call.span);
  f.builder.push('EMIT', messageChannel);

  const id = fieldFor(e, call, 'id', ALERT_DEFAULTS);
  e.alerts.push({
    // `id` is the stable name of the entry, so a user's alert subscription
    // survives an edit to the script. With none, the compiler derives one from
    // the call's position, which is what OS8008 already warns about.
    key: typeof id === 'string' && id !== '' ? id : `a${index}`,
    title: fieldFor(e, call, 'title', ALERT_DEFAULTS),
    condChannel,
    messageChannel,
    frequency: fieldFor(e, call, 'frequency', ALERT_DEFAULTS),
  });
}

/**
 * `barColor` and `background`: one channel each per program.
 *
 * A script with three `barColor()` calls writes the same channel three times
 * and the last write on the bar wins, which is the same rule as any other
 * channel and needs no sentence of its own (2.8).
 */
function emitPaint(
  e: Emitter,
  f: Frame,
  call: Call,
  existing: number | undefined,
  name: string,
): number {
  const channel = existing ?? e.layout.channel('color', false, false, name);
  const colour = argumentFor(e, call, 'color');
  if (colour === undefined) {
    f.builder.at(call.span);
    f.builder.push('CONST', e.pool.absent());
  } else {
    emitExpression(e, f, colour.value);
  }
  f.builder.at(call.span);
  f.builder.push('EMIT', channel);
  return channel;
}
