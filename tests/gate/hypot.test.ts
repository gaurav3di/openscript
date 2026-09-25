import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { compileText, loadCompiled } from './support.js';
import { bits, certified, pairs } from '../stdlib/hypot-cases.js';

test('a compiled hypotenuse program has the same certified columns in both engines', () => {
  const source = 'version 1\nstudy("Exact diagonal")\nplot(math.hypot(open, close), "Diagonal")\n';
  const compiled = compileText('exact-diagonal', source);
  const input = pairs();
  const bars = input.map(([open, close], index) => ({
    time: 1700000000000 + index * 60000, open, high: open, low: close, close, volume: 1,
  }));
  const engine = loadCompiled(compiled, 'exact-diagonal');
  assert.equal(engine.run(bars, bars.map(() => ({isConfirmed:true}))).diagnostic, undefined);
  const plot = compiled.program.outputs.plots[0];
  assert.ok(plot);
  const column = engine.column(plot.channel);
  const encoded = column.map(value => value === null ? null : bits(value as number).toString(16).padStart(16, '0'));
  input.forEach(([x, y], index) => assert.ok(certified(x, y, column[index] as number | null), `bar ${index}`));

  const python = spawnSync('python', ['-m', 'tests.test_hypot', '--compiled'], {
    cwd: resolve('engine'), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    input: JSON.stringify({program:compiled.program, bars}),
  });
  assert.equal(python.status, 0, python.stderr);
  assert.deepEqual(JSON.parse(python.stdout), encoded);
});
