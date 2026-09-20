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
 *
 * **What is marked `planned` here is what no engine can run yet**, and it is
 * marked rather than left to be discovered. The ledger of section 17.7 is what
 * every reading below is folded from, and the legs and the book of sections
 * 17.6 and 17.9 to 17.11 are rules evaluated against it; none of the three
 * exists in an engine in this release. A name left unmarked would compile and
 * then be refused at load with OS6004, which names a function and not a reason.
 * Marked, it is OS2020 at the call, at the point a reader can see what they
 * wrote, with a message that says it is planned.
 *
 * The six order functions and the five position facts an engine can answer from
 * the host's own position row are not marked, because those do run.
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
    'buy(qty?: number, limit?: number = none, stop?: number = none, tag?: string = "", leg?: string) -> nothing',
    strategyOnly,
  ),
  entry(
    'sell(qty?: number, limit?: number = none, stop?: number = none, tag?: string = "", leg?: string) -> nothing',
    strategyOnly,
  ),
  entry('close(tag?: string = none, qty?: number = none, leg?: string) -> nothing', strategyOnly),
  entry(
    'exit(tag?: string = "", qty?: number = none, limit?: number = none, stop?: number = none, profit?: number = none, loss?: number = none, leg?: string) -> nothing',
    {
      ...strategyOnly,
      // An absolute price and a distance from the entry state the same level,
      // and reconciling them would need a rule (stdlib.md 17.2).
      conflicts: [
        ['limit', 'profit'],
        ['stop', 'loss'],
      ],
    },
  ),
  entry('cancel(tag: string) -> nothing', strategyOnly),
  entry('cancelAll() -> nothing', strategyOnly),
];

const orders: readonly LibraryEntry[] = [
  entry(
    'order.place(side: string, qty: number, type?: string = "market", price?: number = none, trigger?: number = none, tag?: string = "", leg?: string) -> nothing',
    { ...strategyOnly, values: { side: SIDES, type: ORDER_TYPES } },
  ),
  entry('order.reverse(qty?: number = none, tag?: string = "", leg?: string) -> nothing', strategyOnly),
  entry(
    'order.bracket(tag?: string = "", profit?: number = none, loss?: number = none, leg?: string) -> nothing',
    strategyOnly,
  ),
  entry('order.working(tag: string) -> series bool', { ...strategyOnly, planned: true }),
  entry('order.pending -> series number', { ...strategyOnly, planned: true }),
  entry('order.id(tag: string) -> series string', { ...strategyOnly, planned: true }),
  entry('order.status(tag: string) -> series string', { ...strategyOnly, planned: true }),
  entry('order.filled(tag: string) -> series number', { ...strategyOnly, planned: true }),
  entry('order.avgFill(tag: string) -> series number', {
    ...strategyOnly,
    planned: true,
    warmup: DATA_DRIVEN,
  }),
  entry('order.rejection(tag: string) -> series string', { ...strategyOnly, planned: true }),
  entry('order.qtyForCash(cash: number, price?: number = close) -> number', {
    ...strategyOnly,
    planned: true,
  }),
  entry('order.qtyForRisk(risk: number, entry: number, stop: number) -> number', {
    ...strategyOnly,
    planned: true,
  }),
  entry('order.qtyForEquityPercent(percent: number, price?: number = close) -> number', {
    ...strategyOnly,
    planned: true,
  }),
  entry('order.roundToLot(qty: number, direction?: string = "down", leg?: string) -> number', {
    ...strategyOnly,
    planned: true,
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
  entry('pos.entryTime -> series number', {
    ...strategyOnly,
    planned: true,
    warmup: DATA_DRIVEN,
  }),
  entry('pos.barsHeld -> series number', {
    ...strategyOnly,
    planned: true,
    warmup: DATA_DRIVEN,
  }),
  entry('pos.entries -> series number', { ...strategyOnly, planned: true }),
  entry('pos.openProfit -> series number', {
    ...strategyOnly,
    planned: true,
    warmup: DATA_DRIVEN,
  }),
  entry('pos.openProfitPercent -> series number', {
    ...strategyOnly,
    planned: true,
    warmup: DATA_DRIVEN,
  }),
  entry('pos.maxProfit -> series number', {
    ...strategyOnly,
    planned: true,
    warmup: DATA_DRIVEN,
  }),
  entry('pos.maxLoss -> series number', {
    ...strategyOnly,
    planned: true,
    warmup: DATA_DRIVEN,
  }),
  entry('pos.isShared -> series bool', { ...strategyOnly, planned: true }),
  entry('pos.equity -> series number', { ...strategyOnly, planned: true }),
  entry('pos.netProfit -> series number', { ...strategyOnly, planned: true }),
  entry('pos.tradeCount -> series number', { ...strategyOnly, planned: true }),
  entry('pos.winRate -> series number', { ...strategyOnly, planned: true }),
  entry('pos.profitFactor -> series number', { ...strategyOnly, planned: true }),
  entry('pos.maxDrawdown -> series number', { ...strategyOnly, planned: true }),
];

const legs: readonly LibraryEntry[] = [
  entry(
    'leg.fixed(name: string, symbol: string, exchange?: string = chart.exchange, product?: string, qty?: number, side?: string = "buy") -> nothing',
    {
      ...strategyOnly,
      planned: true,
      topLevel: true,
      values: { side: SIDES },
      constant: ['name', 'symbol', 'exchange', 'product', 'qty', 'side'],
    },
  ),
  entry(
    'leg.relative(name: string, underlying: string, kind: string, expiryRank?: number = 0, expiryCycle?: string = none, strikeOffset?: number = 0, right?: string = none, reference?: number = none, exchange?: string = chart.exchange, product?: string, qty?: number, side?: string = "buy") -> nothing',
    {
      ...strategyOnly,
      planned: true,
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
  entry('leg.symbol(name: string) -> string', { ...strategyOnly, planned: true }),
  entry('leg.exchange(name: string) -> string', { ...strategyOnly, planned: true }),
  entry('leg.product(name: string) -> string', { ...strategyOnly, planned: true }),
  entry('leg.expiry(name: string) -> number', { ...strategyOnly, planned: true }),
  entry('leg.strike(name: string) -> number', { ...strategyOnly, planned: true }),
  entry('leg.size(name: string) -> series number', { ...strategyOnly, planned: true }),
  entry('leg.avgPrice(name: string) -> series number', {
    ...strategyOnly,
    planned: true,
    warmup: DATA_DRIVEN,
  }),
  entry('leg.entryTime(name: string) -> series number', {
    ...strategyOnly,
    planned: true,
    warmup: DATA_DRIVEN,
  }),
  entry('leg.profit(name: string) -> series number', { ...strategyOnly, planned: true }),
  entry('leg.isOpen(name: string) -> series bool', { ...strategyOnly, planned: true }),
  entry('leg.stopPrice(name: string) -> series number', {
    ...strategyOnly,
    planned: true,
    warmup: DATA_DRIVEN,
  }),
  entry('leg.targetPrice(name: string) -> series number', {
    ...strategyOnly,
    planned: true,
    warmup: DATA_DRIVEN,
  }),
  entry('leg.stop(name: string, price: number) -> nothing', { ...strategyOnly, planned: true }),
  entry('leg.target(name: string, price: number) -> nothing', { ...strategyOnly, planned: true }),
  entry('leg.trail(name: string, distance: number, arm?: number = none) -> nothing', {
    ...strategyOnly,
    planned: true,
  }),
  entry(
    'leg.enter(name: string, side?: string, qty?: number, limit?: number = none, stop?: number = none, tag?: string = "") -> nothing',
    { ...strategyOnly, planned: true, values: { side: SIDES } },
  ),
  entry(
    'leg.exit(name: string, qty?: number = none, limit?: number = none, stop?: number = none, tag?: string = "") -> nothing',
    { ...strategyOnly, planned: true },
  ),
];

const book: readonly LibraryEntry[] = [
  entry('book.stop(amount: number) -> nothing', { ...strategyOnly, planned: true }),
  entry('book.target(amount: number) -> nothing', { ...strategyOnly, planned: true }),
  entry(
    'book.lockProfit(arm: number, lock: number, step?: number = none, advance?: number = none) -> nothing',
    { ...strategyOnly, planned: true },
  ),
  entry('book.trailStopsToEntry(at: number) -> nothing', { ...strategyOnly, planned: true }),
  entry('book.direction(filter: string) -> nothing', {
    ...strategyOnly,
    planned: true,
    values: { filter: BOOK_DIRECTIONS },
  }),
  entry('book.entryWindow(spec: string) -> nothing', { ...strategyOnly, planned: true }),
  entry('book.exitAt(time: string) -> nothing', { ...strategyOnly, planned: true }),
  entry('book.squareOffAtExpiry(minutesBefore?: number = 0) -> nothing', {
    ...strategyOnly,
    planned: true,
  }),
  entry('book.dailyLoss(amount: number) -> nothing', { ...strategyOnly, planned: true }),
  entry('book.profit -> series number', { ...strategyOnly, planned: true }),
  entry('book.dayProfit -> series number', { ...strategyOnly, planned: true }),
  entry('book.isOpen -> series bool', { ...strategyOnly, planned: true }),
  entry('book.enter(tag?: string = "") -> nothing', { ...strategyOnly, planned: true }),
  entry('book.exit(tag?: string = "") -> nothing', { ...strategyOnly, planned: true }),
];

export const ORDER_ENTRIES: readonly LibraryEntry[] = [
  ...placing,
  ...orders,
  ...position,
  ...legs,
  ...book,
];
