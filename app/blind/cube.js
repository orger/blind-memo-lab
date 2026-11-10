/** Exact 3×3 sticker geometry in the user's white-up, green-front Speffz frame.
 * State values are home sticker letters; keys are the current sticker positions.
 * Corner triplets all run clockwise as viewed directly at the corner from outside.
 */
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWX';
export const FACE_COLORS = Object.freeze({U:'#f8f7ef', L:'#f39b42', F:'#38a778', R:'#df5550', B:'#5685dc', D:'#f2d34f'});
const NORMALS = {U:[0,1,0],L:[-1,0,0],F:[0,0,1],R:[1,0,0],B:[0,0,-1],D:[0,-1,0]};
const rawCorners = [
  ['UFR','CMJ',[1,1,1]], ['UFL','DIF',[-1,1,1]],
  ['UBL','AER',[-1,1,-1]], ['UBR','BQN',[1,1,-1]],
  ['DFR','VKP',[1,-1,1]], ['DFL','UGL',[-1,-1,1]],
  ['DBL','XSH',[-1,-1,-1]], ['DBR','WOT',[1,-1,-1]],
];
const rawEdges = [
  ['UB','AQ',[0,1,-1]], ['UR','BM',[1,1,0]], ['UF','CI',[0,1,1]], ['UL','DE',[-1,1,0]],
  ['FL','FL',[-1,0,1]], ['DL','GX',[-1,-1,0]], ['BL','HR',[-1,0,-1]], ['FR','JP',[1,0,1]],
  ['DF','KU',[0,-1,1]], ['BR','NT',[1,0,-1]], ['DR','OV',[1,-1,0]], ['DB','SW',[0,-1,-1]],
];
const makeGroups = rows => Object.freeze(rows.map(([name,letters,position]) => Object.freeze({name,letters,position:Object.freeze(position)})));
export const CORNERS = makeGroups(rawCorners);
export const EDGES = makeGroups(rawEdges);
export const CORNER_BREAKS = 'PCLTHFN';
export const EDGE_BREAKS = 'ACLJTRBDVXW';
const kindOf = kind => kind === 'corner' || kind === 'corners' || kind === 'twist' ? 'corners' : 'edges';
const groupsFor = kind => kindOf(kind) === 'corners' ? CORNERS : EDGES;
const canonicalPiece = name => String(name).split('').sort().join('');
export function pieceInfo(piece,kind='corners') {
  return groupsFor(kind).find(g => canonicalPiece(g.name) === canonicalPiece(piece));
}
export function stickerInfo(letter,kind='corners') {
  const group = groupsFor(kind).find(g=>g.letters.includes(letter));
  if (!group) throw new Error(`Unknown ${kind} sticker ${letter}`);
  const face = ['U','L','F','R','B','D'][Math.floor(LETTERS.indexOf(letter)/4)];
  return {letter,face,normal:NORMALS[face],position:group.position,piece:group.name,group};
}
const bufferLetter = kind => kindOf(kind) === 'corners' ? 'A' : 'U';
const samePiece = (a,b,kind) => stickerInfo(a,kind).group === stickerInfo(b,kind).group;
export function eligiblePair(pair,scope='all') {
  if (!/^[A-X]{2}$/.test(pair)) return false;
  if (scope === 'all') return true;
  const valid = kind => {
    const buffer = stickerInfo(bufferLetter(kind),kind).group;
    const a=stickerInfo(pair[0],kind).group,b=stickerInfo(pair[1],kind).group;
    return a!==buffer && b!==buffer && (pair[0]===pair[1] || a!==b);
  };
  return scope === 'both' ? valid('corners') || valid('edges') : valid(scope);
}
export function equivalentPairs(item) {
  const kind = kindOf(item.kind),group=pieceInfo(item.piece,kind);
  if (!group) return [];
  const a=[...group.letters];
  if(kind==='edges') return [a.join(''),a.reverse().join('')];
  const shift=item.direction==='CW'?1:2;
  return a.map((letter,i)=>letter+a[(i+shift)%3]);
}
export const solvedState = () => ({corners:[...LETTERS],edges:[...LETTERS]});
const key = (p,n) => p.join(',')+'/'+n.join(',');
function rotate(v,axis,sign) {
  const [x,y,z]=v;
  return axis===0?[x,-sign*z,sign*y]:axis===1?[sign*z,y,-sign*x]:[-sign*y,sign*x,z];
}
const SPECS={U:[1,1,-1],D:[1,-1,1],R:[0,1,-1],L:[0,-1,1],F:[2,1,-1],B:[2,-1,1],M:[0,0,1],E:[1,0,1],S:[2,0,-1]};
const PERMUTATIONS={};
for(const kind of ['corners','edges']) {
  const stickers=[...LETTERS].map(l=>stickerInfo(l,kind));
  const index=new Map(stickers.map((s,i)=>[key(s.position,s.normal),i]));
  PERMUTATIONS[kind]=Object.fromEntries(Object.entries(SPECS).map(([face,[axis,layer,sign]])=>[face,stickers.map((s,i)=>s.position[axis]!==layer?i:index.get(key(rotate(s.position,axis,sign),rotate(s.normal,axis,sign))))]));
}
/** Face and middle-slice turns, with standard ASCII or typographic prime marks. */
export function applyAlg(state,algorithm='') {
  const output={corners:state.corners.slice(),edges:state.edges.slice()};
  const source=String(algorithm).replace(/[’′]/g,"'").trim();
  if(!source) return output;
  for(const token of source.split(/\s+/)) {
    const match=token.match(/^([URFDLBMES])(2'?|')?$/);
    if(!match) throw new Error(`Unsupported 3×3 move: ${token}`);
    const turns=match[2]?.includes('2')?2:match[2]==="'"?3:1;
    for(let n=0;n<turns;n++) for(const kind of ['corners','edges']) {
      const old=output[kind],next=Array(24),perm=PERMUTATIONS[kind][match[1]];
      for(let i=0;i<24;i++) next[perm[i]]=old[i];
      output[kind]=next;
    }
  }
  return output;
}
const at = (state,letter) => state[LETTERS.indexOf(letter)];
const put = (state,letter,value) => {state[LETTERS.indexOf(letter)]=value;};
/** An oriented buffer-target exchange. The corner ordering preserves chirality. */
export function swapTarget(stickers,target,kind='corners') {
  kind=kindOf(kind);
  const buffer=bufferLetter(kind),bg=stickerInfo(buffer,kind).group,tg=stickerInfo(target,kind).group;
  if(bg===tg) throw new Error('A buffer sticker cannot be a memo target.');
  const b0=bg.letters.indexOf(buffer),t0=tg.letters.indexOf(target),n=bg.letters.length;
  const next=stickers.slice();
  for(let i=0;i<n;i++) {
    const b=bg.letters[(b0+i)%n],t=tg.letters[(t0+i)%n];
    put(next,b,at(stickers,t)); put(next,t,at(stickers,b));
  }
  return next;
}
function orientationSpecial(stickers,group,kind) {
  if(!group.letters.split('').every(l=>samePiece(at(stickers,l),l,kind))) return null;
  if(group.letters.split('').every(l=>at(stickers,l)===l)) return null;
  if(kind==='edges') return {kind:'flip',piece:group.name,letter:group.letters[0]};
  // [b,c,a] is a CCW displacement and therefore requires CW to solve.
  const shift=group.letters.indexOf(at(stickers,group.letters[0]));
  return {kind:'twist',piece:group.name,letter:group.letters[0],direction:shift===1?'CW':'CCW'};
}
export function traceMemo(state,kind='corners') {
  kind=kindOf(kind);
  let stickers=(Array.isArray(state)?state:state[kind]).slice();
  const buffer=bufferLetter(kind),bg=stickerInfo(buffer,kind).group,steps=[];
  const breaks=kind==='corners'?CORNER_BREAKS:EDGE_BREAKS;
  for(let safety=0;safety<80;safety++) {
    let letter=at(stickers,buffer),loopBreak=false;
    if(samePiece(letter,buffer,kind)) {
      // In-place twists/flips are memorised separately rather than expanded into targets.
      letter=[...breaks].find(l=>!samePiece(at(stickers,l),l,kind));
      if(!letter) break;
      loopBreak=true;
    }
    steps.push({letter,kind,loopBreak});
    stickers=swapTarget(stickers,letter,kind);
    if(safety===79) throw new Error('Memo tracing did not converge.');
  }
  const specials=groupsFor(kind).filter(g=>g!==bg).map(g=>orientationSpecial(stickers,g,kind)).filter(Boolean);
  const letters=steps.map(s=>s.letter).join('');
  const memoLetters=letters.length%2?letters+letters.at(-1):letters;
  return {letters,steps,specials,parity:letters.length%2===1,memoLetters,memoPairs:memoLetters.match(/.{2}/g)||[]};
}
export function randomScramble(random=Math.random,length=25) {
  const faces='URFDLB',suffix=['','2',"'"],moves=[];
  let previous='';
  for(let i=0;i<length;i++) {
    const options=[...faces].filter(f=>f!==previous);
    const face=options[Math.min(options.length-1,Math.floor(random()*options.length))];
    moves.push(face+suffix[Math.min(2,Math.floor(random()*3))]);previous=face;
  }
  return moves.join(' ');
}
export function generateMemo({scope='both',random=Math.random,scramble}={}) {
  scramble=scramble??randomScramble(random);
  const state=applyAlg(solvedState(),scramble),corners=traceMemo(state,'corners'),edges=traceMemo(state,'edges');
  return {scope,scramble,state,corners,edges,parity:corners.parity};
}
/** Verification helper: replay targets, then solve orientations against the buffer. */
export function replayMemo(state,memo) {
  const output={corners:state.corners.slice(),edges:state.edges.slice()};
  for(const kind of ['corners','edges']) {
    const record=memo[kind];
    for(const letter of record.letters) output[kind]=swapTarget(output[kind],letter,kind);
    const bg=stickerInfo(bufferLetter(kind),kind).group,n=bg.letters.length;
    for(const item of record.specials) {
      const group=pieceInfo(item.piece,kind),shift=kind==='edges'?1:item.direction==='CW'?1:2;
      const old=bg.letters.split('').map(l=>at(output[kind],l));
      // Removing a nonbuffer displacement transfers the same displacement to the buffer.
      bg.letters.split('').forEach((l,i)=>put(output[kind],l,old[(i+shift)%n]));
      group.letters.split('').forEach(l=>put(output[kind],l,l));
    }
  }
  return output;
}
