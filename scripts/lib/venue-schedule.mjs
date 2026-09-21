/**
 * The schedule a harvested case's destination behaved on, held to the run it
 * produced.
 *
 * Three cases in the suite exist because a destination was told to behave
 * badly on a stated schedule: an order filled in pieces, three orders that end
 * carrying nothing, and a fill that arrives after its order has been cancelled.
 * The schedule is stated in `case-identities.mjs` beside the rest of what the
 * host chose, and `simulate.ts` carries it out.
 *
 * ## The one thing that goes wrong without failing
 *
 * **An act names an order by its ordinal, and the run decides how many orders
 * there are.** Nobody writing a schedule can know the id an engine will mint,
 * which is why an ordinal is what a case names an order by at all
 * (`conformance.md` section 3 says the same of a frame's `intent`). But the
 * ordinal is resolved against the orders a run happens to place, and that is
 * not a fact of the schedule: it moves when the example moves, when the
 * fixture's bars move, and when anything else about the run changes the bar a
 * signal falls on. An act naming an order the run no longer places is answered
 * by nobody and raises nothing. The harvest still writes a case, the case still
 * passes on both engines, and what it tests is whatever the plain run does,
 * which is already tested by five other cases.
 *
 * That is the failure this refuses: a case that quietly stopped testing the
 * thing it was written for, which is worse than a red build because the suite
 * keeps reporting it green. Section 10 of that page forbids editing a case to
 * make an engine pass; the same reasoning says a schedule whose status has gone
 * missing is settled by reading the run rather than by harvesting whatever came
 * out.
 *
 * ## What it asks, and what it does not reach
 *
 * Each act is matched against the frames the run recorded, in the order the
 * schedule states them, each act consuming a later frame than the one before
 * it. An act is matched **by the facts the act itself fixes**: the cumulative
 * quantity where it states one, the destination's own text where it states one,
 * and the status word its verb reaches where it states neither. The status a
 * quantity reads as is `simulate.ts`'s rule and is not restated here, and
 * neither is the vocabulary: the words come out of `stdlib.md` 17.7, whose
 * table says which of them a host may send, and each verb is the stem of
 * exactly one of them.
 *
 * **And the acts of one order are answered about one order.** A frame names the
 * intent it is about by ordinal, so the frames an act matched fix which row the
 * schedule reached, without this having to work out which intent an order
 * ordinal names: every act naming one order has to match frames carrying one
 * intent, and two order ordinals have to reach two of them, because two orders
 * are two rows. Without that rule an act that fixes nothing a plain run does
 * not also produce, a fill of the whole order, was answered by whichever later
 * order happened to fill, and a schedule whose last act had stopped firing
 * passed. That was measured on `order/fold-after-terminal` and is the reason
 * the rule is here.
 *
 * Two things it still does not reach, said here rather than discovered. An act
 * stating a quantity is matched by that quantity, so a frame carrying the same
 * number under another word would satisfy it; what the check is for is the
 * order going missing, and a missing order takes the quantity with it. And a
 * schedule every one of whose acts fixes nothing, which is one made only of
 * fills of whole orders, is one this can only hold to the shape of its run.
 *
 * A schedule whose acts fire in an order other than the one they are written in
 * is refused as well, because the match walks forward. Writing them in the
 * order they fire is the fix, and the message says so.
 */

/** The paragraph `stdlib.md` 17.7's status table sits under. */
const STATUSES = '**Statuses.**';

/** That table's columns: the word, what it means, terminal, a host may send it. */
const WORD = 0;
const SENDABLE = 3;

/** The cell that says yes, in the spelling the page writes. */
const YES = 'Yes';

/**
 * Why a schedule and the run it produced do not belong to each other, or null.
 *
 * `record` is the run's own record, whose frames are the ones it recorded as
 * delivered: a frame the destination answered after the last bar is not among
 * them, because no boundary folded it, so an act due past the end of the run is
 * one this reports as unanswered rather than one it excuses.
 *
 * A run that stated no schedule is asked about here too and answers null,
 * because the caller has one case at a time and not two kinds of case: a
 * question this cannot be asked is one somebody eventually forgets to ask.
 */
export function scheduleProblem(schedule, record, page) {
  if (schedule === undefined) return null;
  const words = sendableWords(page);
  if (words.length === 0) {
    return (
      `stdlib.md holds no table under ${STATUSES} naming the words a host may send, so ` +
      'nothing here can say which word an act of the schedule was written to produce'
    );
  }

  const wanted = [];
  for (const act of schedule) {
    const reached = words.filter((word) => word.startsWith(act.does));
    if (reached.length !== 1) {
      return (
        `the schedule's verb ${JSON.stringify(act.does)} is the stem of ` +
        `${reached.length === 0 ? 'no word' : `${reached.length} words`} in stdlib.md 17.7's ` +
        `table of the words a host may send (${words.join(', ')}), so the status it was ` +
        'written to produce cannot be read off the page'
      );
    }
    wanted.push({ act, word: reached[0] });
  }

  const frames = record.frames;
  const reached = new Map();
  let at = 0;
  for (const { act, word } of wanted) {
    const held = reached.get(act.order);
    const taken = new Set(reached.values());
    let found = -1;
    for (let index = at; index < frames.length && found === -1; index += 1) {
      const frame = frames[index];
      // The row this order has already been answered about, or any row no other
      // order of the schedule has been answered about.
      if (held === undefined ? taken.has(frame.intent) : frame.intent !== held) continue;
      if (answers(act, word, frame)) found = index;
    }
    if (found === -1) {
      return (
        `${described(act, word)}, and none of the ${frames.length} frames this run recorded ` +
        `answers that after the ${at} the acts before it took. An act names an order by ` +
        'ordinal and the run decides how many orders ' +
        'there are, so this is a schedule naming an order the run no longer places, or one ' +
        'whose acts are written in an order other than the one they fire in. A case whose ' +
        'schedule produces nothing tests what the plain run tests and says nothing about ' +
        'what it was written for'
      );
    }
    reached.set(act.order, frames[found].intent);
    at = found + 1;
  }
  return null;
}

/**
 * Whether one frame is the one an act was written to produce.
 *
 * The quantity first, because it is the fact an act fixes exactly: a frame is
 * cumulative, so an act stating one states the number the frame carries and not
 * a delta. An act stating none is a fill of the whole order or an ending, and
 * those are read by the word the verb reaches. The text is checked wherever the
 * act states one, because the destination's own text is the other fact an act
 * fixes and it is what the ledger records against the row.
 */
function answers(act, word, frame) {
  if (act.text !== undefined && frame.text !== act.text) return false;
  const units = act.units ?? null;
  return units === null ? frame.status === word : frame.filledQty === units;
}

/** One act, in the words a person reading the refusal needs. */
function described(act, word) {
  const when =
    act.afterBars === 0
      ? 'at the boundary it arrived at'
      : `${act.afterBars} boundaries after the one it arrived at`;
  const what =
    act.units === undefined || act.units === null
      ? `answer ${word}`
      : `report ${act.units} filled`;
  const text = act.text === undefined ? '' : ` carrying ${JSON.stringify(act.text)}`;
  return `the schedule has the destination ${what}${text} on order ${act.order} ${when}`;
}

/**
 * The status words `stdlib.md` 17.7 says a host may send, read off its table.
 *
 * Read rather than written out, because the vocabulary is that page's and a
 * second copy of it here is a copy that agrees until the day it does not. The
 * last column is the one that matters: `placed` is the engine's own word and no
 * destination may send it, so a schedule could never produce it.
 */
function sendableWords(page) {
  const text = page.replace(/\r\n/g, '\n');
  const at = text.indexOf(STATUSES);
  if (at === -1) return [];
  const out = [];
  for (const line of text.slice(at).split('\n')) {
    if (!line.startsWith('|')) {
      if (out.length > 0) break;
      continue;
    }
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 4 || cells[SENDABLE] !== YES) continue;
    const word = /^`([A-Za-z]+)`$/.exec(cells[WORD]);
    if (word !== null) out.push(word[1]);
  }
  return out;
}
