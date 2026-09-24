/**
 * A bare read of an instrument fact the host did not state, `host-interface.md`
 * 4.5 and decision 66.
 *
 * Issue 0002 held two documented behaviours for one read: the catalogue's
 * OS6012 said a bare `chart.lotSize` the host never stated stops the bar, and
 * `stdlib.md` 3.4 said it is `none`. The settlement is the second, and OS6012
 * belongs only to something that cannot default the fact, which
 * `requests-host.test.ts` holds at load. This file holds the other half, so an
 * engine that started refusing a bare read would fail here rather than in a
 * reader's study.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { load } from '../../src/core/engine/index.js';
import { pageInstrument } from '../hosts/index.js';
import { asWire, compile, flat } from './support.js';

test('a tick size and a lot size the host did not state read as none, and nothing stops', () => {
  // Catches an engine that raises OS6012 on the read, and one that guesses a
  // value: the first stops the study on every host that leaves a fact out, the
  // second sizes orders by a number nobody supplied.
  const compiled = compile(
    'facts.oscript',
    [
      'version 1',
      'study("Facts", overlay = true)',
      'plot(isNone(chart.tickSize) ? 1 : 0, "Tick absent")',
      'plot(orElse(chart.lotSize, 7), "Lot or seven")',
    ].join('\n'),
  );
  const record = { ...pageInstrument({ interval: '5' }) } as Record<string, unknown>;
  delete record['tickSize'];
  delete record['lotSize'];
  const loaded = load(asWire(compiled.program), {
    source: compiled.file,
    host: { instrument: record as never },
  });
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  const result = loaded.engine.append(flat(100), { isConfirmed: true });
  assert.equal(result.diagnostic, undefined);
  assert.deepEqual(result.columns.slice(0, 2), [1, 7]);
});
