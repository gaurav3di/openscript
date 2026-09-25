import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import type { HostBar } from '../../src/core/engine/index.js';
import { compileText, loadCompiled } from './support.js';
import { kinds } from '../stdlib/trigonometric-cases.js';
import { fromBits } from '../stdlib/hypot-cases.js';
import { encode } from '../stdlib/transcendental-cases.js';

interface Delivery { index:number; bar:HostBar }
function bar(index:number,close:number|null,open=2):HostBar {
  return {time:1700000000000+index*60000,open,close,high:open,low:close,volume:1};
}

function compared(source:string,deliveries:Delivery[],certify=false,history=false):(string|null)[][] {
  const compiled=compileText('portable-angles',source),engine=loadCompiled(compiled,'portable-angles');
  let previous=-1;
  const output=deliveries.map(delivery=>{
    const result=delivery.index===previous?engine.update(delivery.bar):engine.append(delivery.bar);
    assert.equal(result.diagnostic,undefined);
    previous=delivery.index;
    return compiled.program.outputs.plots.map(plot=>encode(engine.column(plot.channel)[delivery.index] as number|null));
  });
  const python=spawnSync('python',['-B','-m','tests.test_trigonometric','--compiled'],{
    cwd:resolve('engine'),encoding:'utf8',maxBuffer:4*1024*1024,
    input:JSON.stringify({program:compiled.program,deliveries,certify,history}),
  });
  assert.equal(python.status,0,python.stderr);
  assert.deepEqual(JSON.parse(python.stdout),output);
  return output;
}

test('compiled trigonometric columns satisfy directed certificates in both engines',()=>{
  const source='version 1\nstudy("Portable angles")\n'+kinds.map(kind=>
    `plot(math.${kind}(${kind==='atan2'?'close,open':'close'}), "${kind}")`).join('\n');
  const values=[null,0,-0,1,-1,0.125,0.5,4,Number.MIN_VALUE,3*Number.MIN_VALUE,
    fromBits(0x3fefffffffffffffn),fromBits(0xbfefffffffffffffn),
    fromBits(0x4180000000000000n),fromBits(0x44f0000000000000n),Number.MAX_VALUE,-Number.MAX_VALUE];
  compared(source,values.map((close,index)=>({index,bar:bar(index,close)})),true);
});

test('compiled angle functions retain stored history through repeated forming corrections',()=>{
  const source='version 1\nstudy("Stored vector angle")\nfn angle(y,x) => math.atan2(y,x)\n'+
    'held = angle(close,open)\nvar first = held\nplot(held,"Angle")\nplot(held[1],"Previous")\nplot(first,"First")\n';
  const finals=[bar(0,3*Number.MIN_VALUE),bar(1,-3*Number.MIN_VALUE),bar(2,null),
    bar(3,1,-1),bar(4,-1,-1),bar(5,Number.MIN_VALUE,Number.MAX_VALUE),bar(6,-0,-1)];
  const historical=compared(source,finals.map((value,index)=>({index,bar:value})),false,true);
  const live=compared(source,finals.flatMap((value,index)=>[
    {index,bar:{...value,close:1,open:1}},
    {index,bar:{...value,close:-1,open:-1}},
    {index,bar:value},
  ]),false,true).filter((_,index)=>index%3===2);
  assert.deepEqual(live,historical);
  assert.deepEqual(historical[0],['0000000000000001',null,'0000000000000001']);
  assert.deepEqual(historical[1],['8000000000000001','0000000000000001','0000000000000001']);
});
