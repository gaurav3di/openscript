/**
 * The destination a backtest runs against: intents in, frames out.
 *
 * **This is a host, not part of the engine**, and the division is the one thing
 * to keep straight while reading it. `stdlib.md` 17.1 puts slippage and
 * commission on the destination: the engine folds the price it is told and
 * never adjusts one, so the price worsening below is a venue giving a worse
 * fill, which is what a venue does, and not an engine moving a number, which is
 * what the invariant forbids. Everything here could be a broker.
 *
 * **A frame is cumulative and reaches the engine between bars.** Every frame
 * restates the whole life of one order from its beginning, so a repeat costs
 * nothing, and none of them is handed over during an execution: they are
 * answered here and collected at the boundary, which is where
 * `host-interface.md` 7.4 puts the intake.
 *
 * **When a fill is known is not when it happened.** A market order decided at
 * the close of a bar and filled at the next bar's open is known at that open,
 * so its frame is delivered before that bar executes and the strategy holds the
 * position for the whole of it. An order that rested and traded somewhere
 * inside a bar is only known to have traded once that bar is complete, so its
 * frame is delivered before the bar after it. Both are the truthful reading of
 * what a venue could have told anybody at the time, and the difference between
 * them is why they are not folded together.
 *
 * **A bracket is answered with nothing at all**, exactly as a venue with no
 * order to report would answer. A bracket reaches a destination as a protective
 * instruction attached to a tag and the engine appends no row for it, so there
 * is nothing for a frame to be about: a fill reported against one would name an
 * intent no row holds and the fold would refuse it. The row a bracket wants is
 * decision 55 and it is not in this release, so a stop cannot fill here and a
 * page that says it can is ahead of the engine.
 */
import type { Contract } from '../accounting/index.js';
import type { OrderFrame, OrderIntent, OrderSide, RoutedEffect } from '../engine/index.js';
import type { RecordedBar } from './record.js';
import { testResting } from './resting.js';
import type { RestingOrder } from './resting.js';
import type { FillPolicy } from './settings.js';

/** What the venue prices against and how it decides a fill. */
export interface SimulatorOptions {
  readonly bars: readonly RecordedBar[];
  readonly contract: Contract;
  readonly fill: FillPolicy;
  /** Adverse always, in ticks, applied to a market fill and to a stop. */
  readonly slippageTicks: number;
  /** The declaration's own fill rule: where a market order is priced. */
  readonly fillOn: string;
  /**
   * The unit the declaration's quantity is stated in, `language.md` 13.3.
   *
   * Here because converting it is the destination's job and a fill is counted
   * in units. Only the units this destination can arrive at reach it: the rest
   * are refused before the first bar by `checkSettings`.
   */
  readonly qtyType: string;
}

/** One order this venue holds, and what it has said about it. */
interface Order {
  readonly intent: OrderIntent;
  readonly ref: string;
  readonly placedOn: number;
  /** Absent on a market order, which rests on nothing. */
  readonly rest: RestingOrder | null;
  filledQty: number;
  live: boolean;
  /** Whether a stop limit has reached its trigger and is now a limit. */
  triggered: boolean;
}

/** `language.md` 13.3: a market order priced at the close of its own bar. */
const AT_CLOSE = 'close';

/**
 * A venue, for one run.
 *
 * It holds the orders it was handed and nothing else: no position, no money and
 * no view of what the strategy is doing, because a destination has none of
 * those about somebody else's strategy.
 */
export class Simulator {
  private readonly options: SimulatorOptions;
  private readonly orders: Order[] = [];
  /** The intents handed over, in the order they were, whatever became of them. */
  readonly intents: OrderIntent[] = [];
  /** Brackets, held so that a run can say how many it was handed and answered. */
  readonly brackets: OrderIntent[] = [];
  private queued: Order[] = [];
  private answered: OrderFrame[] = [];
  private refs = 0;
  private seq = 0;

  constructor(options: SimulatorOptions) {
    this.options = options;
  }

  /** Step 9: what the strategy decided reaches the venue. */
  route(effect: RoutedEffect, barIndex: number): void {
    for (const intent of effect.intents) {
      this.intents.push(intent);
      if (intent.kind === 'bracket') {
        this.brackets.push(intent);
        continue;
      }
      if (intent.kind === 'cancel') {
        this.withdraw(intent, barIndex);
        continue;
      }
      this.accept(intent, barIndex);
    }
  }

  /**
   * The frames a boundary hands over: everything this venue can say now.
   *
   * The orders that were already resting are decided against this bar first and
   * the orders this bar sent are answered after, which is the order the venue
   * learned of them in.
   */
  framesFor(barIndex: number): readonly OrderFrame[] {
    const bar = this.options.bars[barIndex];
    if (bar !== undefined) {
      for (const order of this.orders) {
        if (!order.live || order.rest === null || order.placedOn >= barIndex) continue;
        this.decide(order, bar, barIndex);
      }
    }

    const sent = this.queued;
    this.queued = [];
    for (const order of sent) this.open(order, barIndex);

    const out = this.answered;
    this.answered = [];
    return out;
  }

  /** How many orders this venue is still holding, which a run reports. */
  get working(): number {
    return this.orders.filter((order) => order.live).length;
  }

  /** An order the strategy sent, which this venue now holds. */
  private accept(intent: OrderIntent, barIndex: number): void {
    this.refs += 1;
    const order: Order = {
      intent,
      ref: refOf(this.refs),
      placedOn: barIndex,
      rest: restingFor(intent),
      filledQty: 0,
      live: true,
      triggered: false,
    };
    this.orders.push(order);
    this.queued.push(order);
  }

  /**
   * A cancellation, which is about the orders a tag names and not about itself.
   *
   * Every live order carrying the tag is withdrawn and answered, which is what
   * releases the position they were claiming, and the cancellation is then
   * answered as an order of its own, because the engine appended a row for it
   * and a row nothing ever answers stays at `placed` for the life of the run.
   */
  private withdraw(intent: OrderIntent, barIndex: number): void {
    for (const order of this.orders) {
      if (!order.live || order.intent.tag !== intent.tag) continue;
      order.live = false;
      this.say(order.intent, order.ref, 'cancelled', order.filledQty, null, barIndex);
    }
    // The cancellation is confirmed after what it withdrew, which is the order
    // a venue does it in: the request is answered once it has been carried out.
    this.refs += 1;
    this.say(intent, refOf(this.refs), 'cancelled', 0, null, barIndex);
  }

  /**
   * The first thing a venue says about an order it has taken.
   *
   * A working frame before any fill, because 7.4 asks for a frame on every
   * change of status and a script waiting for a working order to clear waits
   * blind without one. A market order is then filled in the same breath where
   * the declaration prices it at this bar's close, and at the next bar's open
   * where it does not.
   */
  private open(order: Order, barIndex: number): void {
    this.say(order.intent, order.ref, 'working', 0, null, barIndex);
    if (order.rest !== null) return;

    const atClose = this.options.fillOn === AT_CLOSE;
    const bar = this.options.bars[atClose ? barIndex : barIndex + 1];
    const price = atClose ? (bar?.close ?? null) : (bar?.open ?? null);
    // A market order sent on the last bar of a run and priced at the next open
    // has no next open. It stays working and is reported as an order the run
    // ended holding, which is what it is.
    if (price === null) return;
    this.complete(order, this.worsen(price, order.intent.side), barIndex);
  }

  /** One resting order against one bar. */
  private decide(order: Order, bar: RecordedBar, barIndex: number): void {
    const rest = order.rest;
    if (rest === null) return;
    const outcome = testResting(order.triggered ? asLimit(rest) : rest, bar, this.options.fill);
    if (!outcome.filled) {
      if (outcome.triggered) order.triggered = true;
      return;
    }
    const price = outcome.slips ? this.worsen(outcome.price, order.intent.side) : outcome.price;
    this.complete(order, price, barIndex);
  }

  /**
   * The whole of an order, filled at one price.
   *
   * **The quantity is converted into units here, because that is what a fill
   * is counted in and what every money figure is folded over.** A quantity
   * travels in the declaration's own unit (`host-interface.md` 7.1) and the
   * destination is the party that converts it. This filled the number verbatim,
   * so a strategy sizing in lots on a lot of sixty five traded one sixty fifth
   * of what it asked for and the whole report was out by that factor. The units
   * this destination cannot arrive at are refused before the first bar rather
   * than guessed at here, so by this point the unit is one of two.
   */
  private complete(order: Order, price: number, barIndex: number): void {
    const stated = order.intent.qty ?? 0;
    const lot = this.options.contract.lotSize;
    const qty =
      this.options.qtyType === 'lots' && lot !== null && lot > 0 ? stated * lot : stated;
    order.filledQty = qty;
    order.live = false;
    this.say(order.intent, order.ref, 'filled', qty, price, barIndex);
  }

  /**
   * A price worsened by the slippage the run was carried out under.
   *
   * **Adverse always: a buy pays more and a sell receives less.** The sign is
   * taken as written rather than as a magnitude, because a slippage below zero
   * is refused before the first bar and taking its magnitude here would be this
   * function quietly covering for a hole in that refusal. It went uncovered for
   * a while: `scheduleProblem` has always refused a negative rate, and
   * `checkSettings` asked it only about a schedule the host supplied, so a
   * declaration stating a slippage of minus one improved both sides of every
   * fill and the backtest paid the strategy to trade.
   *
   * A slippage in ticks with no tick size to measure a tick in charges nothing.
   * The comment here once said that was refused before the first bar and it was
   * not; it still is not, because an instrument with no tick is a fact a host
   * may legitimately not hold, and a run that charges no slippage is a study
   * before slippage rather than a wrong answer. What has changed is that this
   * says so instead of claiming a refusal that never existed.
   */
  private worsen(price: number, side: OrderSide | null): number {
    const tick = this.options.contract.tickSize;
    if (tick === null || this.options.slippageTicks === 0) return price;
    const move = this.options.slippageTicks * tick;
    return side === 'sell' ? price - move : price + move;
  }

  /** One frame, cumulative, in the order this venue spoke. */
  private say(
    intent: OrderIntent,
    ref: string,
    status: string,
    filledQty: number,
    avgFillPrice: number | null,
    barIndex: number,
  ): void {
    this.seq += 1;
    this.answered.push({
      intentId: intent.intentId,
      status,
      filledQty,
      avgFillPrice,
      orderRef: ref,
      sentInstrument: intent.instrument,
      sentProduct: intent.product,
      time: this.options.bars[barIndex]?.time ?? null,
      text: '',
      seq: this.seq,
    });
  }
}

/** This venue's own reference for an order, which the engine records and never parses. */
function refOf(count: number): string {
  return 'ORD-' + String(count);
}

/** The resting order an intent is, or nothing where it is a market order. */
function restingFor(intent: OrderIntent): RestingOrder | null {
  if (intent.type === null || intent.type === 'market' || intent.side === null) return null;
  return { side: intent.side, type: intent.type, limit: intent.limit, trigger: intent.trigger };
}

/** A stop limit that has triggered, which is a limit from that moment on. */
function asLimit(rest: RestingOrder): RestingOrder {
  return { side: rest.side, type: 'limit', limit: rest.limit, trigger: null };
}
