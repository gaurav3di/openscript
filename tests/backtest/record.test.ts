/**
 * The record: whether a run can be reproduced from its own document, months
 * later and by somebody else.
 *
 * **This is the phase's gate, written as a check rather than as a promise.** A
 * record is reproducible when three things hold, and each one has a test below
 * that fails when it stops holding:
 *
 * - **Nothing is missing.** The channels are listed here by name, so a channel
 *   quietly dropped from the document fails at the moment it is dropped rather
 *   than the first time somebody needs it.
 * - **The report is a function of the fills.** `replay` folds the money again
 *   from the record's own fills and bar closes and has to produce the same
 *   report. If it does not, the report was reading something the engine happened
 *   to be holding, and nobody can reproduce it from the document.
 * - **The run is a function of the record.** `rerun` executes the record's
 *   program over its bars under its settings, and the two documents are compared
 *   as bytes. The tolerance on a record is for a second implementation and is
 *   never this one's excuse: a rerun here is bit-identical or it is a defect.
 *
 * And one test that the comparison can fail at all, because a field-for-field
 * comparison that always passes is the most expensive green there is.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RECORD_VERSION,
  backtest,
  barsHash,
  recordFromJson,
  recordToJson,
  replay,
  rerun,
  runBytes,
} from '../../src/core/backtest/index.js';
import type { RunRecord } from '../../src/core/backtest/index.js';
import { reportOf } from '../../src/core/accounting/index.js';
import { CONTRACT, FACTS, inAndOut, probeText, revised, rising, runSettings } from './support.js';
import { compile } from '../engine/support.js';

const BARS = rising(8);

/** The channels a record carries, which is what a reader is promised. */
const CHANNELS: readonly string[] = [
  'bars',
  'diagnostics',
  'engine',
  'fills',
  'frames',
  'instrument',
  'languageVersion',
  'orders',
  'program',
  'programHash',
  'recordVersion',
  'report',
  'settings',
  'source',
  'sourceText',
];

function recorded(form: 'inline' | 'referenced' = 'inline'): RunRecord {
  const out = backtest(inAndOut({ commission: 20, slippage: 1 }), BARS, runSettings(), { form });
  assert.equal(out.ok, true);
  if (!out.ok) throw new Error('the probe run was refused');
  return out.record;
}

/**
 * A record carries every channel and none of them is empty for a run that
 * traded.
 *
 * Catches a channel dropped from the document, which is exactly the failure the
 * gate is about: a record missing its frames replays perfectly on this engine,
 * because this engine has the program, and is useless to the second engine it
 * was written for.
 */
test('a record carries every channel it promises', () => {
  const record = recorded();
  assert.deepEqual(Object.keys(record).sort(), CHANNELS.slice().sort());

  assert.equal(record.recordVersion, RECORD_VERSION);
  assert.equal(record.engine.name.length > 0, true);
  assert.equal(record.engine.version.length > 0, true);
  assert.equal(record.languageVersion, '1');
  assert.equal(record.programHash.startsWith('sha256:'), true);
  assert.equal(record.source.hash.length > 0, true);
  assert.equal(record.source.lines > 0, true);
  assert.equal(record.bars.form, 'inline');
  assert.equal(record.bars.count, BARS.length);
  assert.equal(record.frames.length > 0, true);
  assert.equal(record.fills.length, 2);
  assert.equal(record.orders.length, 2);
  assert.deepEqual(record.diagnostics, []);
  assert.equal(record.report.trades.length, 1);
  assert.equal(record.settings.contract.symbol, CONTRACT.symbol);
});

test('a record records the script text when it is given one, and checks it', () => {
  // The text is what makes a record a conformance case, and the check is what
  // stops a case being built from a different revision than the one that ran:
  // its script would not make its own expected output, and the engine under
  // test would be blamed for a disagreement that was in the case all along.
  const text = probeText();
  const program = compile('probe.oscript', text).program;
  const out = backtest(program, BARS, runSettings(), { sourceText: text });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.record.sourceText, text);

  assert.throws(
    () => backtest(program, BARS, runSettings(), { sourceText: `${text}
# edited
` }),
    /does not hash/,
  );
});

test('a record written without the text says so rather than guessing', () => {
  const record = recorded();
  assert.equal(record.sourceText, null);
});

/**
 * The record carries the instrument record the engine was handed, whole.
 *
 * Catches a driver that records the six facts it was given rather than the
 * twelve-fact record it composed, which would leave a case reader composing
 * it again and the two compositions free to disagree; and catches one that
 * composed the record for the engine and wrote the contract into the channel,
 * which is what the case projection used to be handed.
 */
test('a record carries the instrument record the engine was handed, whole', () => {
  const out = backtest(inAndOut(), BARS, runSettings(), { instrument: FACTS });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.deepEqual(out.record.instrument, {
    ...FACTS,
    symbol: CONTRACT.symbol,
    exchange: CONTRACT.exchange,
    tickSize: CONTRACT.tickSize,
    lotSize: CONTRACT.lotSize,
    pointValue: CONTRACT.pointValue,
    currency: CONTRACT.currency,
  });
});

/**
 * And the engine reads that record, not another one.
 *
 * A record can show what the driver composed and say nothing about what the
 * engine was handed, so the proof is a refusal only the engine makes: a
 * session with no timezone to read it in is OS6012 at load, `host-interface.md`
 * 4.3. A driver that wrote the facts into the record and handed the engine the
 * contract alone would run this without a word.
 */
test('the stated facts are the ones the engine reads at load', () => {
  const out = backtest(inAndOut(), BARS, runSettings(), {
    instrument: { hasVolume: true, session: { start: '09:00', end: '17:30' } },
  });
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.diagnostic.code, 'OS6012');
  assert.equal(out.diagnostic.span.offset, 0);
  assert.equal(out.diagnostic.span.length, 0);
});

/**
 * Each earlier revision reads with the channels it never carried absent, and
 * with the ones it did carry intact.
 *
 * A version bump that made every stored run unreadable would cost the thing
 * the record is for. Catches a reader that nulls every later channel whatever
 * the revision, which drops the text out of a version 2 record that carried
 * it; and one that reads an old record as the current revision, where a
 * channel it never had comes back undefined rather than absent, and the case
 * projection then refuses it for the wrong reason.
 */
test('a record from an earlier revision reads with only its missing channels absent', () => {
  const text = probeText();
  const out = backtest(compile('probe.oscript', text).program, BARS, runSettings(), {
    sourceText: text,
    instrument: FACTS,
  });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  const record = out.record;

  const two = { ...record, recordVersion: 2 };
  delete (two as { instrument?: unknown }).instrument;
  const readTwo = recordFromJson(JSON.stringify(two));
  assert.notEqual(readTwo, null);
  assert.equal(readTwo?.sourceText, text);
  assert.equal(readTwo?.instrument, null);

  const one = { ...two, recordVersion: 1 };
  delete (one as { sourceText?: unknown }).sourceText;
  const readOne = recordFromJson(JSON.stringify(one));
  assert.notEqual(readOne, null);
  assert.equal(readOne?.sourceText, null);
  assert.equal(readOne?.instrument, null);
  assert.equal(readOne?.report.trades.length, record.report.trades.length);
});

/**
 * The report is what the fills fold to, and nothing else.
 *
 * `replay` runs no bar and places no order: it takes the record's own fills and
 * bar closes and folds the money again. Catches a report that depended on
 * anything the engine was holding at the end of the run, which is a report only
 * the process that produced it can reproduce.
 */
test('replaying a record reproduces its report field for field', () => {
  const record = recorded();
  const again = replay(record);
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.deepEqual(again.report, record.report);
});

/**
 * And the comparison above can fail.
 *
 * A record with one fill taken out of it replays to a different report. Without
 * this, an implementation of `replay` that returned `record.report` unchanged
 * would pass the test above for ever, and the gate would be a tick beside a
 * function that compares a value with itself.
 */
test('a record missing a fill replays to a different report', () => {
  const record = recorded();
  const short: RunRecord = { ...record, fills: record.fills.slice(0, 1) };
  const again = replay(short);
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.notDeepEqual(again.report, record.report);
  assert.equal(again.report.trades[0]?.isOpen, true);
});

/**
 * The report is folded from the fills by the same call anybody else would use.
 *
 * The money layer is handed the record's own channels directly here, with no
 * driver and no engine in the way, and it comes to the same report. That is
 * what makes the document readable by something that is not this driver.
 */
test('the money layer folds the record into the same report', () => {
  const record = recorded();
  const again = replay(record);
  assert.equal(again.ok, true);
  if (!again.ok) return;
  const direct = reportOf(
    record.fills,
    record.report.equity.map((point) => ({
      barIndex: point.barIndex,
      time: point.time,
      close: BARS[point.barIndex]?.close ?? null,
      inReport: true,
    })),
    null,
    record.settings.contract,
    record.report.summary.capital,
  );
  // The schedule is left out of this one, so the charges differ and the gross
  // does not: the fills are the same fills and the trade is the same trade.
  assert.equal(direct.trades[0]?.grossProfit, record.report.trades[0]?.grossProfit);
  assert.equal(direct.summary.charges, 0);
});

/**
 * Running the record again produces the same bytes.
 *
 * Catches every way float determinism is lost: a collection re-summed in
 * another order, a map iterated, a rounding applied twice, a clock or a random
 * number anywhere in the fold. Each of those is right to eleven digits and
 * fails here, which is the point of comparing bytes rather than figures.
 */
test('a record made under stated facts and its own text reruns to the same bytes', () => {
  // The two channels that arrived after rerun was written. A rerun handed the
  // contract alone runs under different session facts, so a script reading a
  // session fact or the volume flag is a different run, and even one that reads
  // neither produces a record whose instrument channel is null where the
  // original's is not: different bytes, for the one record type the harvest is
  // about to produce. Catches a rerun that forwards neither channel.
  const text = probeText();
  const out = backtest(compile('probe.oscript', text).program, BARS, runSettings(), {
    instrument: FACTS,
    sourceText: text,
  });
  assert.equal(out.ok, true);
  if (!out.ok) return;

  const again = rerun(out.record);
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(runBytes(again.record), runBytes(out.record));
  // And the rerun's record is still a case: being rerun must not strip the text.
  assert.equal(again.record.sourceText, text);
});

test('rerunning a record produces the same run, byte for byte', () => {
  const record = recorded();
  const again = rerun(record);
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(runBytes(again.record), runBytes(record));
});

/**
 * The comparison survives the engine being upgraded, because that is the whole
 * claim: a run stored today reproduces months later, on a later release.
 *
 * `engine` is a version stamp inside the document, so comparing whole bytes
 * made the test pass for exactly as long as nothing was released and then fail
 * for the one reason that is not a defect. Catches a comparison that went back
 * to whole bytes, and catches one that dropped so much it compares nothing.
 */
test('a rerun under a later engine version is still the same run', () => {
  const record = recorded();
  const upgraded: RunRecord = { ...record, engine: { name: 'openscript', version: '99.0.0' } };
  assert.equal(runBytes(upgraded), runBytes(record), 'the stamp is not part of the run');
  assert.notEqual(recordToJson(upgraded), recordToJson(record), 'and it is still in the document');
});

test('the run bytes still carry everything the run did', () => {
  // The other direction: a comparison that dropped the report, or the fills,
  // would pass every test above and prove nothing at all.
  const record = recorded();
  const moved: RunRecord = {
    ...record,
    report: {
      ...record.report,
      summary: { ...record.report.summary, netProfit: record.report.summary.netProfit + 1 },
    },
  };
  assert.notEqual(runBytes(moved), runBytes(record));
});

/**
 * A replay over revised bars is refused.
 *
 * Bars are revised: a feed corrects a print, a session is extended, a split is
 * applied to history. Catches an implementation that replays whatever it is
 * handed, which reports the original figures over different data and is the
 * most convincing wrong answer this system can produce.
 */
test('bars that are not the bars the record was made from are refused', () => {
  const record = recorded();
  const wrong = replay(record, revised(BARS, 3, 199));
  assert.equal(wrong.ok, false);
  if (wrong.ok) return;
  assert.equal(wrong.diagnostic.code, 'OS6022');
  assert.equal(wrong.diagnostic.span.offset, 0);
  assert.equal(wrong.diagnostic.span.length, 0);
  assert.equal(wrong.diagnostic.span.line, 0);
  assert.equal(wrong.diagnostic.span.column, 0);

  const right = replay(record, BARS);
  assert.equal(right.ok, true);
});

/**
 * A referenced record names its bars and does not carry them.
 *
 * The operational form, because nothing that grows with history may travel in a
 * request body. Catches an implementation whose two forms hash differently,
 * which would make every referenced record unreplayable, and one that replays a
 * referenced record without being given the bars at all, which is a report over
 * whatever the caller had lying about.
 */
test('a referenced record hashes the same bars and refuses to replay without them', () => {
  const referenced = recorded('referenced');
  assert.equal(referenced.bars.form, 'referenced');
  assert.equal('rows' in referenced.bars, false);
  assert.equal(referenced.bars.hash, barsHash(BARS));
  assert.equal(referenced.bars.count, BARS.length);

  const blind = replay(referenced);
  assert.equal(blind.ok, false);
  if (!blind.ok) assert.equal(blind.diagnostic.code, 'OS6022');

  const held = replay(referenced, BARS);
  assert.equal(held.ok, true);
  if (held.ok) assert.deepEqual(held.report, referenced.report);
});

/**
 * The hash is over the bars and over their order.
 *
 * Catches a hash taken over the count, or over the first and last time, or over
 * a set rather than a sequence: each of them would call two different studies
 * the same run.
 */
test('the bars hash follows every field and the order they are in', () => {
  assert.equal(barsHash(BARS), barsHash(rising(8)));
  assert.notEqual(barsHash(BARS), barsHash(revised(BARS, 3, 199)));
  assert.notEqual(barsHash(BARS), barsHash(BARS.slice().reverse()));
  assert.notEqual(barsHash(BARS), barsHash(BARS.slice(0, 7)));
});

/**
 * The document reads back as itself, and a document of another revision does
 * not read back at all.
 *
 * Catches a reader that takes any JSON object as a record, which is how a later
 * revision's fields get read under this revision's rules and a run silently
 * becomes a different run.
 */
test('a record survives the round trip and a foreign revision does not', () => {
  const record = recorded();
  const text = recordToJson(record);
  const read = recordFromJson(text);
  assert.notEqual(read, null);
  assert.equal(recordToJson(read as RunRecord), text);

  const later = JSON.stringify({ ...record, recordVersion: RECORD_VERSION + 1 });
  assert.equal(recordFromJson(later), null);
});
