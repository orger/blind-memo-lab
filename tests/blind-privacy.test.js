import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PAIRS,SPECIALS} from '../app/blind/data.js';
import * as defaultsModule from '../app/blind/default-memos.js';
import {validateVault,DEFAULT_ITERATIONS} from '../app/blind/vault.js';

test('published card catalog contains geometry metadata and empty memo fields only',()=>{
  assert.equal(PAIRS.length,576);
  assert.equal(SPECIALS.length,25);
  for(const card of [...PAIRS,...SPECIALS]) {
    assert.equal(card.memo,'');
    const allowed=card.kind==='pair'?['id','pair','kind','memo','source']:['id','kind','piece','direction','memo','source'];
    assert.ok(Object.keys(card).every(key=>allowed.includes(key)));
    if(card.source!==undefined) assert.match(card.source,/^Sheet1![A-Z]+[0-9]+$/);
  }
});

test('bundled defaults expose only a bounded authenticated ciphertext envelope',async()=>{
  assert.deepEqual(Object.keys(defaultsModule),['DEFAULT_MEMO_VAULT']);
  const vault=defaultsModule.DEFAULT_MEMO_VAULT;
  assert.deepEqual(Object.keys(vault).sort(),['ciphertext','iterations','iv','kdf','salt','version']);
  const {salt,iv,ciphertext}=validateVault(vault);
  assert.equal(salt.length,16);assert.equal(iv.length,12);
  assert.ok(ciphertext.length>16);assert.ok(ciphertext.length<=1_000_000);
  assert.ok(vault.iterations>=DEFAULT_ITERATIONS);
  const source=await readFile(new URL('../app/blind/default-memos.js',import.meta.url),'utf8');
  const declaration=source.replace(/^\s*\/\/[^\n]*$/gm,'').trim();
  const match=declaration.match(/^export const DEFAULT_MEMO_VAULT\s*=\s*Object\.freeze\((\{[\s\S]*\})\);$/);
  assert.ok(match,'The defaults module contains only its public encrypted envelope.');
  assert.deepEqual(JSON.parse(match[1]),vault);
});
