/** Dedicated compiled Gaussian workload report; existing release budgets stay unchanged. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {compileText,loadCompiled} from '../dist-test/tests/gate/support.js';
import {insistOnRefusing} from './lib/runtime.mjs';

insistOnRefusing();
const compiled=compileText('gaussian-cost','version 1\nstudy("Gaussian cost")\nplot(alma(close,volume,high,low),"Kernel")\n');
const view=new DataView(new ArrayBuffer(8));
const encode=value=>{if(value===null)return null;view.setFloat64(0,value);return view.getBigUint64(0).toString(16).padStart(16,'0');};
const reports=[];
for(const length of [9,50,200]) for(const changing of [false,true]) {
  const bars=Array.from({length:length+199},(_,index)=>({time:1700000000000+index*60000,
    open:100,close:100+(index*7%31)/9,high:changing?0.65+(index%31)/100:0.85,
    low:changing?4+(index%17)/10:6,volume:length}));
  const times=[];let values;
  for(let repeat=0;repeat<4;repeat++) {
    const engine=loadCompiled(compiled,'gaussian-cost'),started=performance.now();
    const run=engine.run(bars);
    times.push(performance.now()-started);
    assert.equal(run.diagnostic,undefined);
    const next=engine.column(compiled.program.outputs.plots[0].channel).map(encode);
    if(values)assert.deepEqual(next,values);values=next;
  }
  const python=spawnSync('python',['-m','tests.test_transcendental','--bench'],{
    cwd:fileURLToPath(new URL('../engine/',import.meta.url)),encoding:'utf8',maxBuffer:4*1024*1024,
    input:JSON.stringify({program:compiled.program,bars}),
  });
  assert.equal(python.status,0,python.stderr);
  const other=JSON.parse(python.stdout);assert.deepEqual(other.values,values);
  reports.push({length,changing,bars:bars.length,validOutputs:values.filter(x=>x!==null).length,
    js:{coldMs:times[0],medianWarmMs:times.slice(1).sort((a,b)=>a-b)[1]},python:other.timings});
}
console.log(JSON.stringify({scope:'Compiled scalar study; 200 completed-window observations after warmup, cold then three warm runs; no budget change',reports},null,2));
