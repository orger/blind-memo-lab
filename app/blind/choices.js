import { PAIRS, SPECIALS } from './data.js';

export const MAX_CHOICES_BYTES = 2 * 1024 * 1024;
const cards = [...PAIRS, ...SPECIALS];
const canonicalIDs = new Map(cards.map(card => [card.id.toUpperCase(), card.id]));
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function canonicalID(value) {
  if (typeof value !== 'string') throw new Error('Each memo needs a letter pair or a known card ID.');
  const key = value.trim().toUpperCase();
  const id = canonicalIDs.get(/^[A-X]{2}$/.test(key) ? `PAIR:${key}` : key);
  if (!id) throw new Error(`Unknown memo card: ${value.slice(0, 80)}`);
  return id;
}

// JSON.parse discards an earlier duplicate property. Inspect the valid JSON
// tokens first so a typo cannot silently replace one imported choice with another.
function rejectDuplicateJSONKeys(text) {
  const containers = [];
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '{' || char === '[') containers.push({ type: char, keys: new Set() });
    else if (char === '}' || char === ']') containers.pop();
    else if (char === '"') {
      const start = index;
      for (index++; index < text.length; index++) {
        if (text[index] === '\\') index++;
        else if (text[index] === '"') break;
      }
      let following = index + 1;
      while (/\s/.test(text[following] ?? '') && following < text.length) following++;
      const container = containers.at(-1);
      if (text[following] === ':' && container?.type === '{') {
        const key = JSON.parse(text.slice(start, index + 1));
        if (container.keys.has(key)) throw new Error('Duplicate property in the JSON memo choices.');
        container.keys.add(key);
      }
    }
  }
}

function jsonEntries(text) {
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error('The JSON memo file is not valid.'); }
  rejectDuplicateJSONKeys(text);
  if (isObject(value) && Object.hasOwn(value, 'memos')) {
    if (!isObject(value.memos)) throw new Error('The memos field must contain a map of letter pairs or card IDs to text.');
    value = value.memos;
  }
  if (Array.isArray(value)) return value.map(item => {
    if (!isObject(item)) throw new Error('Every memo row needs a pair or id field and a memo field.');
    const key = item.id ?? item.pair;
    if (item.id !== undefined && item.pair !== undefined && canonicalID(item.id) !== canonicalID(item.pair)) {
      throw new Error('A memo row has conflicting pair and id fields.');
    }
    return [key, item.memo];
  });
  if (isObject(value)) return Object.entries(value);
  throw new Error('Choose a JSON memo map, a memos wrapper, or an array of memo rows.');
}

function csvEntries(text) {
  const rows = [];
  let row = [], field = '', quoted = false, afterQuote = false;
  const endField = () => { row.push(field); field = ''; afterQuote = false; };
  const endRow = () => { endField(); if (row.some(value => value.trim())) rows.push(row); row = []; };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index++; }
        else { quoted = false; afterQuote = true; }
      } else field += char;
      continue;
    }
    if (char === ',') { endField(); continue; }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      endRow(); continue;
    }
    if (afterQuote) {
      if (char !== ' ' && char !== '\t') throw new Error('Unexpected text after a quoted CSV field.');
      continue;
    }
    if (char === '"') {
      if (field) throw new Error('CSV quotes must start at the beginning of a field.');
      quoted = true;
    } else field += char;
  }
  if (quoted) throw new Error('A quoted CSV field is missing its closing quote.');
  endRow();
  if (rows.length && ['pair', 'id', 'cardid'].includes(rows[0][0].trim().toLowerCase()) && rows[0][1]?.trim().toLowerCase() === 'memo') {
    if (rows[0].length !== 2) throw new Error('CSV files need exactly two columns: pair and memo.');
    rows.shift();
  }
  if (rows.some(item => item.length !== 2)) throw new Error('CSV files need exactly two columns: pair and memo.');
  return rows;
}

export function parseMemoChoices(text, { filename = '' } = {}) {
  if (typeof text !== 'string') throw new Error('Memo choices must be text from a JSON or CSV file.');
  if (text.length > MAX_CHOICES_BYTES || new TextEncoder().encode(text).length > MAX_CHOICES_BYTES) {
    throw new Error('Choose a memo file no larger than 2 MB.');
  }
  const content = text.replace(/^\uFEFF/, '').trim();
  const extension = String(filename).split('.').at(-1).toLowerCase();
  const useJSON = extension === 'json' || (extension !== 'csv' && (content.startsWith('{') || content.startsWith('[')));
  const entries = useJSON ? jsonEntries(content) : csvEntries(content);
  const result = {}, seen = new Set();
  for (const [key, memo] of entries) {
    const id = canonicalID(key);
    if (seen.has(id)) throw new Error(`Duplicate memo card: ${id}`);
    seen.add(id);
    if (typeof memo !== 'string' || memo.length > 4000) throw new Error('Each memo must be text of up to 4,000 characters.');
    const value = memo.trim();
    if (value) result[id] = value;
  }
  if (!Object.keys(result).length) throw new Error('Add at least one nonempty memo before importing.');
  return result;
}

export function makeMemoTemplate() {
  return { memos: Object.fromEntries(cards.map(card => [card.pair ?? card.id, ''])) };
}
