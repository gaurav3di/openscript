/**
 * The per-bar session facts, derived from the instrument record.
 *
 * **The session is a range of hours in the instrument record and nothing else**
 * (`host-interface.md` 4.3). A host states `start`, `end` and the days it opens
 * on, once, at load; the per-bar facts follow from those hours, the bar's own
 * time and the instrument's timezone. The host is never asked whether a session
 * begins on a bar, because `language.md` 7.2 fixes the facts a host states
 * about an execution at four and `host-interface.md` 6.1 says an engine must
 * not ask a host for one of the rest. Two engines built from those pages
 * therefore anchor a session study on the same bar, which is the whole reason
 * the line between stated and derived is drawn where it is.
 *
 * **`isFirstBar` is the first bar delivered inside the hours.** A venue that
 * opened late still has a first bar, and a study anchored to the session has to
 * start on it; a rule that waited for the scheduled open would anchor nothing
 * at all on a day trading began a minute late.
 *
 * **`isLastBar` is the last bar of the schedule**, which is the fact that earns
 * the field its place: it is true even when trading stopped early, so a
 * strategy that must be flat by the close acts on it rather than on the
 * appearance of a new bar, which arrives too late. That is a bar slot measured
 * against the scheduled close, so it needs the interval, and a host that states
 * none leaves it absent rather than answered by the bar spacing, which the
 * specification does not promise is uniform.
 *
 * **Absence, never a guess.** A host that states no session, no timezone or
 * hours that do not parse leaves both facts absent, which is what 4.1's record
 * says a script sees: absent, and the per-bar session facts absent with it.
 * Absence is a value a script can test, and a guessed session start would
 * anchor every session study in this language to a minute nobody chose.
 */
import { fieldsIn } from '../../stdlib/index.js';
import { standingIn } from './hours.js';
import type { Hours, Standing } from './hours.js';

/** The instrument's trading session, as `host-interface.md` 4.3 prints it. */
export interface SessionHours {
  /** A wall clock time, `"HH:MM"`, read in the instrument's timezone. */
  readonly start: string;
  /** The same, where `"24:00"` is midnight at the end of the day. */
  readonly end: string;
  /** Monday as 1 through Sunday as 7, or nothing for every day. */
  readonly days?: readonly number[];
}

/** What a bar's session comes to, absent where the record cannot say. */
export interface SessionFacts {
  readonly isFirstBar: boolean | null;
  readonly isLastBar: boolean | null;
}

/** No session stated, so neither fact has an answer. */
export const NO_SESSION: SessionFacts = { isFirstBar: null, isLastBar: null };

/** The bar falls in no session, which is an answer rather than an absence. */
const BETWEEN: SessionFacts = { isFirstBar: false, isLastBar: false };

/** `"HH:MM"`, where `"24:00"` is midnight at the end of the day. */
const CLOCK = /^(\d{2}):(\d{2})$/;

function clockMinutes(text: unknown): number | null {
  if (typeof text !== 'string') return null;
  const parts = CLOCK.exec(text);
  if (parts === null) return null;
  const hour = Number(parts[1]);
  const minute = Number(parts[2]);
  if (hour > 24 || minute > 59) return null;
  if (hour === 24 && minute !== 0) return null;
  return hour * 60 + minute;
}

/** The record's session as hours, or nothing when the host stated none. */
function hoursOf(stated: SessionHours | undefined): Hours | null {
  if (stated === undefined || stated === null) return null;
  const from = clockMinutes(stated.start);
  const to = clockMinutes(stated.end);
  if (from === null || to === null) return null;
  const listed = stated.days;
  return { from, to, days: Array.isArray(listed) ? [...listed] : null };
}

/** Reads one run's session facts, one bar at a time. */
export interface SessionReader {
  /** This bar's facts, given the bar before it, or nothing before it. */
  factsAt(time: number | null, previousTime: number | null): SessionFacts;
}

const NOTHING: SessionReader = { factsAt: () => NO_SESSION };

/**
 * The reader for one run.
 *
 * Built once, because the instrument record is read once at load and is
 * constant for the whole run (`host-interface.md` 4.4). A fact that changed
 * mid-run would make the first bars of a chart disagree with the rest of it.
 */
export function sessionReader(
  stated: SessionHours | undefined,
  zone: string | null,
  barMinutes: number | null,
): SessionReader {
  const hours = hoursOf(stated);
  if (hours === null || zone === null) return NOTHING;

  // The bar before this one was this bar last time, so its reading is kept
  // rather than read twice. Memoisation and nothing else: the answer for an
  // instant is the same answer every time, and clearing it between two bars
  // would change how long a chart took and nothing else.
  let priorTime: number | null = null;
  let priorReading: Standing | null = null;

  const readingAt = (time: number | null): Standing | null => {
    if (time === null || !Number.isFinite(time)) return null;
    if (time === priorTime) return priorReading;
    const civil = fieldsIn(time, zone);
    return civil === null ? null : standingIn(hours, civil);
  };

  return {
    factsAt(time: number | null, previousTime: number | null): SessionFacts {
      const here = readingAt(time);
      // Read before the slot is written over, so the bar before this one is the
      // reading this bar's own call left behind.
      const before = here !== null && here.inside ? readingAt(previousTime) : null;
      priorTime = time;
      priorReading = here;
      if (here === null) return NO_SESSION;
      if (!here.inside) return BETWEEN;
      // A bar with nothing before it inside the same session is the first of
      // it, which includes the oldest bar of a chart that opens mid-session: a
      // study anchored to the session has to start somewhere, and the left edge
      // of the data is the only honest place.
      const opened =
        before === null || !before.inside || before.openingDay !== here.openingDay;
      return {
        isFirstBar: opened,
        isLastBar: barMinutes === null ? null : here.remaining <= barMinutes,
      };
    },
  };
}
