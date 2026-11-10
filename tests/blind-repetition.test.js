import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PAIRS, SPECIALS } from '../app/blind/data.js';
import { APP_ID, STORAGE_KEY, defaultState, normalizeState, normalizeRecord, makeCards, cardMemo,
  priority, chooseCard, rateRecord, recordAnswer, updateMemo, createBackup, parseBackup,
  loadState, saveState, setDefaultMemos, clearDefaultMemos, hasDefaultMemos, importMemoChoices } from '../app/blind/repetition.js';

beforeEach(() => clearDefaultMemos());
afterEach(() => clearDefaultMemos());

test('public metadata contains every pair and orientation case without private memo text', () => {
  assert.equal(PAIRS.length, 576);
  assert.equal(new Set(PAIRS.map(card => card.pair)).size, 576);
  for (const first of 'ABCDEFGHIJKLMNOPQRSTUVWX') for (const second of 'ABCDEFGHIJKLMNOPQRSTUVWX') {
    const card = PAIRS.find(item => item.pair === first + second);
    assert.ok(card && card.source);
  }
  assert.equal(PAIRS.filter(card => card.pair[0] === card.pair[1]).length, 24);
  assert.equal(SPECIALS.filter(card => card.kind === 'flip').length, 11);
  assert.equal(SPECIALS.filter(card => card.kind === 'twist').length, 14);
  assert.ok(!SPECIALS.some(card => ['UBL', 'DF'].includes(card.piece)));
  for (const card of [...PAIRS, ...SPECIALS]) {
    assert.equal(card.memo, '');
    assert.ok(!Object.hasOwn(card, 'sourceMemo'));
    assert.ok(Object.keys(card).every(key => ['id', 'pair', 'kind', 'memo', 'source', 'piece', 'direction'].includes(key)));
  }
  assert.equal(makeCards().length, 601);
});

test('fast Good lowers weight and extends spacing more than slow Good; failures raise weight', () => {
  const initial = normalizeRecord();
  const fast = rateRecord(initial, { rating: 'good', seconds: 1, now: 1000, targetSeconds: 3 });
  const slow = rateRecord(initial, { rating: 'good', seconds: 12, now: 1000, targetSeconds: 3 });
  assert.ok(fast.weight < slow.weight && slow.weight < initial.weight);
  assert.ok(fast.interval > slow.interval && slow.interval > initial.interval);
  const wrong = rateRecord(fast, { rating: 'wrong', seconds: 2, now: 2000 });
  const change = rateRecord(fast, { rating: 'change', seconds: 2, now: 2000 });
  assert.ok(wrong.weight > fast.weight && wrong.interval < fast.interval);
  assert.equal(wrong.weight, change.weight);
  assert.equal(wrong.streak, 0);
  assert.equal(wrong.attempts, 2);
  assert.equal(wrong.lapses, 1);
  assert.equal(wrong.good, 1);
  assert.equal(wrong.meanSeconds, 1.5);
  assert.throws(() => rateRecord(initial, { rating: 'good', seconds: NaN }), /Reaction/);
  assert.throws(() => rateRecord(initial, { rating: 'other', seconds: 1 }), /Choose/);
});

test('elapsed time raises effective weight, overdue cards rise, and immediate repeats are excluded', () => {
  const card = PAIRS[0];
  const record = rateRecord(null, { rating: 'good', seconds: 1, now: 1000 });
  assert.ok(priority(card, record, 1000) < priority(card, record, 1000 + record.interval));
  assert.ok(priority(card, record, 1000 + record.interval) < priority(card, record, 1000 + 5 * record.interval));
  const cards = PAIRS.slice(0, 2);
  assert.equal(chooseCard(cards, {}, { random: () => 0, excludeId: cards[0].id }).id, cards[1].id);
  assert.equal(chooseCard([card], {}, { random: () => 1, excludeId: card.id }).id, card.id);
  assert.equal(chooseCard([], {}), null);
  assert.equal(chooseCard(cards, {}, { random: () => 0 }).id, cards[0].id);
  assert.equal(chooseCard(cards, {}, { random: () => 0.9999 }).id, cards[1].id);
  const records = { [cards[0].id]: { weight: 1, lastSeen: null }, [cards[1].id]: { weight: 100, lastSeen: null } };
  assert.equal(chooseCard(cards, records, { random: () => 0.1 }).id, cards[1].id);
});

test('Change is a failure, keeps a review queue, and does not disappear after a later Good or memo edit', () => {
  const card = PAIRS[1];
  const originalMemo = 'invented copper kite';
  setDefaultMemos({ [card.id]: originalMemo });
  const initial = defaultState();
  let state = recordAnswer(initial, card, { rating: 'change', seconds: 4.1, now: 1000 });
  assert.equal(state.records[card.id].lapses, 1);
  assert.deepEqual(state.changeQueue[card.id], { addedAt: 1000, lastMarkedAt: 1000, count: 1 });
  assert.equal(state.history[0].memo, originalMemo);
  assert.deepEqual(initial.history, []);
  state = recordAnswer(state, card, { rating: 'change', seconds: 3, now: 2000 });
  assert.deepEqual(state.changeQueue[card.id], { addedAt: 1000, lastMarkedAt: 2000, count: 2 });
  state = recordAnswer(state, card, { rating: 'good', seconds: 1, now: 3000 });
  state = updateMemo(state, card.id, '  A better personal image  ');
  assert.equal(cardMemo(card, state), 'A better personal image');
  assert.ok(state.changeQueue[card.id]);
  assert.equal(state.history[0].memo, originalMemo);
  const restored = parseBackup(JSON.stringify(createBackup(state)));
  assert.deepEqual(restored, state);
  state = updateMemo(state, card.id, '', { resolveChange: true });
  assert.equal(cardMemo(card, state), '');
  assert.ok(!state.changeQueue[card.id]);
});

test('older backups gain defaults while settings, histories, memos, and change queue survive', () => {
  const old = { app: APP_ID, version: 0, settings: { presentation: 'pieces', futureFlag: true, scope: 'edges' },
    memos: { 'pair:AB': 'my memo' }, records: { 'pair:AB': { weight: 5, lastSeen: 10, attempts: 2 } },
    changeQueue: ['pair:AB'], history: [], memoHistory: [{ id: 'memo-1', scope: 'both', seconds: 10.2,
      corners: 'AB', edges: 'CD', answer: { corners: 'AB', edges: 'CD' }, correct: true }] };
  const state = parseBackup(old);
  assert.equal(state.version, 1);
  assert.equal(state.settings.mode, 'recall');
  assert.equal(state.settings.memoScope, 'both');
  assert.equal(state.settings.includeSpecials, true);
  assert.equal(state.settings.presentation, 'pieces');
  assert.equal(state.settings.scope, 'edges');
  assert.equal(state.settings.futureFlag, true);
  assert.equal(state.memos['pair:AB'], 'my memo');
  assert.equal(state.records['pair:AB'].weight, 5);
  assert.equal(state.records['pair:AB'].interval, 60_000);
  assert.equal(state.changeQueue['pair:AB'].count, 1);
  assert.deepEqual(state.memoHistory, old.memoHistory);
  assert.deepEqual(normalizeState(null), defaultState());
  assert.throws(() => parseBackup({ version: 3, attempts: [] }), /Blind Memo Lab backup/);
  assert.throws(() => parseBackup({ app: APP_ID, version: 100 }), /newer/);
  const damaged = normalizeState({ app: APP_ID, settings: { targetSeconds: -2, scope: 'invalid', onlyChanges: 'yes' },
    memos: { bad: 'no', 'pair:AB': 'yes' }, records: { 'pair:AB': { weight: NaN, interval: -2 } } });
  assert.equal(damaged.settings.targetSeconds, 3);
  assert.equal(damaged.settings.scope, 'all');
  assert.equal(damaged.settings.onlyChanges, false);
  assert.deepEqual(damaged.memos, { 'pair:AB': 'yes' });
  assert.equal(damaged.records['pair:AB'].weight, 1);
});

test('a changed memo becomes due without rewriting its real test time or historical answers', () => {
  const card = PAIRS[1];
  const originalMemo = 'invented silver umbrella';
  setDefaultMemos({ [card.id]: originalMemo });
  let state = recordAnswer(defaultState(), card, { rating: 'good', seconds: 1, now: 1000 });
  state = recordAnswer(state, card, { rating: 'good', seconds: 1, now: 2000 });
  const originalRecord = structuredClone(state.records[card.id]);
  const originalHistory = structuredClone(state.history);
  const unchanged = updateMemo(state, card.id, originalMemo, { now: 2001 });
  assert.deepEqual(unchanged.records[card.id], originalRecord);
  const changed = updateMemo(state, card.id, 'a new image', { now: 2001 });
  assert.ok(changed.records[card.id].weight >= 1);
  assert.ok(changed.records[card.id].interval <= 60_000);
  assert.equal(changed.records[card.id].lastSeen, 2000);
  assert.equal(changed.records[card.id].memoChangedAt, 2001);
  assert.ok(priority(card, changed.records[card.id], 2001) > priority(card, originalRecord, 2001));
  assert.deepEqual(changed.history, originalHistory);
  assert.equal(changed.history[0].memo, originalMemo);
  const repeated = updateMemo(changed, card.id, 'a new image', { now: 2002 });
  assert.deepEqual(repeated.records[card.id], changed.records[card.id]);
  const reviewed = recordAnswer(changed, card, { rating: 'good', seconds: 1, now: 3000 });
  assert.equal(reviewed.records[card.id].memoChangedAt, null);
  assert.equal(reviewed.history.at(-1).memo, 'a new image');
  const untested = updateMemo(defaultState(), card.id, 'another image');
  assert.ok(!untested.records[card.id], 'Editing an unseen card must not count it as practised');
});

test('unlocked defaults stay in session memory and are never copied into state, ordinary backups, or saved preferences', async () => {
  const card = PAIRS[1], sentinel = 'invented private lunar lantern';
  const state = defaultState();
  assert.equal(hasDefaultMemos(), false);
  assert.equal(cardMemo(card, state), '');
  setDefaultMemos({ [card.id]: sentinel });
  assert.equal(hasDefaultMemos(), true);
  assert.equal(cardMemo(card, state), sentinel);
  assert.equal(card.memo, '');
  assert.deepEqual(state.memos, {});
  assert.ok(!JSON.stringify(createBackup(state)).includes(sentinel));
  const sanitized = normalizeState({ ...state, password: sentinel, defaultMemos: { [card.id]: sentinel },
    settings: { password: sentinel, vaultKey: sentinel, unlocked: true, futureFlag: true } });
  assert.ok(!JSON.stringify(sanitized).includes(sentinel));
  assert.equal(sanitized.settings.futureFlag, true);
  assert.ok(!Object.hasOwn(sanitized.settings, 'unlocked'));
  let saved;
  await saveState(state, { save: async value => { saved = value; } });
  assert.ok(!JSON.stringify(saved).includes(sentinel));
  const freshModule = await import('../app/blind/repetition.js?fresh-locked-session');
  assert.equal(freshModule.hasDefaultMemos(), false);
  assert.equal(freshModule.cardMemo(card, await freshModule.loadState({ load: async () => saved })), '');
  // A completed review is an explicit local user record, and keeps its image at
  // the time even after the unlock session ends or the choice is later edited.
  const reviewed = recordAnswer(state, card, { rating: 'good', seconds: 1, now: 1000 });
  assert.equal(reviewed.history[0].memo, sentinel);
  assert.equal(parseBackup(createBackup(reviewed)).history[0].memo, sentinel);
  const edited = updateMemo(state, card.id, 'my own invented choice');
  assert.equal(cardMemo(card, edited), 'my own invented choice');
  clearDefaultMemos();
  assert.equal(hasDefaultMemos(), false);
  assert.equal(cardMemo(card, state), '');
  assert.equal(cardMemo(card, edited), 'my own invented choice');
  assert.throws(() => setDefaultMemos({ 'pair:ZZ': 'invalid' }), /known card IDs/);
  assert.throws(() => setDefaultMemos({ [card.id]: 42 }), /known card IDs/);
});

test('visitors can import only known choices without changing supplied session defaults or old answer snapshots', () => {
  const first = PAIRS[0], second = PAIRS[1];
  setDefaultMemos({ [first.id]: 'invented session choice' });
  const state = recordAnswer(defaultState(), first, { rating: 'good', seconds: 1, now: 1000 });
  const imported = importMemoChoices(state, { [first.id]: 'invented visitor choice', [second.id]: 'another visitor choice' });
  assert.equal(cardMemo(first, imported), 'invented visitor choice');
  assert.equal(cardMemo(second, imported), 'another visitor choice');
  assert.equal(cardMemo(first, defaultState()), 'invented session choice');
  assert.equal(imported.history[0].memo, 'invented session choice');
  assert.ok(imported.records[first.id].memoChangedAt !== null);
  assert.deepEqual(state.memos, {});
  assert.throws(() => importMemoChoices(state, { 'flip:ZZ': 'invalid' }), /known card IDs/);
  assert.throws(() => importMemoChoices(state, ['invalid']), /object keyed/);
  assert.throws(() => importMemoChoices(state, { [first.id]: 'x'.repeat(4001) }), /4,000/);
});

test('native persistence saves independent snapshots in order and reports errors without poisoning later saves', async () => {
  let current = null;
  const values = [];
  const bridge = {
    load: async () => current,
    save: async value => { await new Promise(resolve => setTimeout(resolve, 3)); values.push(value); current = value; },
  };
  assert.deepEqual(await loadState(bridge), defaultState());
  const state = defaultState();
  const firstSave = saveState(state, bridge);
  state.memos['pair:AA'] = 'new image';
  const secondSave = saveState(state, bridge);
  await Promise.all([firstSave, secondSave]);
  assert.deepEqual(values[0].memos, {});
  assert.equal(values[1].memos['pair:AA'], 'new image');
  assert.deepEqual(await loadState(bridge), normalizeState(state));
  await assert.rejects(saveState(state, { save: async () => { throw new Error('disk full'); } }), /disk full/);
  await saveState(state, bridge);
  assert.equal(values.length, 3);
});

test('browser persistence uses a separate key, rejects corrupt data, and surfaces quota failure', async () => {
  const originalStorage = globalThis.localStorage;
  const values = new Map([['corner-lab', 'untouched']]);
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  try {
    const state = defaultState();
    state.settings.memoScope = 'corners';
    await saveState(state);
    assert.equal(values.get('corner-lab'), 'untouched');
    assert.equal((await loadState()).settings.memoScope, 'corners');
    values.set(STORAGE_KEY, '{broken');
    await assert.rejects(loadState(), SyntaxError);
    assert.equal(values.get(STORAGE_KEY), '{broken');
    globalThis.localStorage.setItem = () => { throw new Error('quota'); };
    await assert.rejects(saveState(state), /quota/);
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});
