// Local-only build step. Password is read without echo, never saved or logged.
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { encryptDefaults } from '../app/blind/vault.js';
const root=fileURLToPath(new URL('../',import.meta.url));
process.stdout.write('Password for private default memos (hidden): ');
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdin.resume();
let password='';
await new Promise((resolve,reject)=>{
  const receive=chunk=>{
    const value=chunk.toString('utf8');
    if(value.includes('\u0003')){reject(new Error('Cancelled.'));return;}
    if(/[\r\n]/.test(value)){password+=value.split(/[\r\n]/)[0];process.stdin.off('data',receive);resolve();}
    else password+=value;
    if(password.length>1024)reject(new Error('Password is too long.'));
  };
  process.stdin.on('data',receive);
});
if(process.stdin.isTTY)process.stdin.setRawMode(false);
process.stdin.pause();process.stdout.write('\n');
const metadata = await import('../app/blind/data.js');
const python = `import json,sys,zipfile,xml.etree.ElementTree as E
z=zipfile.ZipFile(sys.argv[1]);ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
strings=[''.join(x.itertext()) for x in E.fromstring(z.read('xl/sharedStrings.xml'))]
sheet=E.fromstring(z.read('xl/worksheets/sheet1.xml'));cells={}
for c in sheet.findall('.//s:sheetData/s:row/s:c',ns):
 v=c.find('s:v',ns)
 if v is not None: cells[c.attrib['r']]=strings[int(v.text)] if c.attrib.get('t')=='s' else v.text
sys.stdout.write(json.dumps(cells))`;
const cells=JSON.parse(execFileSync('python3',['-c',python,root+'LP.xlsx'],{encoding:'utf8',maxBuffer:2_000_000}));
const memos={};
for(const card of [...metadata.PAIRS,...metadata.SPECIALS]){
  const address=card.source.split('!').at(-1);let text=String(cells[address]??'').trim();
  if(card.kind==='pair')text=text.replace(new RegExp('^'+card.pair+'(?=[\\s:—–-])[\\s:—–-]*'),'');
  if(card.kind==='twist')text=text.replace(/^(CW|CCW)\s+/,'');
  if(!text)throw new Error('A source memo is missing.');memos[card.id]=text;
}
if(Object.keys(memos).length!==601)throw new Error('Incomplete source memo set.');
const vault=await encryptDefaults(memos,password);password='';
await writeFile(root+'app/blind/default-memos.js','// Encrypted private defaults. No key or password is included.\nexport const DEFAULT_MEMO_VAULT = Object.freeze('+JSON.stringify(vault)+');\n');
console.log('Sealed 601 default choices. Only encrypted data was written.');
