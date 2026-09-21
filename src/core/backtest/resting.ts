/**
 * One resting order against one bar: did it trade, and at what price.
 *
 * **A bar is four prices and no path.** Whether the high came before the low is
 * not in the data, so every rule here is one that does not need to know, and
 * the places where knowing would matter are decided against the strategy rather
 * than guessed in its favour. That is the whole discipline of this file: a
 * backtest that is generous about fills is a backtest that reports money the
 * market never offered.
 *
 * Three rules, each with the case it exists for:
 *
 * - **Touched is not traded through.** A limit resting exactly at the low of a
 *   bar may or may not have been filled: the print happened, somebody was
 *   filled at that price, and whether it was this order depends on a queue no
 *   bar records. The default is that it was not (`limitNeedsThrough`), and a
 *   host that has decided otherwise for its own market says so in the policy.
 * - **A gap fills at the open, not at the level.** A stop triggered by a bar
 *   that opened beyond it was not filled at its trigger, and a backtest that
 *   says it was is reporting the one price that was never available. The open
 *   is the first price there was.
 * - **A limit fills at its own price or better, and never worse.** Where the
 *   bar opened already through a limit, the open is the better price and the
 *   fill is there; a limit is never worsened by slippage, because a limit that
 *   is worsened is not a limit.
 *
 * A stop limit is both, in one bar and in that order: the trigger has to be
 * reached and the limit has to be traded through, and where only the trigger is
 * reached the order becomes a resting limit and waits.
 */
import type { OrderSide, OrderType } from '../engine/index.js';
import type { FillPolicy } from './settings.js';
import type { RecordedBar } from './record.js';

/** A resting order, as the venue holds one. */
export interface RestingOrder {
  readonly side: OrderSide;
  readonly type: OrderType;
  /** The price a limit may not be worse than, absent on a plain stop. */
  readonly limit: number | null;
  /** The price a stop is triggered at, absent on a plain limit. */
  readonly trigger: number | null;
}

/** What one bar did to one resting order. */
export type RestOutcome =
  | { readonly filled: false; readonly triggered: boolean }
  | {
      readonly filled: true;
      readonly price: number;
      /** Whether the price is the bar's open, which is a gap through the level. */
      readonly atOpen: boolean;
      /** Whether slippage applies, which a limit never takes. */
      readonly slips: boolean;
    };

const NOTHING: RestOutcome = { filled: false, triggered: false };

/**
 * One order against one bar.
 *
 * A bar missing any of the four prices decides nothing: an incomplete bar is
 * not evidence that a level was reached and it is not evidence that it was not.
 */
export function testResting(
  order: RestingOrder,
  bar: RecordedBar,
  policy: FillPolicy,
): RestOutcome {
  const open = bar.open;
  const high = bar.high;
  const low = bar.low;
  if (open === null || high === null || low === null || bar.close === null) return NOTHING;

  if (order.type === 'limit') return limitAgainst(order, open, high, low, policy);

  const trigger = order.trigger;
  if (trigger === null) return NOTHING;
  const reached = order.side === 'buy' ? high >= trigger : low <= trigger;
  if (!reached) return NOTHING;

  if (order.type === 'stop') {
    const gapped = order.side === 'buy' ? open >= trigger : open <= trigger;
    const price = gapped && policy.stopFillsAtOpenOnGap ? open : trigger;
    return { filled: true, price, atOpen: gapped && policy.stopFillsAtOpenOnGap, slips: true };
  }

  // A stop limit that triggered is a limit for the rest of this bar. Where the
  // limit is not traded through it keeps resting, and the caller is told the
  // trigger was reached so that the order rests as a limit from here on.
  const asLimit = limitAgainst(order, open, high, low, policy);
  return asLimit.filled ? asLimit : { filled: false, triggered: true };
}

/**
 * A limit against one bar.
 *
 * `limitNeedsThrough` is the difference between a strict comparison and a loose
 * one, and it is the only knob in this file that changes a fill into no fill
 * rather than one price into another.
 */
function limitAgainst(
  order: RestingOrder,
  open: number,
  high: number,
  low: number,
  policy: FillPolicy,
): RestOutcome {
  const limit = order.limit;
  if (limit === null) return NOTHING;

  if (order.side === 'buy') {
    const traded = policy.limitNeedsThrough ? low < limit : low <= limit;
    if (!traded) return NOTHING;
    // The open already below the limit is the better price, and it is the first
    // price the bar had.
    const gapped = open < limit;
    return { filled: true, price: gapped ? open : limit, atOpen: gapped, slips: false };
  }

  const traded = policy.limitNeedsThrough ? high > limit : high >= limit;
  if (!traded) return NOTHING;
  const gapped = open > limit;
  return { filled: true, price: gapped ? open : limit, atOpen: gapped, slips: false };
}
