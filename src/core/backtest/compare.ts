/**
 * Two runs, and whether the difference between them is a result.
 *
 * **Comparable first.** Two runs over different bars or a different contract are
 * two studies, not a comparison, and a table of deltas between them is a way of
 * being wrong with a decimal point. So the comparison says whether the pair is
 * comparable before it says anything about the money, and names what differs.
 *
 * **And then separation, which is the figure the difference has to clear.** The
 * gap between the two expectancies over the combined standard error is what
 * turns "this one made more" into "this one made more than the noise". It is
 * analytic: no resampling and no random number generator, so two runs of this
 * comparison over the same pair give the same number for ever, and a decision
 * taken on it is a decision anybody can reproduce.
 */
import type { Summary } from '../accounting/index.js';
import { canonicalise } from '../emit/index.js';
import type { RunRecord } from './record.js';

/** What two runs came to, beside each other. */
export interface RunComparison {
  /** False when the bars hash or the contract differ. */
  readonly comparable: boolean;
  readonly differences: readonly {
    readonly what: 'bars' | 'contract' | 'costs' | 'fill' | 'inputs' | 'program' | 'range';
    readonly detail: string;
  }[];
  readonly deltas: readonly {
    /** A field of Summary. */
    readonly name: string;
    readonly before: number;
    readonly after: number;
    readonly delta: number;
  }[];
  /** (expectancyB - expectancyA) / sqrt(seA^2 + seB^2). */
  readonly separation: number | null;
  /** Trades opening on the same bar with the same side in both. */
  readonly sharedTrades: number;
}

/** One named difference between two runs' inputs. */
type Difference = RunComparison['differences'][number];

/**
 * A Summary field worth a delta, in the order a comparison reports them.
 *
 * Written out rather than walked off the object, for two reasons. A key walk
 * would report a delta for `currency`, which is a string, and for `capital`,
 * which is an input rather than a result. And the order a comparison prints its
 * rows in would then be the order a literal happens to be written in, which is
 * a thing somebody reformats without knowing they changed an output.
 */
const COMPARED: readonly string[] = [
  'netProfit',
  'returnPercent',
  'grossProfit',
  'grossLoss',
  'charges',
  'tradeCount',
  'openTradeCount',
  'wins',
  'losses',
  'scratches',
  'winRate',
  'averageWin',
  'averageLoss',
  'expectancy',
  'expectancyStandardError',
  'profitFactor',
  'maxDrawdown',
  'maxDrawdownPercent',
  'longestDrawdownBars',
  'averageBarsHeld',
  'barsInMarket',
  'barCount',
];

/**
 * Two runs, side by side, and whether the gap between them is a result.
 *
 * **Comparable is about the inputs, not about the outputs.** Two runs over
 * different bars, or on different contracts, are two studies: the money in one
 * is not the money in the other, and subtracting them is arithmetic with no
 * meaning behind it. A different program over the same bars is the opposite of
 * that. It is the comparison somebody actually wants, so a differing program is
 * reported as a difference and does not make the pair incomparable.
 *
 * **Every difference is named even when the pair is comparable**, because the
 * reason a run improved is as often a setting somebody forgot they had changed
 * as it is the change they meant to test. A comparison reporting only the money
 * would let that through, and it would read as a result.
 */
export function compareRuns(before: RunRecord, after: RunRecord): RunComparison {
  const differences = differencesBetween(before, after);
  const blocking = differences.some((one) => one.what === 'bars' || one.what === 'contract');

  return {
    comparable: !blocking,
    differences,
    deltas: deltasBetween(before.report.summary, after.report.summary),
    // Withheld rather than computed on an incomparable pair. A separation
    // between two runs over different bars is a number, and it means nothing.
    separation: blocking ? null : separationBetween(before.report.summary, after.report.summary),
    sharedTrades: sharedTradesBetween(before.report.trades, after.report.trades),
  };
}

/**
 * What differs between two runs' inputs, in a fixed order.
 *
 * Compared through the repository's one canonical writer rather than field by
 * field, so a settings shape that grows a field is compared on that field
 * without this function being edited. Field by field is how a comparison
 * quietly stops covering whatever was added to the settings last.
 */
function differencesBetween(before: RunRecord, after: RunRecord): readonly Difference[] {
  const found: Difference[] = [];

  if (before.bars.hash !== after.bars.hash) {
    found.push({
      what: 'bars',
      detail: `different bars: ${before.bars.count} rows hashing ${before.bars.hash}, against ${after.bars.count} hashing ${after.bars.hash}`,
    });
  }
  if (canonicalise(before.settings.contract) !== canonicalise(after.settings.contract)) {
    found.push({ what: 'contract', detail: 'the two runs are on different contracts' });
  }
  if (before.programHash !== after.programHash) {
    found.push({
      what: 'program',
      detail: `different program: ${before.programHash}, against ${after.programHash}`,
    });
  }
  if (canonicalise(before.settings.range) !== canonicalise(after.settings.range)) {
    found.push({ what: 'range', detail: 'the two runs cover different date ranges' });
  }
  if (canonicalise(before.settings.costs) !== canonicalise(after.settings.costs)) {
    found.push({ what: 'costs', detail: 'the two runs were charged under different cost models' });
  }
  if (canonicalise(before.settings.fill) !== canonicalise(after.settings.fill)) {
    found.push({ what: 'fill', detail: 'the two runs were filled under different policies' });
  }
  if (canonicalise(before.settings.inputs) !== canonicalise(after.settings.inputs)) {
    found.push({ what: 'inputs', detail: 'the two scripts ran with different input values' });
  }
  return found;
}

/**
 * Every compared figure, before and after.
 *
 * A summary carries null where a figure has no meaning: no win rate until a
 * trade closes, no profit factor without a loss. Null on one side and a number
 * on the other is a real thing to report, and a delta between them is not, so
 * the row appears with both values and a delta of zero. Subtracting from null
 * would invent a movement out of a figure that was never there.
 */
function deltasBetween(before: Summary, after: Summary): RunComparison['deltas'] {
  // Widened once, here. COMPARED is a list of names and a summary is a closed
  // shape, so the lookup is by string either way; doing it in one place keeps
  // the rest of this file reading the real type.
  const a0 = before as unknown as Readonly<Record<string, unknown>>;
  const b0 = after as unknown as Readonly<Record<string, unknown>>;
  const deltas: { name: string; before: number; after: number; delta: number }[] = [];
  for (const name of COMPARED) {
    const a = numberOf(a0[name]);
    const b = numberOf(b0[name]);
    // Neither side holds a figure: a field of no summary, which is nothing to
    // report rather than a row of three zeroes.
    if (a === null && b === null) continue;
    deltas.push({
      name,
      before: a ?? 0,
      after: b ?? 0,
      delta: a === null || b === null ? 0 : (b ?? 0) - (a ?? 0),
    });
  }
  return deltas;
}

/** A figure, or none where the summary carries null or a string for it. */
function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * How many standard errors apart the two expectancies are.
 *
 * Analytic, with no resampling and no random number generator, so two runs of
 * this comparison over the same pair give the same figure for ever and a
 * decision taken on it is one anybody can reproduce.
 *
 * **Null rather than a large number where there is no noise to measure.** A run
 * with fewer than two closed trades has a standard error of zero, because one
 * trade has no spread, and where both are zero the ratio divides by it.
 * Returning infinity there would read as infinite confidence, which is the
 * exact opposite of what one trade tells anybody. Null says the question cannot
 * be answered from these two runs, which is the truth about them.
 */
function separationBetween(
  before: { readonly expectancy: number; readonly expectancyStandardError: number },
  after: { readonly expectancy: number; readonly expectancyStandardError: number },
): number | null {
  const noise = Math.sqrt(
    before.expectancyStandardError * before.expectancyStandardError +
      after.expectancyStandardError * after.expectancyStandardError,
  );
  if (!Number.isFinite(noise) || noise === 0) return null;
  const gap = after.expectancy - before.expectancy;
  return Number.isFinite(gap) ? gap / noise : null;
}

/**
 * How many trades the two runs took alike.
 *
 * Alike means opened on the same bar on the same side, which is the coarsest
 * thing two runs can agree about and the only one that survives a change to
 * sizing or to costs. It is what says whether a change moved the money by
 * trading differently or by trading the same and paying differently, and those
 * are not the same result however alike the two totals look.
 *
 * Counted as a multiset, so two long trades opening on one bar in one run
 * against one in the other share one trade rather than two.
 */
function sharedTradesBetween(
  before: readonly { readonly openedOnBar: number; readonly side: string }[],
  after: readonly { readonly openedOnBar: number; readonly side: string }[],
): number {
  const counts = new Map<string, number>();
  for (const trade of before) {
    const key = `${trade.openedOnBar}:${trade.side}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let shared = 0;
  for (const trade of after) {
    const key = `${trade.openedOnBar}:${trade.side}`;
    const left = counts.get(key) ?? 0;
    if (left > 0) {
      counts.set(key, left - 1);
      shared += 1;
    }
  }
  return shared;
}
