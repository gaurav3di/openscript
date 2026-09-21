/**
 * One marker per entry and exit fill, which is the chart's whole input.
 *
 * A chart draws a trade as two marks and a line between them, and everything it
 * needs to do that is in the fills: the bar, the trade the fill belongs to, the
 * side, the units, the price and the tag the order carried. So the markers are
 * produced here, by the module that already knows which fill belongs to which
 * trade, and no chart is needed to produce them and none is imported to.
 */
import type { RecordedFill } from './shapes.js';
import { closedBy, openedBy } from './trades.js';
import type { Trade } from './trades.js';

/** One entry or exit fill, addressed as a chart addresses it. */
export interface TradeMarker {
  readonly barIndex: number;
  readonly time: number | null;
  readonly tradeIndex: number;
  readonly kind: 'entry' | 'exit';
  readonly side: 'buy' | 'sell';
  readonly units: number;
  readonly price: number;
  readonly tag: string;
}

/**
 * One marker per entry and exit fill, against the trades those fills made up.
 *
 * **The fill is read with the same rule the trade list read it with.**
 * `closedBy` and `openedBy` are imported from `trades.ts` rather than restated,
 * because a marker that called an exit an entry would draw the chart the report
 * contradicts. A fill that carried a reference through zero is both: it closes
 * the trade the reference held and opens the next one, so it produces two
 * markers, in that order, which is the order the trade list folded it in.
 *
 * **A trade is found by its reference and by the order it opened**, never by
 * the bar it opened on: a reference that went to zero and was entered again on
 * the same bar is two trades, and addressing them by bar would put both
 * markers on the first. The trades are walked once per reference, oldest first,
 * which is the order `tradesOf` built them in.
 *
 * The count is an identity rather than a claim: the markers of one trade are
 * its `entries` plus its `exits`, and a test asserts it over the same fills.
 */
export function markersOf(
  fills: readonly RecordedFill[],
  trades: readonly Trade[],
): readonly TradeMarker[] {
  const ordered = fills.slice().sort((a, b) => a.seq - b.seq);
  const queues = new Map<number, Trade[]>();
  for (const trade of trades) {
    const held = queues.get(trade.positionRef) ?? [];
    held.push(trade);
    queues.set(trade.positionRef, held);
  }

  const out: TradeMarker[] = [];
  for (const fill of ordered) {
    const queue = queues.get(fill.positionRef) ?? [];
    const closing = closedBy(fill.refSizeBefore, fill.refSizeAfter);
    const opening = openedBy(fill.refSizeBefore, fill.refSizeAfter);

    if (closing > 0) {
      const held = queue[0];
      if (held !== undefined) out.push(markerFor(fill, held.index, 'exit', closing));
      // The trade the reference held is finished by a fill that closed the
      // whole of it, and the next trade on that reference is the one the fills
      // after this belong to.
      if (held !== undefined && (opening > 0 || fill.refSizeAfter === 0)) queue.shift();
    }
    if (opening > 0) {
      const held = queue[0];
      if (held !== undefined) out.push(markerFor(fill, held.index, 'entry', opening));
    }
  }
  return out;
}

function markerFor(
  fill: RecordedFill,
  tradeIndex: number,
  kind: 'entry' | 'exit',
  units: number,
): TradeMarker {
  return {
    barIndex: fill.barIndex,
    time: fill.barTime,
    tradeIndex,
    kind,
    side: fill.side,
    units,
    price: fill.price,
    tag: fill.tag,
  };
}
