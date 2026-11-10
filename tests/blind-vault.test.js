import test from 'node:test';
import assert from 'node:assert/strict';
import {encryptDefaults,decryptDefaults,validateVault,DEFAULT_ITERATIONS} from '../app/blind/vault.js';

test('private defaults use randomized authenticated encryption and round-trip Unicode choices',async()=>{
  const choices={'pair:AB':'invented test moon 🚀','twist:UFR:CW':'invented test twist'};
  const a=await encryptDefaults(choices,'a test password'),b=await encryptDefaults(choices,'a test password');
  assert.equal(a.iterations,DEFAULT_ITERATIONS);assert.notEqual(a.salt,b.salt);assert.notEqual(a.iv,b.iv);assert.notEqual(a.ciphertext,b.ciphertext);
  assert(!JSON.stringify(a).includes('invented test moon'));
  assert.deepEqual(await decryptDefaults(a,'a test password'),choices);
  await assert.rejects(decryptDefaults(a,'wrong password'),/Could not unlock/);
  const bytes=Uint8Array.from(atob(a.ciphertext),c=>c.charCodeAt(0));bytes[0]^=1;
  await assert.rejects(decryptDefaults({...a,ciphertext:btoa(String.fromCharCode(...bytes))},'a test password'),/Could not unlock/);
});
test('untrusted vault sizes and formats are rejected before expensive key derivation',()=>{
  for(const value of [null,{}, {version:7}, {version:1,kdf:'PBKDF2-SHA256',iterations:99_999}, {version:1,kdf:'PBKDF2-SHA256',iterations:2_000_001}])assert.throws(()=>validateVault(value));
});
