import test from 'node:test';
import assert from 'node:assert/strict';
import {lettersAnswerMatches,specialAnswerMatches} from '../app/blind/answers.js';
import {CORNERS,EDGES,equivalentPairs} from '../app/blind/cube.js';

const twist=(piece,direction)=>({kind:'twist',piece,direction});
const flip=piece=>({kind:'flip',piece});

test('target answers accept case, spacing, punctuation and only the final parity double',()=>{
  for(const answer of ['ABCD','ab cd','AB, CD','A-B / C.D']) assert.equal(lettersAnswerMatches('ABCD',answer),true,answer);
  assert.equal(lettersAnswerMatches('ABCDE','AB CD E'),true);
  assert.equal(lettersAnswerMatches('ABCDE','AB CD EE'),true);
  assert.equal(lettersAnswerMatches('A','AA'),true);
  assert.equal(lettersAnswerMatches('',''),true);
  assert.equal(lettersAnswerMatches('',' , ;\n'),true);
  for(const answer of ['ABCD EXTRA','ABCDZ','AB C','ABCDDD','ABCDé','ABCD1','ABCDΣ']) assert.equal(lettersAnswerMatches('ABCD',answer),false,answer);
  assert.equal(lettersAnswerMatches('ABCDE','AB CDEEE'),false);
  assert.equal(lettersAnswerMatches('ABCD','ABCCDD'),false);
  assert.equal(lettersAnswerMatches('','A'),false);
});

test('all three corner twist aliases and all face-order names match their solving direction',()=>{
  for(const group of CORNERS) for(const direction of ['CW','CCW']) {
    const item=twist(group.name,direction);
    for(const pair of equivalentPairs(item)) assert.equal(specialAnswerMatches([item],pair),true,`${group.name} ${direction} ${pair}`);
    for(const name of [group.name,[...group.name].reverse().join(''),group.name.slice(1)+group.name[0]]) {
      assert.equal(specialAnswerMatches([item],`${name} ${direction}`),true);
      assert.equal(specialAnswerMatches([item],`${name}${direction}`),true);
    }
    const wrong=direction==='CW'?'CCW':'CW';
    assert.equal(specialAnswerMatches([item],`${group.name} ${wrong}`),false);
    assert.equal(specialAnswerMatches([item],group.name),false);
  }
});

test('all flipped edge aliases and both physical face orders match',()=>{
  for(const group of EDGES) {
    const item=flip(group.name);
    for(const alias of [...equivalentPairs(item),group.name,[...group.name].reverse().join('')]) {
      assert.equal(specialAnswerMatches([item],alias),true,`${group.name} ${alias}`);
    }
    assert.equal(specialAnswerMatches([item],`${group.name} CW`),false);
  }
});

test('multiple orientation cases accept every specified separator and any order',()=>{
  const corners=[twist('DBL','CW'),twist('UFR','CCW')];
  for(const separator of [',',';','\n',' ','  ,;\n ']) {
    assert.equal(specialAnswerMatches(corners,`DBL CW${separator}UFR CCW`),true);
    assert.equal(specialAnswerMatches(corners,`JM${separator}SH`),true);
    assert.equal(specialAnswerMatches(corners,`DBL CW${separator}JM`),true);
  }
  assert.equal(specialAnswerMatches([flip('UL'),flip('FR')],'UL FR'),true);
  assert.equal(specialAnswerMatches([flip('UL'),flip('FR')],'pj, ed'),true);
});

test('contradictory directions, extras, duplicates and missing fixes are rejected',()=>{
  const item=twist('UFR','CCW');
  for(const answer of ['UFR CW CCW','UFR CCW CW','UFR CCW CCW','UFR CCW extra','UFR CCW;','UFR CCW, CCW']) {
    // A trailing separator is harmless; all actual extra tokens must fail.
    assert.equal(specialAnswerMatches([item],answer),answer==='UFR CCW;',answer);
  }
  for(const answer of ['', 'UFR', 'CW', 'CCW', 'UUD CCW', 'SH', 'JM JM', 'JM MC', 'UFR CCW, RFU CCW', 'UFR CCW !!!']) {
    assert.equal(specialAnswerMatches([item],answer),false,answer);
  }
  assert.equal(specialAnswerMatches([flip('UL'),flip('FR')],'DE ED'),false);
  assert.equal(specialAnswerMatches([flip('UL'),flip('FR')],'UL'),false);
  assert.equal(specialAnswerMatches([flip('UL'),flip('FR')],'UL FR DB'),false);
  assert.equal(specialAnswerMatches([item,item],'JM MC'),false);
});

test('mixed flip and twist aliases are matched as a whole when face names overlap',()=>{
  const items=[twist('DFL','CW'),flip('UL')];
  assert.equal(specialAnswerMatches(items,'LU DE'),true);
  assert.equal(specialAnswerMatches(items,'UL LU'),true);
  assert.equal(specialAnswerMatches(items,'LU LU'),false);
  assert.equal(specialAnswerMatches(items,'DE ED'),false);
});

test('empty orientation rows require empty answers and invalid expected cases fail safely',()=>{
  assert.equal(specialAnswerMatches([],''),true);
  assert.equal(specialAnswerMatches([],' , ;\n'),true);
  assert.equal(specialAnswerMatches([],'SH'),false);
  assert.equal(specialAnswerMatches([twist('UFR','wrong')],'UFR CW'),false);
  assert.equal(specialAnswerMatches([flip('ZZ')],'ZZ'),false);
  assert.equal(specialAnswerMatches(null,''),false);
});
