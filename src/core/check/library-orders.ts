/**
 * The part of the library that spends money: `stdlib.md` section 17.
 *
 * Every entry here is marked `strategyOnly`, which is the whole of what the
 * checker has to know about the section's opening rule: a `study()` file that
 * reaches for one of these is OS7001, and the fix names the declaration to
 * change rather than the call to delete.
 *
 * A leg is named by a string rather than by a handle, so nothing in this file
 * carries a type the rest of the language does not already have.
 */
import { DATA_DRIVEN, entry } from './library.js';
import type { LibraryEntry } from './library.js';

const SIDES = ['buy', 'sell'];
const ORDER_TYPES = ['market', 'limit', 'stop', 'stopLimit'];
const DIRECTIONS = ['up', 'down'];
const BOOK_DIRECTIONS = ['long', 'short', 'both'];
const LEG_KINDS = ['future', 'option'];
const RIGHTS = ['call', 'put'];

const strategyOnly = { strategyOnly: true } as const;

/** The bare order functions of stdlib.md 17.2, which `close` is one of. */
export const ORDER_NAMES: readonly string[] = [
  'buy',
  'sell',
  'close',
  'exit',
  'cancel',
  'cancelAll',
];

const placing: readonly LibraryEntry[] = [
  entry(
    'buy(qty?: number, limit?: number, stop?: number, tag?: string, leg?: string) -> nothing',
    strategyOnly,
  ),
  entry(
    'sell(qty?: number, limit?: number, stop?: number, tag?: string, leg?: string) -> nothing',
    strategyOnly,
  ),
  entry('close(tag?: string, qty?: number, leg?: string) -> nothing', strategyOnly),
  entry(
    'exit(tag?: string, qty?: number, limit?: number, stop?: number, profit?: number, loss?: number, leg?: string) -> nothing',
    strategyOnly,
  ),
  entry('cancel(tag: string) -> nothing', strategyOnly),
  entry('cancelAll() -> nothing', strategyOnly),
];

const orders: readonly LibraryEntry[] = [
  entry(
    'order.place(side: string, qty: number, type?: string, price?: number, trigger?: number, tag?: string, leg?: string) -> nothing',
    { ...strategyOnly, values: { side: SIDES, type: ORDER_TYPES } },
  ),
  entry('order.reverse(qty?: number, tag?: string, leg?: string) -> nothing', strategyOnly),
  entry(
    'order.bracket(tag?: string, profit?: number, loss?: number, leg?: string) -> nothing',
    strategyOnly,
  ),
  entry('order.working(tag: string) -> series bool', strategyOnly),
  entry('order.pending -> series number', strategyOnly),
  entry('order.id(tag: string) -> series string', strategyOnly),
  entry('order.status(tag: string) -> series string', strategyOnly),
  entry('order.filled(tag: string) -> series number', strategyOnly),
  entry('order.avgFill(tag: string) -> series number', { ...strategyOnly, warmup: DATA_DRIVEN }),
  entry('order.rejection(tag: string) -> series string', strategyOnly),
  entry('order.qtyForCash(cash: number, price?: number) -> number', strategyOnly),
  entry('order.qtyForRisk(risk: number, entry: number, stop: number) -> number', strategyOnly),
  entry('order.qtyForEquityPercent(percent: number, price?: number) -> number', strategyOnly),
  entry('order.roundToLot(qty: number, direction?: string, leg?: string) -> number', {
    ...strategyOnly,
    values: { direction: DIRECTIONS },
  }),
  entry('order.modify(tag: string) -> nothing', { ...strategyOnly, planned: true }),
  entry('order.oco(tagA: string, tagB: string) -> nothing', { ...strategyOnly, planned: true }),
];

const position: readonly LibraryEntry[] = [
  entry('pos.size -> series number', strategyOnly),
  entry('pos.isLong -> series bool', strategyOnly),
  entry('pos.isShort -> series bool', strategyOnly),
  entry('pos.isFlat -> series bool', strategyOnly),
  entry('pos.avgPrice -> series number', { ...strategyOnly, warmup: DATA_DRIVEN }),
  entry('pos.entryTime -> series number', { ...strategyOnly, warmup: DATA_DRIVEN }),
  entry('pos.barsHeld -> series number', { ...strategyOnly, warmup: DATA_DRIVEN }),
  entry('pos.entries -> series number', strategyOnly),
  entry('pos.openProfit -> series number', { ...strategyOnly, warmup: DATA_DRIVEN }),
  entry('pos.openProfitPercent -> series number', { ...strategyOnly, warmup: DATA_DRIVEN }),
  entry('pos.maxProfit -> series number', { ...strategyOnly, warmup: DATA_DRIVEN }),
  entry('pos.maxLoss -> series number', { ...strategyOnly, warmup: DATA_DRIVEN }),
  entry('pos.isShared -> series bool', strategyOnly),
  entry('pos.equity -> series number', strategyOnly),
  entry('pos.netProfit -> series number', strategyOnly),
  entry('pos.tradeCount -> series number', strategyOnly),
  entry('pos.winRate -> series number', { ...strategyOnly, planned: true }),
  entry('pos.profitFactor -> series number', { ...strategyOnly, planned: true }),
  entry('pos.maxDrawdown -> series number', { ...strategyOnly, planned: true }),
];

const legs: readonly LibraryEntry[] = [
  entry(
    'leg.fixed(name: string, symbol: string, exchange?: string, product?: string, qty?: number, side?: string) -> nothing',
    {
      ...strategyOnly,
      topLevel: true,
      values: { side: SIDES },
      constant: ['name', 'symbol', 'exchange', 'product', 'qty', 'side'],
    },
  ),
  entry(
    'leg.relative(name: string, underlying: string, kind: string, expiryRank?: number, expiryCycle?: string, strikeOffset?: number, right?: string, reference?: number, exchange?: string, product?: string, qty?: number, side?: string) -> nothing',
    {
      ...strategyOnly,
      topLevel: true,
      values: { kind: LEG_KINDS, right: RIGHTS, side: SIDES },
      constant: [
        'name',
        'underlying',
        'kind',
        'expiryRank',
        'expiryCycle',
        'strikeOffset',
        'right',
        'reference',
        'exchange',
        'product',
        'qty',
        'side',
      ],
    },
  ),
  entry('leg.symbol(name: string) -> string', strategyOnly),
  entry('leg.exchange(name: string) -> string', strategyOnly),
  entry('leg.product(name: string) -> string', strategyOnly),
  entry('leg.expiry(name: string) -> number', strategyOnly),
  entry('leg.strike(name: string) -> number', strategyOnly),
  entry('leg.size(name: string) -> series number', strategyOnly),
  entry('leg.avgPrice(name: string) -> series number', { ...strategyOnly, warmup: DATA_DRIVEN }),
  entry('leg.entryTime(name: string) -> series number', { ...strategyOnly, warmup: DATA_DRIVEN }),
  entry('leg.profit(name: string) -> series number', strategyOnly),
  entry('leg.isOpen(name: string) -> series bool', strategyOnly),
  entry('leg.stopPrice(name: string) -> series number', { ...strategyOnly, warmup: DATA_DRIVEN }),
  entry('leg.targetPrice(name: string) -> series number', {
    ...strategyOnly,
    warmup: DATA_DRIVEN,
  }),
  entry('leg.stop(name: string, price: number) -> nothing', strategyOnly),
  entry('leg.target(name: string, price: number) -> nothing', strategyOnly),
  entry('leg.trail(name: string, distance: number, arm?: number) -> nothing', strategyOnly),
  entry(
    'leg.enter(name: string, side?: string, qty?: number, limit?: number, stop?: number, tag?: string) -> nothing',
    { ...strategyOnly, values: { side: SIDES } },
  ),
  entry(
    'leg.exit(name: string, qty?: number, limit?: number, stop?: number, tag?: string) -> nothing',
    strategyOnly,
  ),
];

const book: readonly LibraryEntry[] = [
  entry('book.stop(amount: number) -> nothing', strategyOnly),
  entry('book.target(amount: number) -> nothing', strategyOnly),
  entry(
    'book.lockProfit(arm: number, lock: number, step?: number, advance?: number) -> nothing',
    strategyOnly,
  ),
  entry('book.trailStopsToEntry(at: number) -> nothing', strategyOnly),
  entry('book.direction(filter: string) -> nothing', {
    ...strategyOnly,
    values: { filter: BOOK_DIRECTIONS },
  }),
  entry('book.entryWindow(spec: string) -> nothing', strategyOnly),
  entry('book.exitAt(time: string) -> nothing', strategyOnly),
  entry('book.squareOffAtExpiry(minutesBefore?: number) -> nothing', strategyOnly),
  entry('book.dailyLoss(amount: number) -> nothing', strategyOnly),
  entry('book.profit -> series number', strategyOnly),
  entry('book.dayProfit -> series number', strategyOnly),
  entry('book.isOpen -> series bool', strategyOnly),
  entry('book.enter(tag?: string) -> nothing', strategyOnly),
  entry('book.exit(tag?: string) -> nothing', strategyOnly),
];

export const ORDER_ENTRIES: readonly LibraryEntry[] = [
  ...placing,
  ...orders,
  ...position,
  ...legs,
  ...book,
];
