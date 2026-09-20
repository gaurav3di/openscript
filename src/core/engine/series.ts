/**
 * The two things the engine checks about the bars it is handed,
 * `host-interface.md` 3.5 and conformance item 1.
 *
 * Everything else about a series the engine takes exactly as stated: it does
 * not adjust, round, resample, deduplicate or reorder what it is given (3.2),
 * because each of those is a decision with a market consequence and the party
 * that knows the market makes it. These two are not decisions. They are the
 * cases where the engine cannot compute anything at all and would otherwise
 * compute something anyway.
 *
 * **No bars is not an empty chart, it is an unanswerable question.** The script
 * is the body of the per-bar loop, so a loop over nothing draws nothing, and a
 * pane with nothing in it looks exactly like a study that ran and had nothing
 * to say. One of those is worth a sentence to the user and the other is not,
 * and only the engine can tell them apart.
 *
 * **A repeated or a reversed timestamp is worse, because it computes.** The
 * history operator, warmup and every session test are defined against a time
 * that strictly increases (3.2). Hand over a swapped pair or the same bar twice
 * and none of them means what it says, every number downstream is derived from
 * a history that never happened, and nothing on the chart marks which ones. The
 * wrongness enters at the boundary, which is the one place it cannot be
 * attributed to anything later.
 *
 * **What it costs: one comparison per bar handed over, and no allocation.** The
 * check is on the hand-over rather than on the execution, so a bar that moves
 * and is executed a hundred times is compared once per hand-over rather than
 * once per execution, and a series that is handed over once is walked once. On
 * fifty thousand bars that is fifty thousand comparisons of two numbers against
 * a full compute of the same fifty thousand bars, which is the relationship
 * that makes an honest check of the whole series affordable: it is paid at the
 * load and never again.
 */
import type { Diagnostic } from '../diagnostics/index.js';
import type { HostBar } from './bars.js';
import { NO_POSITION, failure } from './errors.js';
import type { Instrument } from './host.js';

/** The spelling a reason uses for a fact the record does not hold. */
const UNNAMED_INSTRUMENT = 'the chart\'s instrument';
const UNNAMED_INTERVAL = 'the chart\'s interval';

/**
 * A run over nothing, OS6010.
 *
 * It names the instrument and the interval because the fix is to choose a pair
 * that has history, and a sentence that does not say which pair was empty
 * sends the reader back to the chart to work it out.
 */
export function noBars(instrument: Instrument | undefined): Diagnostic {
  return failure('OS6010', NO_POSITION, {
    symbol: instrument?.symbol ?? UNNAMED_INSTRUMENT,
    timeframe: instrument?.interval ?? UNNAMED_INTERVAL,
  });
}

/**
 * A bar whose time does not follow the one before it, OS6011.
 *
 * The first such bar and not a count of them, because the fix is the same
 * whether the feed sent one duplicate or a thousand, and the first one is the
 * only one whose position tells the host where its own ordering went wrong.
 *
 * `previous` is the bar already handed over, or nothing for the first bar of a
 * run, which follows nothing and is therefore always in order. A time the host
 * did not state is not compared: the absent value is what `barField` gives a
 * script for it (3.1), and the catalogue has no code for a bar dated nothing,
 * so inventing this one for it would be a refusal the specification does not
 * describe.
 */
export function outOfOrder(
  bar: HostBar,
  previous: HostBar | undefined,
  index: number,
): Diagnostic | undefined {
  const time = bar.time;
  const before = previous?.time;
  if (typeof time !== 'number' || typeof before !== 'number') return undefined;
  if (time > before) return undefined;
  return failure('OS6011', NO_POSITION, { index, time, previous: index - 1 });
}
