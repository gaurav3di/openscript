import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import type { HostBar } from '../../src/core/engine/index.js';
import { compileText, loadCompiled } from './support.js';
import { encode } from '../stdlib/transcendental-cases.js';
import { decode, powerCases } from '../stdlib/power-cases.js';

interface Delivery { index:number; bar:HostBar }
function compared(deliveries:Delivery[]): (string|null)[][] {
  const compiled=compileText('portable-power','version 1\nstudy("Portable power")\nvalue = pow(open,close)\nplot(value,"Power")\nplot(value[1],"Previous")\n');
  const engine=loadCompiled(compiled,'portable-power');
  let previous=-1;
  const output=deliveries.map(({index,bar})=>{
    const result=index===previous?engine.update(bar):engine.append(bar);
    assert.equal(result.diagnostic,undefined); previous=index;
    return compiled.program.outputs.plots.map(plot=>encode(engine.column(plot.channel)[index] as number|null));
  });
  const python=spawnSync('python',['-m','tests.test_power','--compiled'],{
    cwd:resolve('engine'),encoding:'utf8',maxBuffer:4*1024*1024,
    input:JSON.stringify({program:compiled.program,deliveries}),
  });
  assert.equal(python.status,0,python.stderr);
  assert.deepEqual(JSON.parse(python.stdout),output);
  return output;
}

test('compiled power and its history agree after forming rollback and absent inputs',()=>{
  const cases=powerCases().filter(row=>[decode(row.x),decode(row.y)].every(value=>value===null||Number.isFinite(value)));
  const selected=cases.filter((row,index)=>row.midpoint || row.kind==='algebraic' || index%37===0);
  const bars=selected.map((row,index):HostBar=>({time:1700000000000+index*60000,
    open:decode(row.x),high:1,low:0,close:decode(row.y),volume:1}));
  const history=compared(bars.map((bar,index)=>({index,bar})));
  assert.deepEqual(history.map(row=>row[0]),selected.map(row=>row.expected));
  const live=compared(bars.flatMap((bar,index)=>[
    {index,bar:{...bar,open:1+(index+1)/64,close:0.25}},{index,bar},
  ])).filter((_,index)=>index%2===1);
  assert.deepEqual(live,history);
});
