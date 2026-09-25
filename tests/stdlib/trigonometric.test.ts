import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import * as lib from '../../src/core/stdlib/index.js';
import { fromBits } from './hypot-cases.js';
import { encode } from './transcendental-cases.js';
import { cases } from './trigonometric-cases.js';
import { trigonometric } from '../../src/core/stdlib/maths/trigonometric.js';

test('trigonometric wrappers satisfy independent directed rational rounding cells', () => {
  const rows=cases().map(row=>({...row,first:encode(row.first),second:encode(row.second??null),
    actual:encode((row.kind==='atan2'?lib.atan2(row.first,row.second??null):lib[row.kind](row.first)) as number|null)}));
  const python=spawnSync('python',['-B','-m','tests.test_trigonometric','--certify'],{
    cwd:resolve('engine'),encoding:'utf8',input:JSON.stringify(rows),maxBuffer:4*1024*1024,
  });
  assert.equal(python.status,0,python.stderr);
  assert.deepEqual(JSON.parse(python.stdout),[]);
});

test('lower initial precision and cache reuse retain every rounded trigonometric output', () => {
  for (const row of cases()) {
    if (row.first===null || row.kind==='atan2' && row.second===null) continue;
    const first=trigonometric(row.kind,row.first,row.second??undefined,64);
    const repeated=trigonometric(row.kind,row.first,row.second??undefined);
    assert.equal(encode(first),encode(repeated));
  }
});

test('trigonometric wrappers round mathematical results at certified difficult inputs', () => {
  for (const [kind,input,wanted] of [
    ['sin',0x4180000000000000n,'bfef3fa130939baf'],
    ['cos',0x44f0000000000000n,'3fe06bc5dfae2da3'],
    ['tan',0x4010000000000000n,'3ff2866f9be4de13'],
    ['asin',0x3fef8f0914a905f4n,'3ff678f9a0b5ea7f'],
    ['acos',0x3fc0000000000000n,'3ff720a392c1d955'],
  ] as const) assert.equal(encode(lib[kind](fromBits(input)) as number|null),wanted,kind);
});

test('atan2 retains the cubic correction below a subnormal ratio midpoint', () => {
  assert.equal(encode(lib.atan2(3*Number.MIN_VALUE,2) as number|null),'0000000000000001');
  assert.equal(encode(lib.atan2(-3*Number.MIN_VALUE,2) as number|null),'8000000000000001');
});

test('both raw zero signs follow the stored-zero quadrant contract', () => {
  for (const zero of [0,-0]) {
    assert.equal(encode(lib.atan2(zero,-1) as number|null),'400921fb54442d18');
    for (const other of [0,-0,1]) assert.ok(Object.is(lib.atan2(zero,other),0));
    assert.equal(encode(lib.atan2(1,zero) as number|null),'3ff921fb54442d18');
    assert.equal(encode(lib.atan2(-1,zero) as number|null),'bff921fb54442d18');
  }
});

test('trigonometric wrappers do not delegate to host approximations', () => {
  for (const kind of ['sin','cos','tan','asin','acos','atan','atan2'] as const) {
    const saved=Math[kind];
    Math[kind]=()=>assert.fail('host trigonometric call');
    try { assert.equal(typeof (kind==='atan2'?lib.atan2(0.5,1):lib[kind](0.5)),'number'); }
    finally { Object.assign(Math,{[kind]:saved}); }
  }
});
