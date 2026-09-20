/**
 * The ledger's properties over generated runs, `stdlib.md` 17.1, 17.2 and 17.7.
 *
 * **Examples pin the shapes somebody thought of.** Both defects issue 0019
 * closed were reachable from four lines of ordinary script and neither was
 * pinned by any of the 1414 tests that existed: a mutation fixing each one left
 * the whole suite green. What found the round before's defect was not another
 * example either, but a property driven over scripts nobody wrote.
 *
 * So these are the sentences 17.1 and 17.2 are unconditional about, asserted
 * over generated runs against a destination that answers late, partially, out
 * of order, with rejections, with more than was asked and not at all:
 *
 * - **No order takes a position reference from one sign to the other.**
 * - **A reference that opened on one sign never ends on the other.**
 * - **An order sent to flatten a part is on the side that reduces that part**,
 *   whatever the leg's net is doing, and never sends more than that part holds.
 *
 * **Everything on the right hand side is folded from what the host sent and
 * what it answered.** Nothing here reads the engine's ledger, on purpose: an
 * oracle folded from the ledger agrees with the engine by construction, which
 * is how both of this issue's defects passed 1414 tests.
 *
 * What the first two do not answer for is 17.1's own exception, and it is
 * written into `referencesOf` where the walk is rather than into each property.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { OrderIntent } from '../../src/core/engine/index.js';
import { heldEntering, planFor, runPlan, settledEntering } from './fuzz-support.js';
import type { Outcome } from './fuzz-support.js';

/** How many generated runs. Enough to meet the shapes the coverage below counts. */
const RUNS = 2000;
const BARS = 10;

/** One position reference as the destination's own record has it. */
interface Reference {
  /** The side of the first order it was handed, `1` for a long position. */
  readonly opened: number;
  /** What it holds, walked in send order, by what the destination filled. */
  settled: number;
  /** The first order that took it from one sign to the other. */
  crossed: string | null;
  /** Whether 17.1 answers for this reference at all. */
  measured: boolean;
}

/**
 * Every reference the destination was handed, walked order by order.
 *
 * **In the order the engine sent them, with the quantity the destination
 * actually filled.** Both halves are the point:
 *
 * - **Filled rather than sent**, because an order that was rejected moved
 *   nothing and one filled past what it was asked moved more, so a book of sent
 *   quantities reports crossings nobody sent: a rejected buy releases the room
 *   it was holding, and the sells after it are correct where that book says
 *   they crossed. It also needs no unit, and a book of sent quantities does: a
 *   quantity stated in lots beside one the engine worked out in units is two
 *   kinds of number, and what comes back is one kind.
 * - **Sent order rather than the order the answers arrived in**, because which
 *   frame a destination sends first is not something an engine decides. The
 *   same four orders answered in another order put a reference through every
 *   sign on the way, and none of that is the engine's doing.
 *
 * Two references are left unmeasured, and both exceptions are 17.1's own
 * sentences rather than conveniences:
 *
 * - **One carrying an order the destination never answered in full.** An order
 *   divided against an unanswered order is placed against units that were
 *   promised and may not arrive, and if the promise is broken while the
 *   division fills, that reference settles where it did not open. The
 *   alternative is holding an order back until the destination answers, which
 *   is an engine that stops trading when a destination is slow. An order still
 *   going, one that ended part filled and one filled past what was asked are
 *   all that same case.
 * - **One a close crossed with a quantity the engine could not read.** A
 *   quantity stated on a close in lots, cash or an equity percent is sent as
 *   written against the position it is closing, because dividing it into a
 *   closing half and an opening half is the arithmetic OS7005 is deferred on,
 *   and that is the one shape of 17.1 an engine does not keep today.
 *   `ending.test.ts` asserts what it does instead.
 *
 *   **Narrow on purpose, and it was not at first.** Excluding every reference a
 *   close in lots was ever sent against excludes issue 0019's own measured
 *   script, where two closes of one lot each and an opposing entry of nine took
 *   a reference from ten long to one short: not one of those orders was larger
 *   than what the reference held, and none of them is the shape 17.1 defers.
 *   What is deferred is an order the engine could not size taking the position
 *   it was closing off the side that position opened on, so that is what is
 *   excluded, and only where the order that did it is a close the script wrote
 *   a quantity on. An entry the engine cannot size is not this case and is held
 *   in every unit, which is what the round before this one fixed.
 */
function referencesOf(outcome: Outcome): ReadonlyMap<number, Reference> {
  const refs = new Map<number, Reference>();
  const promised = new Set<number>();
  for (const answer of outcome.answers.values()) {
    if (answer.filled !== answer.intent.qty) promised.add(answer.intent.positionRef);
  }
  // The bars whose call was a close the script wrote a quantity on, which is
  // the only order 17.1 leaves a crossing to.
  const deferred = new Set<number>();
  for (const call of outcome.plan.calls) if (call.isClose && call.stated) deferred.add(call.bar);
  for (const intent of outcome.run.sent) {
    const answer = outcome.answers.get(intent.intentId);
    if (answer === undefined) continue;
    let one = refs.get(intent.positionRef);
    if (one === undefined) {
      one = {
        opened: intent.side === 'buy' ? 1 : -1,
        settled: 0,
        crossed: null,
        measured: !promised.has(intent.positionRef),
      };
      refs.set(intent.positionRef, one);
    }
    const before = one.settled;
    one.settled = before + (intent.side === 'buy' ? answer.filled : -answer.filled);
    const after = one.settled;
    // An order the engine could not size, taking the position it was closing
    // off the side it opened on. That is the shape 17.1 defers, and the
    // reference is not measured from here on.
    if (
      intent.qtyType !== 'units' &&
      deferred.has(intent.bar.index) &&
      after !== 0 &&
      Math.sign(after) !== one.opened
    ) {
      one.measured = false;
      continue;
    }
    if (before === 0 || after === 0 || Math.sign(after) === Math.sign(before)) continue;
    if (one.crossed === null) {
      one.crossed = `reference ${intent.positionRef} held ${before} and was sent ${after - before}`;
    }
  }
  return refs;
}

/**
 * Every reference an order took from one sign to the other.
 *
 * Stronger than asking what a reference ended at, which is the property below:
 * one that crossed and came back answers that question correctly.
 */
function crossedOnDestination(refs: ReadonlyMap<number, Reference>): readonly string[] {
  const found: string[] = [];
  for (const one of refs.values()) {
    if (one.measured && one.crossed !== null) found.push(one.crossed);
  }
  return found;
}

/**
 * Every reference that ended on the side it did not open on.
 *
 * Issue 0019's own sentence, and the one a host reconciling a run would notice.
 */
function reversedByAnswers(refs: ReadonlyMap<number, Reference>): readonly string[] {
  const found: string[] = [];
  for (const [ref, one] of refs) {
    if (!one.measured || one.settled === 0) continue;
    if (Math.sign(one.settled) !== one.opened) {
      found.push(`reference ${ref} opened ${one.opened} and settled ${one.settled}`);
    }
  }
  return found;
}

/** The orders one bar's call was handed to the destination as. */
function sentOnBar(outcome: Outcome, bar: number): readonly OrderIntent[] {
  return outcome.run.sent.filter(
    (one) => one.bar.index === bar && one.kind === 'place' && one.side !== null,
  );
}

/**
 * Every order a close sent that adds to what it was told to flatten.
 *
 * **The part is the tag the call named, or the leg where it named none**, and
 * what that part holds is folded from the fills the destination itself
 * answered. An order sent to flatten a part is on the side that reduces **that
 * part**, whatever the leg's net is doing: the two are the same question one
 * scope apart, and a leg long under one tag and short under another is where
 * they give different answers. 17.2 says of the reading that takes the leg's
 * net that it would let close open a position, which is what it did.
 */
function addingCloses(outcome: Outcome): readonly string[] {
  const found: string[] = [];
  for (const call of outcome.plan.calls) {
    if (!call.isClose || call.bar >= outcome.stoppedAt) continue;
    const held = heldEntering(outcome, call.closes, call.bar);
    if (held === 0) continue;
    const part = call.closes ?? 'the leg';
    const reduces = held > 0 ? 'sell' : 'buy';
    let sent = 0;
    for (const intent of sentOnBar(outcome, call.bar)) {
      sent += intent.qty ?? 0;
      if (intent.side === reduces) continue;
      found.push(`bar ${call.bar} closed ${part} holding ${held} with a ${intent.side ?? 'none'}`);
    }
    // The quantity only where the two are the same kind of number: a quantity
    // the script stated is in the declaration's own unit (`host-interface.md`
    // 7.1) and what a part holds is folded from fills.
    if (outcome.plan.qtyType === 'units' && sent > Math.abs(held)) {
      found.push(`bar ${call.bar} closed ${part} holding ${held} by sending ${sent}`);
    }
  }
  return found;
}

/**
 * The side a position reference is on, as the destination's own record has it.
 *
 * What has settled on it where anything has, and otherwise the side of the
 * first order it was ever handed, which is the side it is being opened on. A
 * host knows both without asking the engine: it answered the fills, and it
 * holds the orders it has not answered.
 */
function sideOfRef(outcome: Outcome, ref: number, bar: number): number {
  const settled = settledEntering(outcome, ref, bar);
  if (settled !== 0) return Math.sign(settled);
  const first = outcome.run.sent.find((one) => one.positionRef === ref && one.kind === 'place');
  if (first === undefined) return 0;
  return first.side === 'buy' ? 1 : -1;
}

/**
 * Every close sent against a position on its own side.
 *
 * **A close is named for reducing.** It is sent against the position it is
 * closing (17.1), so the reference it carries is never one already on the side
 * the order is on: an order on a reference's own side adds to it, and a call
 * named close that adds to a position is the reading 17.2 refuses.
 *
 * A reference nothing has settled on yet is still on a side, the one the order
 * that opened it is on, which is 17.1's sentence about a position holding what
 * is still to come. That is the case this caught: with the leg's own long
 * entirely inside an order the destination still had, a close in cash was
 * handed the reference a short entry was opening and was a sell on it.
 */
function closesThatAdd(outcome: Outcome): readonly string[] {
  const found: string[] = [];
  for (const call of outcome.plan.calls) {
    if (!call.isClose || call.bar >= outcome.stoppedAt) continue;
    for (const intent of sentOnBar(outcome, call.bar)) {
      const side = intent.side === 'buy' ? 1 : -1;
      if (sideOfRef(outcome, intent.positionRef, call.bar) !== side) continue;
      found.push(
        `bar ${call.bar} closed on reference ${intent.positionRef}, which is already ${side === 1 ? 'long' : 'short'}`,
      );
    }
  }
  return found;
}

/**
 * The three properties, over generated runs.
 *
 * A failure names the seed, which is the run number: `planFor(seed, BARS)`
 * writes the same script and `runPlan(plan, seed)` answers it the same way, so
 * a reader reproduces it exactly by asking for that one.
 */
test('generated runs keep what 17.1 and 17.2 are unconditional about', () => {
  let closes = 0;
  let againstTheLeg = 0;
  let measuredRefs = 0;
  let unitsRuns = 0;
  for (let seed = 1; seed <= RUNS; seed += 1) {
    const plan = planFor(seed, BARS);
    const outcome = runPlan(plan, seed);
    const where = `run ${seed}: ${plan.lines.join(' / ')}`;
    const refs = referencesOf(outcome);
    assert.deepEqual(crossedOnDestination(refs), [], where);
    assert.deepEqual(reversedByAnswers(refs), [], where);
    assert.deepEqual(addingCloses(outcome), [], where);
    assert.deepEqual(closesThatAdd(outcome), [], where);
    for (const call of plan.calls) {
      if (!call.isClose || call.closes === null || call.bar >= outcome.stoppedAt) continue;
      const part = heldEntering(outcome, call.closes, call.bar);
      if (part === 0) continue;
      closes += 1;
      // The shape issue 0019 was measured on: a part on the side its leg is not
      // on, which is where the two readings of a close's direction disagree.
      if (Math.sign(part) !== Math.sign(heldEntering(outcome, null, call.bar))) againstTheLeg += 1;
    }
    for (const one of refs.values()) if (one.measured && one.settled !== 0) measuredRefs += 1;
    if (plan.qtyType === 'units') unitsRuns += 1;
  }
  // A property nothing reaches is a green tick on nothing, so what the runs
  // actually met is counted and held to a floor. The floors sit well under what
  // the generator produces today: they are here to fail the day a change to it
  // stops writing one of these shapes, rather than to record a number.
  assert.ok(closes > 600, `only ${closes} tagged closes met a part that held something`);
  assert.ok(
    againstTheLeg > 100,
    `only ${againstTheLeg} tagged closes met a part on the side its leg was not on`,
  );
  assert.ok(measuredRefs > 600, `only ${measuredRefs} references were measured`);
  assert.ok(unitsRuns > 200 && unitsRuns < RUNS - 200, `${unitsRuns} runs counted in units`);
});
