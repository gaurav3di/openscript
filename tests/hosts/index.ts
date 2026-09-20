/**
 * The page-built host: `spec/host-interface.md` implemented as a platform would
 * implement it, and the only host in this suite that is not written against the
 * engine it drives.
 *
 * Six duties, a drawing surface and a chart clock. Each file behind this door
 * is one part of that document typed out:
 *
 * - `record.ts`, duty 2: the instrument record of 4.1 and the session of 4.3;
 * - `feed.ts`, duties 1 and 4: a bar, the four facts of 6.4, and the two ways
 *   6.4 says a host delivers, which are a history load and a live feed;
 * - `reads.ts`, duty 3: a request, an answer and a refusal, sections 5.2 to 5.4;
 * - `orders.ts`, duty 5: a destination for intents and the cumulative frames it
 *   sends back through the intake of 7.4;
 * - `host.ts`: the duties as one host, duty 6's settings map, and the hand-over.
 *
 * What this door is for: the suite has one host builder, so there is one place a
 * field could be added to a host, and `duties.test.ts` holds that one place
 * against the page.
 */
export type { InstrumentType, PageInstrument, PageSession } from './record.js';
export { PAGE_INSTRUMENT, RECORD_FIELDS, pageInstrument, readRecord } from './record.js';

export type { Delivery, HandOver, PageBar, PageState } from './feed.js';
export {
  HOST_BAR_FIELDS,
  STATE_FIELDS,
  deliverTo,
  driveWith,
  engineBar,
  engineState,
  handOvers,
} from './feed.js';

export type { PageAnswer, PageRange, PageRefusal, PageRequest, PageSeries } from './reads.js';
export { REQUEST_FIELDS, lengthOf, rangeFor, readRequest } from './reads.js';

export type { DestinationOptions, PageFrame } from './orders.js';
export { FRAME_FIELDS, INTENT_FIELDS, PageDestination, readIntent } from './orders.js';

export type { Duty, PageHostOptions } from './host.js';
export { DUTIES, HAND_OVER, PageHost, engineHostFor, loadOn, pageHost, runOn } from './host.js';
