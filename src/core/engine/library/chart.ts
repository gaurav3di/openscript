/**
 * The calls that read something other than the bars: the instrument, the
 * session, the position, and the order functions.
 *
 * `compiled-program.md` 5.2 lists what an engine reads from the host and from
 * nowhere else, and every `chart` entry here is one row of that list. Two of
 * them are deliberately not: `chart.intervalMinutes` and `chart.isIntraday` are
 * derived from the interval string rather than read, which keeps them from
 * disagreeing with the interval they describe.
 *
 * **The five `pos` entries are not host facts at all.** They read the run's own
 * ledger (`stdlib.md` 17.7), folded from the orders this strategy sent and the
 * fills the destination reported for them. An account position is held per
 * contract and shared with every other strategy trading it, so a script that
 * read one would be deciding against somebody else's trade (`stdlib.md` 17.1).
 *
 * **An order call performs nothing.** It appends a record to the pending effect
 * list and pushes absent, and the list is applied at step 9 only when the bar is
 * confirmed. The consequence is the one `language.md` 7.5 promises: a condition
 * that was true halfway through a bar and false when it closed never places an
 * order at all, because the execution that produced the pending record was
 * thrown away. That is why every entry below with an effect is `deferred` and
 * has no body: the machine never calls it.
 */
import type { Value } from '../values/index.js';
import { deferred, entry } from './binding.js';
import type { ManifestEntry } from './binding.js';

/**
 * Minutes in an interval code, or absent for a code that is not intraday.
 *
 * The grammar is the smallest thing that covers the codes a host serves: a
 * count of minutes written bare, or a count with a unit letter. It is derived
 * rather than read so that a study cannot see a `chart.interval` of one value
 * and a `chart.intervalMinutes` of another.
 */
const INTERVAL = /^(\d+)([smhDWM]?)$/;

const MINUTES: Readonly<Record<string, number>> = {
  s: 1 / 60,
  '': 1,
  m: 1,
  h: 60,
  D: 60 * 24,
  W: 60 * 24 * 7,
};

function intervalMinutes(code: string | null): number | null {
  if (code === null) return null;
  const parsed = INTERVAL.exec(code);
  if (parsed === null) return null;
  const count = Number(parsed[1]);
  const unit = parsed[2] ?? '';
  // A month is not a fixed number of minutes, so it has no answer here rather
  // than an average that would be wrong in every month.
  if (unit === 'M') return null;
  const scale = MINUTES[unit];
  return scale === undefined ? null : count * scale;
}

export const CHART_ENTRIES: readonly ManifestEntry[] = [
  entry('chart.symbol', '', (ctx) => ctx.host.symbol()),
  entry('chart.exchange', '', (ctx) => ctx.host.exchange()),
  entry('chart.interval', '', (ctx) => ctx.host.interval()),
  entry('chart.timezone', '', (ctx) => ctx.host.timezone()),
  entry('chart.tickSize', '', (ctx) => ctx.host.tickSize()),
  entry('chart.lotSize', '', (ctx) => ctx.host.lotSize()),
  entry('chart.pointValue', '', (ctx) => ctx.host.pointValue()),
  entry('chart.currency', '', (ctx) => ctx.host.currency()),
  entry('chart.instrumentType', '', (ctx) => ctx.host.instrumentType()),
  entry('chart.hasVolume', '', (ctx) => ctx.host.hasVolume()),
  entry('chart.hasOpenInterest', '', (ctx) => ctx.host.hasOpenInterest()),
  entry('chart.now', '', (ctx) => ctx.host.now()),

  entry('chart.intervalMinutes', '', (ctx) => {
    const code = ctx.host.interval();
    return intervalMinutes(typeof code === 'string' ? code : null);
  }),

  entry('chart.isIntraday', '', (ctx) => {
    const code = ctx.host.interval();
    const minutes = intervalMinutes(typeof code === 'string' ? code : null);
    return minutes === null ? null : minutes < 60 * 24;
  }),

  entry('req.isReady', 'read', (ctx, args) => ctx.host.requestReady(args[0] ?? null)),
  entry('req.error', 'read', (ctx, args) => ctx.host.requestError(args[0] ?? null)),

  entry('session.isFirstBar', '', (ctx) => ctx.bar.isSessionFirst),
  entry('session.isLastBar', '', (ctx) => ctx.bar.isSessionLast),

  entry('pos.size', '', (ctx) => ctx.position.size()),
  entry('pos.avgPrice', '', (ctx) => ctx.position.avgPrice()),
  entry('pos.isLong', '', (ctx) => sideOf(ctx.position.size(), 1)),
  entry('pos.isShort', '', (ctx) => sideOf(ctx.position.size(), -1)),
  entry('pos.isFlat', '', (ctx) => sideOf(ctx.position.size(), 0)),

  deferred('print', 'value', 'log'),
  deferred('buy', 'qty limit stop tag leg', 'order'),
  deferred('sell', 'qty limit stop tag leg', 'order'),
  deferred('close', 'tag qty leg', 'order'),
  deferred('exit', 'tag qty limit stop profit loss leg', 'order'),
  deferred('cancel', 'tag', 'order'),
  deferred('cancelAll', '', 'order'),
  deferred('order.place', 'side qty type price trigger tag leg', 'order'),
  deferred('order.reverse', 'qty tag leg', 'order'),
  deferred('order.bracket', 'tag profit loss leg', 'order'),
];

/** Which side a position is on, absent where the size is not a number. */
function sideOf(size: Value, want: number): boolean | null {
  if (typeof size !== 'number') return null;
  const side = size > 0 ? 1 : size < 0 ? -1 : 0;
  return side === want;
}
