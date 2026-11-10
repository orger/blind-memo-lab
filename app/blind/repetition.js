import { PAIRS, SPECIALS } from './data.js';

export const STORAGE_KEY = 'blind-memo-lab:v1';
export const APP_ID = 'blind-memo-lab';
export const STATE_VERSION = 1;
const minute = 60_000;
const day = 86_400_000;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isFinite(value) && value >= min && value <= max ? value : fallback;
const cardID = value => typeof value === 'string' && /^(pair:[A-X]{2}|flip:[A-Z]{2}|twist:[A-Z]{3}:(CW|CCW))$/.test(value);
const clone = value => JSON.parse(JSON.stringify(value));
const knownCardIDs = new Set([...PAIRS, ...SPECIALS].map(card => card.id));
const cardsByID = new Map([...PAIRS, ...SPECIALS].map(card => [card.id, card]));
const privateSetting = /password|passphrase|unlock|secret|privateDefaults?|defaultMemos|vaultKey/i;
// Decrypted supplied choices belong to this module session only. They are
// deliberately absent from state, local storage, and ordinary state backups.
let sessionDefaults = new Map();

function validatedMemoEntries(memos) {
  if (!object(memos)) throw new Error('Memo choices must be an object keyed by card ID.');
  const entries = Object.entries(memos);
  for (const [id, memo] of entries) {
    if (!knownCardIDs.has(id) || typeof memo !== 'string' || memo.length > 4000) {
      throw new Error('Memo choices need known card IDs and text of up to 4,000 characters.');
    }
  }
  return entries;
}

export function setDefaultMemos(memos) {
  const entries = validatedMemoEntries(memos);
  sessionDefaults = new Map(entries);
}

export function clearDefaultMemos() { sessionDefaults = new Map(); }
export function hasDefaultMemos() { return sessionDefaults.size > 0; }

export function defaultState() {
  return {
    app: APP_ID,
    version: STATE_VERSION,
    settings: { mode: 'recall', scope: 'all', presentation: 'letters', includeSpecials: true,
      targetSeconds: 3, onlyChanges: false, memoScope: 'both' },
    memos: {}, records: {}, changeQueue: {}, history: [], memoHistory: [],
  };
}

export function makeCards() { return [...PAIRS, ...SPECIALS]; }

export function normalizeRecord(raw = {}) {
  const record = object(raw) ? raw : {};
  return {
    weight: finite(record.weight, 1, 0.000001, 1_000_000),
    interval: finite(record.interval, minute, 1000, 365 * day),
    lastSeen: record.lastSeen === null ? null : finite(record.lastSeen, null),
    attempts: Math.floor(finite(record.attempts, 0)),
    good: Math.floor(finite(record.good, 0)),
    lapses: Math.floor(finite(record.lapses, 0)),
    streak: Math.floor(finite(record.streak, 0)),
    lastSeconds: finite(record.lastSeconds, null, 0, day / 1000),
    meanSeconds: finite(record.meanSeconds, null, 0, day / 1000),
    lastRating: ['good', 'wrong', 'change'].includes(record.lastRating) ? record.lastRating : null,
    memoChangedAt: record.memoChangedAt === null ? null : finite(record.memoChangedAt, null),
  };
}

export function normalizeState(raw) {
  if (raw === undefined || raw === null) return defaultState();
  if (!object(raw)) throw new Error('This does not contain valid Blind Memo Lab data.');
  if (raw.app !== undefined && raw.app !== APP_ID) throw new Error('This backup belongs to a different app.');
  if (raw.version !== undefined && (!Number.isInteger(raw.version) || raw.version > STATE_VERSION || raw.version < 0)) {
    throw new Error('This backup needs a newer version of Blind Memo Lab.');
  }
  const result = defaultState();
  const settings = object(raw.settings) ? raw.settings : {};
  // Keep primitive future settings so loading an older backup does not discard
  // independent preferences added by another compatible release.
  for (const [key, value] of Object.entries(settings)) {
    if (/^[a-zA-Z][a-zA-Z0-9]{0,79}$/.test(key) && !privateSetting.test(key) && ['string', 'number', 'boolean'].includes(typeof value)) result.settings[key] = value;
  }
  for (const [key, choices] of Object.entries({mode: ['recall', 'memo'], scope: ['all', 'corners', 'edges', 'both'],
    presentation: ['letters', 'pieces'], memoScope: ['corners', 'edges', 'both']})) {
    result.settings[key] = choices.includes(settings[key]) ? settings[key] : result.settings[key];
    if (!choices.includes(result.settings[key])) result.settings[key] = defaultState().settings[key];
  }
  for (const key of ['includeSpecials', 'onlyChanges']) result.settings[key] = typeof settings[key] === 'boolean' ? settings[key] : defaultState().settings[key];
  result.settings.targetSeconds = finite(settings.targetSeconds, 3, 0.1, 120);
  if (object(raw.memos)) for (const [id, memo] of Object.entries(raw.memos)) {
    if (cardID(id) && typeof memo === 'string') result.memos[id] = memo.slice(0, 4000);
  }
  if (object(raw.records)) for (const [id, record] of Object.entries(raw.records)) {
    if (cardID(id) && object(record)) result.records[id] = normalizeRecord(record);
  }
  // Earlier development backups may contain an array of IDs. Import that form
  // too, retaining the queue until the solver explicitly resolves each item.
  if (Array.isArray(raw.changeQueue)) for (const id of raw.changeQueue) {
    if (cardID(id)) result.changeQueue[id] = { addedAt: 0, lastMarkedAt: 0, count: 1 };
  }
  else if (object(raw.changeQueue)) for (const [id, item] of Object.entries(raw.changeQueue)) {
    if (cardID(id)) result.changeQueue[id] = { addedAt: finite(item?.addedAt, 0),
      lastMarkedAt: finite(item?.lastMarkedAt, 0), count: Math.floor(finite(item?.count, 1, 1)) };
  }
  if (Array.isArray(raw.history)) result.history = raw.history.filter(item => object(item) && cardID(item.cardId) &&
    ['good', 'wrong', 'change'].includes(item.rating) && Number.isFinite(item.seconds) && item.seconds >= 0).map(clone);
  if (Array.isArray(raw.memoHistory)) result.memoHistory = raw.memoHistory.filter(item => object(item)).map(clone);
  return result;
}

export function cardMemo(card, state) {
  return own(state?.memos ?? {}, card.id) ? state.memos[card.id] : sessionDefaults.get(card.id) ?? '';
}

/** Effective sampling weight. Stored difficulty is multiplied by a forgetting
 * factor that rises with elapsed time relative to this item's review interval.
 * Unseen cards retain a useful weight, and recently answered cards remain
 * eligible at a much lower weight until due. */
export function priority(card, record, now = Date.now(), settings = {}) {
  const normalized = normalizeRecord(record);
  if (normalized.lastSeen === null) return normalized.weight * 2;
  // A new image needs a fresh recall even when the previous wording was just
  // tested. Keep the true last-test timestamp intact for history and backups.
  if (normalized.memoChangedAt !== null) return normalized.weight * 2;
  const age = Math.max(0, now - normalized.lastSeen);
  const dueRatio = age / normalized.interval;
  const forgetting = 0.12 + Math.min(20, dueRatio) + Math.min(3, Math.log1p(age / day));
  return normalized.weight * forgetting;
}

export function chooseCard(cards, records = {}, { now = Date.now(), random = Math.random, excludeId = null, settings = {} } = {}) {
  if (!cards.length) return null;
  const alternatives = cards.filter(card => card.id !== excludeId);
  const pool = alternatives.length ? alternatives : cards;
  const weights = pool.map(card => priority(card, records[card.id], now, settings));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const randomValue = Number(random());
  let target = (Number.isFinite(randomValue) ? Math.max(0, Math.min(1 - Number.EPSILON, randomValue)) : 0) * total;
  for (let index = 0; index < pool.length; index++) {
    target -= weights[index];
    if (target < 0) return pool[index];
  }
  return pool[pool.length - 1];
}

export function rateRecord(rawRecord, { rating, seconds, now = Date.now(), targetSeconds = 3 }) {
  if (!['good', 'wrong', 'change'].includes(rating)) throw new Error('Choose Good, Wrong, or Change.');
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > day / 1000) throw new Error('Reaction time must be a valid number of seconds.');
  if (!Number.isFinite(now) || now < 0) throw new Error('Review time must be valid.');
  const record = normalizeRecord(rawRecord);
  const target = finite(targetSeconds, 3, 0.1, 120);
  const speed = Math.max(0.1, seconds / target);
  const success = rating === 'good';
  // Even a slow Good lowers difficulty, but a fast Good lowers it more. Both
  // Wrong and Change immediately increase difficulty and shorten the interval.
  const reduction = 0.46 + 0.38 * (speed / (1 + speed));
  const weight = success ? Math.max(0.000001, record.weight * reduction) : Math.min(1_000_000, record.weight * 1.85 + 0.5);
  const extension = 1.6 + 2.2 / (1 + speed);
  const interval = success ? Math.min(365 * day, Math.max(2 * minute, record.interval * extension)) : 30_000;
  return {
    ...record, weight, interval, lastSeen: now, attempts: record.attempts + 1,
    good: record.good + (success ? 1 : 0), lapses: record.lapses + (success ? 0 : 1),
    streak: success ? record.streak + 1 : 0, lastSeconds: seconds, lastRating: rating,
    meanSeconds: record.meanSeconds === null ? seconds : (record.meanSeconds * record.attempts + seconds) / (record.attempts + 1),
    memoChangedAt: null,
  };
}

const makeID = now => `${now}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

export function recordAnswer(state, card, { rating, seconds, now = Date.now(), presentation, scope }) {
  if (!card || !cardID(card.id)) throw new Error('Choose a valid training item.');
  const result = normalizeState(state);
  result.records[card.id] = rateRecord(result.records[card.id], { rating, seconds, now, targetSeconds: result.settings.targetSeconds });
  result.history.push({ id: makeID(now), cardId: card.id, pair: card.pair ?? null, kind: card.kind,
    createdAt: now, seconds, rating, memo: cardMemo(card, result),
    presentation: presentation ?? result.settings.presentation, scope: scope ?? result.settings.scope });
  if (rating === 'change') {
    const previous = result.changeQueue[card.id];
    result.changeQueue[card.id] = { addedAt: previous?.addedAt ?? now, lastMarkedAt: now, count: (previous?.count ?? 0) + 1 };
  }
  return result;
}

export function updateMemo(state, id, memo, { resolveChange = false, now = Date.now() } = {}) {
  if (!cardID(id) || typeof memo !== 'string' || memo.length > 4000) throw new Error('Enter a valid memo of up to 4,000 characters.');
  const result = normalizeState(state);
  applyMemoChoice(result, id, memo, { resolveChange, now });
  return result;
}

function applyMemoChoice(result, id, memo, { resolveChange = false, now = Date.now() } = {}) {
  const nextMemo = memo.trim();
  const card = cardsByID.get(id);
  const previousMemo = card ? cardMemo(card, result) : result.memos[id] ?? '';
  if (nextMemo !== previousMemo && result.records[id]) {
    result.records[id] = { ...result.records[id], weight: Math.max(1, result.records[id].weight),
      interval: Math.min(minute, result.records[id].interval), streak: 0,
      memoChangedAt: finite(now, Date.now()) };
  }
  result.memos[id] = nextMemo;
  if (resolveChange) delete result.changeQueue[id];
}

export function importMemoChoices(state, memos) {
  const entries = validatedMemoEntries(memos);
  const result = normalizeState(state);
  for (const [id, memo] of entries) applyMemoChoice(result, id, memo);
  return result;
}

export function createBackup(state) {
  return { format: 'blind-memo-lab-backup', version: STATE_VERSION, exportedAt: new Date().toISOString(), state: normalizeState(state) };
}

export function parseBackup(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!object(parsed)) throw new Error('Choose a Blind Memo Lab JSON backup.');
  const candidate = parsed.format === 'blind-memo-lab-backup' ? parsed.state : parsed;
  if (!object(candidate) || candidate.app !== APP_ID) throw new Error('Choose a Blind Memo Lab backup. Corner Lab data belongs to the other trainer.');
  if (parsed.format === 'blind-memo-lab-backup' && parsed.version > STATE_VERSION) throw new Error('This backup needs a newer version of Blind Memo Lab.');
  return normalizeState(candidate);
}

function currentBridge(bridge) { return bridge ?? globalThis.window?.cornerlabNative; }

export async function loadState(bridge) {
  const native = currentBridge(bridge);
  if (native?.load) return normalizeState(await native.load());
  const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
  return raw === null || raw === undefined ? defaultState() : normalizeState(JSON.parse(raw));
}

let saveChain = Promise.resolve();
export function saveState(state, bridge) {
  const native = currentBridge(bridge);
  const snapshot = normalizeState(state);
  // Ordering prevents a slow earlier native save from replacing a newer answer.
  const operation = saveChain.catch(() => {}).then(async () => {
    if (native?.save) await native.save(snapshot);
    else {
      if (!globalThis.localStorage) throw new Error('Local storage is unavailable. Export a backup to keep your progress.');
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    }
    return snapshot;
  });
  saveChain = operation;
  return operation;
}
