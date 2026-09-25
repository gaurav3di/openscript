import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import type { HostBar } from '../../src/core/engine/index.js';
import { compileText, loadCompiled } from './support.js';
import { encode, inputs, kinds } from '../stdlib/transcendental-cases.js';

interface Delivery { index: number; bar: HostBar }
const bar = (index:number, close:number|null):HostBar => ({time:1700000000000+index*60000,open:close,high:close,low:close,close,volume:1});

function compared(source:string, deliveries:Delivery[], scalar=false, derived=false, varying=false): (string|null)[][] {
  const compiled=compileText('portable-elementary',source), engine=loadCompiled(compiled,'portable-elementary');
  let previous=-1;
  const output=deliveries.map(delivery=>{
    const result=delivery.index===previous?engine.update(delivery.bar):engine.append(delivery.bar);
    assert.equal(result.diagnostic,undefined);previous=delivery.index;
    return compiled.program.outputs.plots.map(plot=>encode(engine.column(plot.channel)[delivery.index] as number|null));
  });
  const python=spawnSync('python',['-m','tests.test_transcendental','--compiled'],{
    cwd:resolve('engine'),encoding:'utf8',maxBuffer:4*1024*1024,
    input:JSON.stringify({program:compiled.program,deliveries,scalar,derived,varying}),
  });
  assert.equal(python.status,0,python.stderr);
  assert.deepEqual(JSON.parse(python.stdout),output);
  return output;
}

test('compiled elementary columns agree and have independent rounding certificates',()=>{
  const source='version 1\nstudy("Portable elementary")\n'+kinds.map(kind=>`plot(${kind==='log2'?'math.log2':kind}(close), "${kind}")`).join('\n');
  const values=inputs().filter(x=>x===null||Number.isFinite(x));
  compared(source,values.map((x,index)=>({index,bar:bar(index,x)})),true);
});

test('compiled Hull source chronology includes an absent length observation',()=>{
  const output=compared('version 1\nstudy("Changing Hull window")\nplot(hma(close,volume),"Hull")\n',[
    {index:0,bar:{...bar(0,0),volume:null}}, {index:1,bar:{...bar(1,3),volume:2}},
  ]);
  assert.deepEqual(output,[[null],[encode(4)]]);
});

test('compiled Gaussian and log-derived studies retain exact values after live rollback',()=>{
  const source='version 1\nstudy("Portable derived readings")\nplot(alma(close,3,0.85,6),"Kernel")\nplot(hv(close,3,252),"Log spread")\nplot(chop(3),"Travel")\n';
  const finals=Array.from({length:35},(_,index)=>({...bar(index,20+(index*7%13)/3),high:30+index%3,low:10-index%2}));
  finals[7]={...finals[7]!,close:null};
  const history=compared(source,finals.map((value,index)=>({index,bar:value})),false,true);
  const deliveries=finals.flatMap((value,index)=>[{index,bar:{...value,close:40+index}},{index,bar:value}]);
  const live=compared(source,deliveries,false,true).filter((_,index)=>index%2===1);
  assert.deepEqual(live,history);
});

test('compiled changing Gaussian controls preserve chronology and cache-independent rollback',()=>{
  const source='version 1\nstudy("Changing portable kernel")\nplot(alma(close,volume,high,low),"Kernel")\nplot(hv(close,2,open),"Spread")\n';
  const finals=Array.from({length:45},(_,index)=>({...bar(index,index===9?-2:index===15?null:10+index/3),
    volume:[2,3,5,null,1][index%5]!,high:0.2+(index%13)/10,
    low:index===8?-1:index===17?1e308:index===28?1e162:6,
    open:index===4?0:index===6?null:252}));
  const history=compared(source,finals.map((value,index)=>({index,bar:value})),false,false,true);
  const live=compared(source,finals.flatMap((value,index)=>[
    {index,bar:{...value,high:0.85+(index%11)/100,low:4,volume:3,close:30+index}},
    {index,bar:value},
  ]),false,false,true).filter((_,index)=>index%2===1);
  assert.deepEqual(live,history);
});
