/**
 * Duty 5: a destination for order intents, and frames reporting what became of
 * them, `host-interface.md` 7.
 *
 * Optional, like duty 3, and declared the same way: a host that wires no
 * destination has no `orders` capability, and a strategy is refused at load
 * with OS6006 naming the tag rather than placing nothing for four thousand bars.
 *
 * Three things the page fixes and this destination obeys:
 *
 * - **An intent is not an order.** The engine states what the strategy decided;
 *   this file states what a venue did with it. Every intent is read field by
 *   field against the table of 7.1, in both directions, so a field the page
 *   prints that stops arriving fails a test and a field that arrives without
 *   being printed is a defect rather than a bonus.
 * - **A frame is cumulative.** Every frame restates the whole life of one
 *   order, so a repeat is harmless and a delta scheme is not available even by
 *   accident: the quantities below are totals from the beginning of the order.
 * - **A frame reaches the engine through the intake of 7.4 and nowhere else**,
 *   one at a time, between bars. So frames are queued here when the route is
 *   called at step 9 and handed over at the boundary, which is where a real
 *   destination speaks.
 */
import type { OrderIntent, RoutedEffect } from '../../src/core/engine/index.js';
import type { PageBar } from './feed.js';

/** The fields 7.1 prints, in the order it prints them. */
export const INTENT_FIELDS: readonly string[] = [
  'intentId',
  'kind',
  'instrument',
  'side',
  'qty',
  'qtyType',
  'type',
  'limit',
  'trigger',
  'target',
  'stop',
  'profit',
  'loss',
  'tag',
  'product',
  'positionRef',
  'bar',
];

/** The fields 7.2 prints, in the order it prints them. */
export const FRAME_FIELDS: readonly string[] = [
  'intentId',
  'orderRef',
  'status',
  'filledQty',
  'avgFillPrice',
  'sentInstrument',
  'sentProduct',
  'time',
  'text',
  'seq',
];

/** One frame, `host-interface.md` 7.2, as a destination states one. */
export interface PageFrame {
  readonly intentId: number;
  readonly orderRef: string;
  readonly status: string;
  /** Cumulative, from the beginning of this order's life. */
  readonly filledQty: number;
  readonly avgFillPrice: number | null;
  readonly sentInstrument: { readonly symbol: string | null; readonly exchange: string | null };
  readonly sentProduct: string;
  readonly time: number;
  readonly text: string;
  readonly seq: number;
}

const KINDS: readonly string[] = ['place', 'cancel', 'bracket'];
const SIDES: readonly string[] = ['buy', 'sell'];
const TYPES: readonly string[] = ['market', 'limit', 'stop', 'stopLimit'];

function isNumberOrAbsent(value: unknown): boolean {
  return value === null || typeof value === 'number';
}

/**
 * One intent, read against the table of 7.1.
 *
 * Every rule below is a cell of that table. A cancellation names a tag rather
 * than a direction, so it states no side and no quantity; a bracket's side is
 * the position's own; a `type` is stated on every kind so a host never has to
 * infer one; and a quantity travels with the unit it was counted in.
 */
export function readIntent(intent: unknown): readonly string[] {
  const problems: string[] = [];
  const raw = (intent ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!INTENT_FIELDS.includes(key)) {
      problems.push(`the intent carries ${key}, which section 7.1 does not print`);
    }
  }
  for (const key of INTENT_FIELDS) {
    if (!(key in raw)) problems.push(`section 7.1 prints ${key} and the intent does not carry it`);
  }

  const kind = String(raw['kind']);
  if (!KINDS.includes(kind)) problems.push(`kind is ${kind}, which is not one of the three`);
  if (raw['intentId'] === undefined || raw['intentId'] === null) {
    problems.push('an intent with no id has nothing a frame can name');
  }
  if (typeof raw['qtyType'] !== 'string') problems.push('qtyType is not a string');
  if (typeof raw['product'] !== 'string') problems.push('product is not a string');
  if (typeof raw['tag'] !== 'string') problems.push('tag is not a string, and no tag is ""');

  const instrument = raw['instrument'] as Record<string, unknown> | undefined;
  if (instrument === undefined || typeof instrument !== 'object') {
    problems.push('instrument is not the identity section 9 defines');
  }
  const bar = raw['bar'] as Record<string, unknown> | undefined;
  if (bar === undefined || typeof bar !== 'object' || typeof bar['index'] !== 'number') {
    problems.push('bar does not carry the index and open time of the bar that decided it');
  }

  if (kind === 'place') {
    if (!SIDES.includes(String(raw['side']))) problems.push('a placed order states no side');
    if (typeof raw['qty'] !== 'number') problems.push('a placed order states no quantity');
    if (!TYPES.includes(String(raw['type']))) problems.push('a placed order states no type');
  }
  if (kind === 'cancel') {
    if (raw['side'] !== null) problems.push('a cancellation names a tag and states no side');
    if (raw['qty'] !== null) problems.push('a cancellation states a quantity');
  }
  if (kind !== 'bracket') {
    for (const key of ['target', 'stop', 'profit', 'loss'] as const) {
      if (raw[key] !== null) problems.push(`${key} is stated on a kind that is not a bracket`);
    }
  }
  for (const key of ['limit', 'trigger', 'target', 'stop', 'profit', 'loss'] as const) {
    if (!isNumberOrAbsent(raw[key])) problems.push(`${key} is neither a price nor absent`);
  }
  return problems;
}

export interface DestinationOptions {
  /** The bars this venue prices a fill at, which are the chart's own. */
  readonly bars?: readonly PageBar[];
  /** What the venue calls the product it actually sent, after its translation. */
  readonly product?: string;
  /** Refuse every order, so a strategy meets a destination that says no. */
  readonly refuse?: string;
}

/**
 * A destination, as a platform implementing section 7 would build one.
 *
 * It keeps every intent it was handed and every way one of them failed to match
 * the page, so a test can assert on the hand-over itself rather than only on
 * what the ledger made of it. Frames are queued rather than delivered, because
 * 7.4 puts the intake between bars and the route is called during one.
 */
export class PageDestination {
  readonly intents: OrderIntent[] = [];
  readonly problems: string[] = [];
  readonly sent: PageFrame[] = [];
  private readonly options: DestinationOptions;
  private readonly queue: PageFrame[] = [];
  private refs = 0;
  private seq = 0;

  constructor(options: DestinationOptions = {}) {
    this.options = options;
  }

  /** Whether this host implements duty 5 at all. */
  get takesOrders(): boolean {
    return true;
  }

  /** Step 9: what the strategy decided reaches the venue. */
  receive(effect: RoutedEffect): void {
    for (const intent of effect.intents) {
      this.intents.push(intent);
      for (const one of readIntent(intent)) this.problems.push(one);
      this.answer(intent);
    }
  }

  /** The frames waiting for a boundary, taken in the order the venue spoke. */
  drain(): readonly PageFrame[] {
    const out = this.queue.slice();
    this.queue.length = 0;
    return out;
  }

  /** What this venue has said about the order an intent became. */
  private answer(intent: OrderIntent): void {
    // A bracket is a protective instruction attached to a tag, not an order.
    // The venue rests it or watches the market itself, and either way there is
    // no order for a frame to be about.
    if (intent.kind === 'bracket') return;
    this.refs += 1;
    const ref = `REF-${this.refs}`;
    const base = {
      intentId: intent.intentId,
      orderRef: ref,
      sentInstrument: intent.instrument,
      sentProduct: this.options.product ?? intent.product,
      time: intent.bar.time ?? 0,
    };
    if (intent.kind === 'cancel') {
      this.speak({ ...base, status: 'cancelled', filledQty: 0, avgFillPrice: null, text: '' });
      return;
    }
    if (this.options.refuse !== undefined) {
      this.speak({
        ...base,
        status: 'rejected',
        filledQty: 0,
        avgFillPrice: null,
        text: this.options.refuse,
      });
      return;
    }
    // A working frame before the fill, because 7.4 asks a host for every frame
    // that changes a status or a filled quantity, and a script waiting for a
    // working order to clear waits blind without one.
    this.speak({ ...base, status: 'working', filledQty: 0, avgFillPrice: null, text: '' });
    this.speak({
      ...base,
      status: 'filled',
      filledQty: intent.qty ?? 0,
      avgFillPrice: this.priceAt(intent.bar.index),
      text: '',
    });
  }

  private speak(frame: Omit<PageFrame, 'seq'>): void {
    this.seq += 1;
    const spoken: PageFrame = { ...frame, seq: this.seq };
    this.queue.push(spoken);
    this.sent.push(spoken);
  }

  /** The price a fill happened at, which is the venue's own and not the engine's. */
  private priceAt(index: number): number | null {
    const bar = (this.options.bars ?? [])[index];
    return bar === undefined ? null : bar.close;
  }
}
