// Private defaults are authenticated ciphertext. No password or key is bundled.
const encoder = new TextEncoder();
const AAD = encoder.encode('blind-memo-defaults:v1');
export const DEFAULT_ITERATIONS = 600_000;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function decode(value, maximum) {
  if(typeof value!=='string'||value.length>maximum||!value.length||value.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw new Error('Invalid encrypted memo data.');
  try{return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}catch{throw new Error('Invalid encrypted memo data.');}
}
function encode(bytes) {
  let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(text);
}
export function validateVault(vault) {
  if(!object(vault)||vault.version!==1||vault.kdf!=='PBKDF2-SHA256'||!Number.isInteger(vault.iterations)||vault.iterations<100_000||vault.iterations>2_000_000)throw new Error('Unsupported encrypted memo data.');
  const salt=decode(vault.salt,32),iv=decode(vault.iv,24),ciphertext=decode(vault.ciphertext,1_400_000);
  if(salt.length!==16||iv.length!==12||ciphertext.length<17||ciphertext.length>1_000_000)throw new Error('Invalid encrypted memo data.');
  return {salt,iv,ciphertext};
}
function validatePassword(password) {
  if(typeof password!=='string'||!password.length||password.length>1024)throw new Error('Enter a password of up to 1,024 characters.');
}
function validatePayload(payload) {
  if(!object(payload)||payload.format!=='blind-memo-defaults'||payload.version!==1||!object(payload.memos)||Object.keys(payload.memos).length>601)throw new Error('Invalid decrypted memo choices.');
  for(const [id,memo] of Object.entries(payload.memos))if(!/^(pair:[A-X]{2}|flip:[A-Z]{2}|twist:[A-Z]{3}:(CW|CCW))$/.test(id)||typeof memo!=='string'||memo.length>4000)throw new Error('Invalid decrypted memo choices.');
  return payload.memos;
}
async function key(password,salt,iterations,usage) {
  const material=await globalThis.crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
  return globalThis.crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,[usage]);
}
export async function encryptDefaults(memos,password,{iterations=DEFAULT_ITERATIONS}={}) {
  validatePassword(password);
  const payload={format:'blind-memo-defaults',version:1,memos};validatePayload(payload);
  const plain=encoder.encode(JSON.stringify(payload));
  if(plain.length>999_984)throw new Error('The memo choices are too large to encrypt.');
  if(!globalThis.crypto?.subtle)throw new Error('Encryption requires a secure browser or Node.js.');
  if(!Number.isInteger(iterations)||iterations<100_000||iterations>2_000_000)throw new Error('Invalid encryption work factor.');
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const derived=await key(password,salt,iterations,'encrypt');
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:AAD,tagLength:128},derived,plain);
  return {version:1,kdf:'PBKDF2-SHA256',iterations,salt:encode(salt),iv:encode(iv),ciphertext:encode(new Uint8Array(encrypted))};
}
export async function decryptDefaults(vault,password,{bridge=globalThis.window?.cornerlabNative}={}) {
  validatePassword(password);const {salt,iv,ciphertext}=validateVault(vault);
  try{
    let payload;
    if(globalThis.crypto?.subtle){
      const derived=await key(password,salt,vault.iterations,'decrypt');
      const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:AAD,tagLength:128},derived,ciphertext);
      payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));
    }else if(bridge?.decryptMemoDefaults){payload=await bridge.decryptMemoDefaults(vault,password);}
    else throw new Error('Unlocking requires HTTPS, localhost or the Mac app.');
    return validatePayload(payload);
  }catch(error){
    if(error.message==='Unlocking requires HTTPS, localhost or the Mac app.')throw error;
    throw new Error('Could not unlock the defaults. Check the password and try again.');
  }
}
