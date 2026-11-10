import test from 'node:test';
import assert from 'node:assert/strict';
import {LETTERS,CORNERS,EDGES,stickerInfo,pieceInfo,solvedState,applyAlg,traceMemo,generateMemo,replayMemo,swapTarget,equivalentPairs,eligiblePair} from '../app/blind/cube.js';
import {renderPiece,renderSpecial} from '../app/blind/cube-view.js';

function seeded(seed=81) {return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const value=(state,letter)=>state[LETTERS.indexOf(letter)];
const set=(state,letter,v)=>{state[LETTERS.indexOf(letter)]=v;};
function rotatePiece(state,piece,shift,kind) {
  const group=pieceInfo(piece,kind),old=[...group.letters].map(l=>value(state[kind],l));
  [...group.letters].forEach((l,i)=>set(state[kind],l,old[(i+shift)%old.length]));
}

test('Speffz positions, buffers and cube frame match the requested scheme',()=>{
  assert.equal(stickerInfo('A','corners').piece,'UBL');
  assert.equal(stickerInfo('U','edges').piece,'DF');
  assert.equal(stickerInfo('U','corners').piece,'DFL');
  assert.deepEqual(stickerInfo('M','corners').normal,[1,0,0]);
  assert.equal(pieceInfo('RDF','corners').name,'DFR');
  for(const [kind,groups] of [['corners',CORNERS],['edges',EDGES]]) {
    assert.equal(groups.map(g=>g.letters).join('').split('').sort().join(''),LETTERS);
    for(const letter of LETTERS) assert.equal(stickerInfo(letter,kind).letter,letter);
  }
});

test('all face and slice turns invert exactly, with four quarter turns restoring state',()=>{
  const solved=solvedState();
  for(const face of 'URFDLBMES') {
    assert.deepEqual(applyAlg(solved,`${face} ${face}'`),solved);
    assert.deepEqual(applyAlg(solved,`${face} ${face} ${face} ${face}`),solved);
    assert.deepEqual(applyAlg(solved,`${face}2 ${face}2`),solved);
  }
  const u=applyAlg(solved,'U');
  assert.equal(value(u.corners,'B'),'A');
  assert.equal(value(u.edges,'B'),'A');
  assert.throws(()=>applyAlg(solved,'arbitrary text'));
});

test('all eligible nonbuffer sticker exchanges are involutions',()=>{
  for(const kind of ['corners','edges']) for(const letter of LETTERS) {
    const buffer=stickerInfo(kind==='corners'?'A':'U',kind).group;
    if(stickerInfo(letter,kind).group===buffer) continue;
    const original=solvedState()[kind];
    assert.deepEqual(swapTarget(swapTarget(original,letter,kind),letter,kind),original);
  }
});

test('cycle breaks follow the exact preferences and an odd final memo is doubled',()=>{
  const state=solvedState();
  // A cycle not touching the buffer: buffer→P→C→P yields the P/C exchange.
  for(const target of 'PCP') state.corners=swapTarget(state.corners,target,'corners');
  const trace=traceMemo(state,'corners');
  assert.equal(trace.letters,'PCP');
  assert.equal(trace.steps[0].loopBreak,true);
  assert.equal(trace.memoLetters,'PCPP');
  assert.deepEqual(trace.memoPairs,['PC','PP']);
  assert.equal(trace.parity,true);
  const edges=solvedState();
  for(const target of 'ACA') edges.edges=swapTarget(edges.edges,target,'edges');
  assert.equal(traceMemo(edges,'edges').letters,'ACA');
});

test('corners CW denotes the direction to solve and all three aliases solve that piece',()=>{
  // Independent sticker-pair sign checks for four orientation cases.
  for(const [piece,direction,pair] of [['DBL','CW','SH'],['DBL','CCW','SX'],['UFL','CW','FD'],['UFL','CCW','FI']]) {
    assert.ok(equivalentPairs({kind:'twist',piece,direction}).includes(pair));
  }
  for(const direction of ['CW','CCW']) for(const group of CORNERS.filter(g=>g.name!=='UBL')) {
    const state=solvedState(),shift=direction==='CW'?1:2;
    rotatePiece(state,group.name,shift,'corners');rotatePiece(state,'UBL',3-shift,'corners');
    const trace=traceMemo(state,'corners');
    assert.equal(trace.letters,'');
    assert.equal(trace.specials.length,1);
    assert.equal(trace.specials[0].direction,direction);
    for(const pair of equivalentPairs({kind:'twist',piece:group.name,direction})) {
      let result=state.corners;
      for(const l of pair) result=swapTarget(result,l,'corners');
      for(const l of group.letters) assert.equal(value(result,l),l,`${group.name} ${direction} ${pair}`);
    }
    assert.deepEqual(replayMemo(state,{corners:trace,edges:traceMemo(state,'edges')}),solvedState());
  }
});

test('flips have two equivalent memo choices and buffer compensation remains implicit',()=>{
  for(const group of EDGES.filter(g=>g.name!=='DF')) {
    const state=solvedState();rotatePiece(state,group.name,1,'edges');rotatePiece(state,'DF',1,'edges');
    const trace=traceMemo(state,'edges');
    assert.equal(trace.letters,'');assert.equal(trace.specials.length,1);
    assert.equal(trace.specials[0].kind,'flip');
    assert.deepEqual(equivalentPairs({kind:'flip',piece:group.name}),[group.letters,[...group.letters].reverse().join('')]);
    assert.deepEqual(replayMemo(state,{corners:traceMemo(state,'corners'),edges:trace}),solvedState());
  }
});

test('1,200 legal scrambles trace and replay, preserving permutation parity',()=>{
  const random=seeded();
  let orientationCases=0,loopBreaks=0,oddCases=0;
  for(let i=0;i<1200;i++) {
    const memo=generateMemo({random});
    assert.equal(memo.corners.parity,memo.edges.parity,`Parity mismatch for ${memo.scramble}`);
    assert.deepEqual(replayMemo(memo.state,memo),solvedState(),memo.scramble);
    for(const kind of ['corners','edges']) {
      const buffer=stickerInfo(kind==='corners'?'A':'U',kind).group;
      for(const step of memo[kind].steps) assert.notEqual(stickerInfo(step.letter,kind).group,buffer);
      orientationCases+=memo[kind].specials.length;
      loopBreaks+=memo[kind].steps.filter(s=>s.loopBreak).length;
    }
    oddCases+=Number(memo.parity);
  }
  assert.ok(orientationCases>50);assert.ok(loopBreaks>100);assert.ok(oddCases>400);
});

test('pair eligibility removes all buffer stickers and same-piece pairs, retaining parity doubles',()=>{
  assert.equal(eligiblePair('AB','corners'),false);
  assert.equal(eligiblePair('ER','corners'),false);
  assert.equal(eligiblePair('CM','corners'),false);
  assert.equal(eligiblePair('CC','corners'),true);
  assert.equal(eligiblePair('KU','edges'),false);
  assert.equal(eligiblePair('AQ','edges'),false);
  assert.equal(eligiblePair('AA','edges'),true);
  assert.equal(eligiblePair('AX','all'),true);
  assert.equal(eligiblePair('ZZ','all'),false);
});

test('piece and transparent skeleton SVGs show physical colors without leaking answers',()=>{
  for(const kind of ['corners','edges']) for(const letter of LETTERS) {
    const svg=renderPiece(letter,{kind,hideLetter:true});
    assert.ok(svg.includes('role="img"'));assert.ok(svg.includes('<circle'));
    assert.ok(!svg.includes('<text'));
    assert.ok(!svg.includes(`aria-label="${letter}:`));
  }
  const cw=renderSpecial({kind:'twist',piece:'DBL',direction:'CW'}),ccw=renderSpecial({kind:'twist',piece:'DBL',direction:'CCW'});
  assert.notEqual(cw,ccw);
  for(const svg of [cw,ccw,renderSpecial({kind:'flip',piece:'BL'})]) {
    assert.ok(svg.includes('White up · Green front'));
    assert.ok(svg.includes('stroke-dasharray'));
    assert.ok(!svg.includes('CW'));assert.ok(!svg.includes('DBL'));
  }
});
