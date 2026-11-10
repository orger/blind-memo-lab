import test from 'node:test';
import assert from 'node:assert/strict';
import { PAIRS, SPECIALS } from '../app/blind/data.js';
import { parseMemoChoices, makeMemoTemplate, MAX_CHOICES_BYTES } from '../app/blind/choices.js';

test('JSON maps, wrappers and rows normalize pairs and stable orientation IDs', () => {
  const expected = { 'pair:AB': 'invented cloud', 'flip:UL': 'invented waterfall', 'twist:DBL:CW': 'invented spiral' };
  assert.deepEqual(parseMemoChoices(JSON.stringify({ ab: ' invented cloud ', 'flip:ul': 'invented waterfall', 'TWIST:DBL:CW': 'invented spiral' })), expected);
  assert.deepEqual(parseMemoChoices(JSON.stringify({ memos: { AB: 'invented cloud', 'flip:UL': 'invented waterfall', 'twist:DBL:CW': 'invented spiral' } })), expected);
  assert.deepEqual(parseMemoChoices(JSON.stringify([{ pair: 'AB', memo: 'invented cloud' }, { id: 'flip:UL', memo: 'invented waterfall' }, { id: 'twist:DBL:CW', memo: 'invented spiral' }])), expected);
  assert.deepEqual(parseMemoChoices('[{"pair":"ab","id":"pair:AB","memo":"made up"}]'), { 'pair:AB': 'made up' });
});

test('CSV handles headers, quoted commas, multiline fields, escaped quotes, CRLF and a BOM', () => {
  const csv = '\uFEFFpair,memo\r\nAB,"invented cloud, with rain"\r\nAC,"invented\nlantern"\r\nflip:UL,"say ""hello"""\r\n';
  assert.deepEqual(parseMemoChoices(csv, { filename: 'own-memos.CSV' }), {
    'pair:AB': 'invented cloud, with rain', 'pair:AC': 'invented\nlantern', 'flip:UL': 'say "hello"',
  });
  assert.deepEqual(parseMemoChoices('AB,one\rAC,two'), { 'pair:AB': 'one', 'pair:AC': 'two' });
  assert.deepEqual(parseMemoChoices('id,memo\n\nAB,one\nAC,\n'), { 'pair:AB': 'one' });
  assert.deepEqual(parseMemoChoices('AB,"comma, then ""quotes"""'), { 'pair:AB': 'comma, then "quotes"' });
});

test('duplicates and conflicting aliases fail atomically, including duplicate JSON properties', () => {
  for (const text of [
    '{"AB":"first","AB":"second"}',
    '{"AB":"first","\\u0041B":"second"}',
    '{"AB":"first","pair:AB":"second"}',
    '{"memos":{"AB":"first","AB":"second"}}',
    '[{"pair":"AB","memo":"first"},{"id":"pair:AB","memo":"second"}]',
    'AB,first\nab,second',
    'AB,\npair:AB,second',
  ]) assert.throws(() => parseMemoChoices(text), /Duplicate/);
  assert.throws(() => parseMemoChoices('[{"pair":"AB","id":"pair:AC","memo":"one"}]'), /conflicting/);
  assert.deepEqual(parseMemoChoices('{"AB":"a colon: and braces { with escaped \\" quote"}'), { 'pair:AB': 'a colon: and braces { with escaped " quote' });
});

test('unknown cards, malformed rows, nontext values and excess columns are rejected', () => {
  for (const text of ['{"YZ":"one"}', '{"flip:ZZ":"one"}', '{"AB":null}', '{"AB":42}', '[{"pair":"AB"}]', '["AB"]', '{"memos":[]}']) {
    assert.throws(() => parseMemoChoices(text));
  }
  for (const text of ['AB,one,extra', 'pair,memo,extra\nAB,one', 'AB,"open', 'AB,"closed"extra', 'AB,bad"quote']) {
    assert.throws(() => parseMemoChoices(text), /CSV|quote|quoted/);
  }
  assert.throws(() => parseMemoChoices('{broken', { filename: 'choices.json' }), /JSON/);
  assert.throws(() => parseMemoChoices('AB,one', { filename: 'choices.json' }), /JSON/);
});

test('blank choices are ignored, a wholly empty file fails, and the template has no private text', () => {
  const template = makeMemoTemplate();
  assert.equal(Object.keys(template.memos).length, 601);
  for (const card of [...PAIRS, ...SPECIALS]) assert.equal(template.memos[card.pair ?? card.id], '');
  assert.throws(() => parseMemoChoices(JSON.stringify(template)), /nonempty/);
  template.memos.AB = 'new invented image';
  assert.deepEqual(parseMemoChoices(JSON.stringify(template)), { 'pair:AB': 'new invented image' });
  assert.throws(() => parseMemoChoices(''), /nonempty/);
  assert.throws(() => parseMemoChoices('pair,memo\nAB,   '), /nonempty/);
  assert.deepEqual(parseMemoChoices('{"AB":"  ","AC":" kept "}'), { 'pair:AC': 'kept' });
});

test('length and UTF-8 byte limits are enforced before any choices can be applied', () => {
  assert.equal(parseMemoChoices(JSON.stringify({ AB: 'x'.repeat(4000) }))['pair:AB'].length, 4000);
  assert.throws(() => parseMemoChoices(JSON.stringify({ AB: 'x'.repeat(4001) })), /4,000/);
  assert.throws(() => parseMemoChoices(' '.repeat(MAX_CHOICES_BYTES + 1)), /2 MB/);
  assert.throws(() => parseMemoChoices('é'.repeat(MAX_CHOICES_BYTES / 2 + 1)), /2 MB/);
  assert.throws(() => parseMemoChoices(null), /must be text/);
});
