import {equivalentPairs,pieceInfo} from './cube.js';

const faceSet = piece => String(piece).toUpperCase().split('').sort().join('');
function caseKey(item) {
  if(!item || !['twist','flip'].includes(item.kind)) return null;
  const group=pieceInfo(String(item.piece).toUpperCase(),item.kind);
  if(!group || (item.kind==='twist'&&!['CW','CCW'].includes(item.direction))) return null;
  return `${item.kind}:${faceSet(group.name)}${item.kind==='twist'?':'+item.direction:''}`;
}

/** Targets may be entered with spaces or punctuation between letters.
 * An odd final target may instead be entered as its double-letter parity memo.
 * Alphabetic extras are retained and therefore cause a mismatch. */
export function lettersAnswerMatches(expected,text) {
  if(typeof expected!=='string') return false;
  const letters=String(text??'').toUpperCase().replace(/[\s\p{P}\p{S}]/gu,'');
  const target=expected.toUpperCase();
  return letters===target || (target.length%2===1 && letters===target+target.at(-1));
}

/** Accept physical piece names (with a solving direction for corners), or any
 * equivalent two-sticker orientation memo. Item order does not matter.
 * Whitespace, commas, semicolons and newlines separate cases; CW/CCW belongs to
 * the immediately preceding corner. Unknown text is never silently discarded.
 */
export function specialAnswerMatches(items,text) {
  if(!Array.isArray(items)) return false;
  const keys=items.map(caseKey);
  if(keys.some(key=>!key) || new Set(keys).size!==keys.length) return false;
  const source=String(text??'').toUpperCase().trim();
  if(/[^A-Z\s,;]/.test(source)) return false;
  const tokens=source.split(/[\s,;]+/).filter(Boolean);
  if(!items.length) return tokens.length===0;
  const expected=new Set(keys),aliases=new Map();
  function addAlias(alias,key) {
    if(!aliases.has(alias)) aliases.set(alias,new Set());
    aliases.get(alias).add(key);
  }
  items.forEach((item,i)=>{
    const normalized={...item,piece:String(item.piece).toUpperCase()};
    equivalentPairs(normalized).forEach(pair=>addAlias(pair,keys[i]));
    if(item.kind==='flip') {
      const name=pieceInfo(normalized.piece,'edges').name;
      addAlias(name,keys[i]);addAlias([...name].reverse().join(''),keys[i]);
    }
  });
  const answers=[],literalAnswers=new Set();
  for(let i=0;i<tokens.length;i++) {
    const token=tokens[i];
    let candidates,literal=token;
    const attached=token.match(/^([UDFBLR]{3})(CCW|CW)$/);
    if(attached || /^[UDFBLR]{3}$/.test(token)) {
      const piece=attached?attached[1]:token;
      const direction=attached?attached[2]:tokens[++i];
      if(!['CW','CCW'].includes(direction)) return false;
      const key=caseKey({kind:'twist',piece,direction});
      if(!key||!expected.has(key)) return false;
      candidates=[key];literal=key;
    } else {
      if(!/^[A-X]{2}$/.test(token)||!aliases.has(token)) return false;
      candidates=[...aliases.get(token)];
    }
    if(literalAnswers.has(literal)) return false;
    literalAnswers.add(literal);answers.push(candidates);
  }
  if(answers.length!==items.length) return false;
  // A face alias can also be a sticker memo (e.g. LU). Match the entire answer
  // rather than deciding its meaning prematurely, while using each case once.
  answers.sort((a,b)=>a.length-b.length);
  function assign(index,used) {
    if(index===answers.length) return true;
    for(const key of answers[index]) if(!used.has(key)) {
      used.add(key);
      if(assign(index+1,used)) return true;
      used.delete(key);
    }
    return false;
  }
  return assign(0,new Set());
}
